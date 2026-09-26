# Quickstart: validating Post-MVP Product Features

Each section maps to one phase and its definition of done. Run a phase's section before starting the next one (Constitution: phase discipline).

## Prerequisites

- The 001 and 002 setups work: Supabase project, `api/.env` with `ASSEMBLYAI_API_KEY`, `web/.env.local`, and a signed-in user (guest mode is fine). The seed is loaded.
- **The uncommitted 002 and UI work is committed first** ([docs/RECONCILE.md](../../docs/RECONCILE.md)).
- Apply `supabase/migrations/0003_post_mvp.sql` ([data-model.md](data-model.md) §1).
- Before Phases C–E: amendment A-1 is committed to `.specify/memory/constitution.md` (see plan.md, Complexity Tracking).

## 0. Regression gate (run after every phase)

```bash
cd api && pytest -q                 # all 001 + 002 suites plus new ones
cd web && npm run build && npm test
```

Expected: every pre-existing test passes unmodified. A test edited to accommodate 003 is a regression unless that test asserted absent behaviour (SC-208). Also confirm by hand that the PROTECTED list in `docs/RECONCILE.md` §3 still behaves: record by voice on STAB-104, dictate a protocol step, and create a protocol from the form.

## 1. Phase A: reliability

```bash
cd api && pytest tests/test_eval.py -q          # scoring unit tests (no network)
python -m eval.run                              # run 3 times, ideally across 2+ commits
ls eval/runs/                                   # expect >= 3 files, none modified afterwards
python -c "import eval.scenarios as s; print(len(s.SCENARIOS))"   # expect >= 50
```

Expected:
- `web/public/eval-history.json` has ≥3 entries.
- `web/public/metrics.json` has a `details` array with one entry per scenario.
- `procedure_hallucination_rate.value == 0`.

Then open `/reliability`. It should show:
- the last-run badge (sha, model, time)
- the category breakdown
- a trend with ≥3 points
- a drill-down on a passing and a failing scenario, each showing the calls made
- a JSON export that is byte-identical to the run file, and a CSV export with one row per scenario

Figures follow the [eval-runs contract](contracts/eval-runs.md).

## 2. Phase B: pages

Reference SQL for Home, run as the demo user or filtered by `owner_id`:

```sql
select
  count(*) filter (where created_at > date_trunc('week', now()))          as this_week,
  count(*) filter (where status = 'RUNNING')                              as running,
  count(*) filter (where status = 'COMPLETED')                            as completed,
  count(*) filter (where exists (select 1 from deviations d where d.experiment_id = e.id)) as with_deviations
from experiments e where owner_id = '<demo user id>';
select count(*) from measurements m join experiments e on e.id = m.experiment_id
 where e.owner_id = '<demo user id>' and m.superseded_by is null;
select count(*) from events ev join experiments e on e.id = ev.experiment_id
 where e.owner_id = '<demo user id>' and ev.voice_session_id is not null;
```

Expected: every Home tile equals its query. Also check:
- **History**: filter status=COMPLETED and protocol=STAB, and sort by date descending. The list shows STAB-102, STAB-101, STAB-100.
- Open **STAB-101** from History. You land on `/experiments/<id>`, the read-only view with 6 temperatures, the timeline and the audit trail. There is **no voice dock and no mutation controls**, and the header voice chip is not bound to STAB-101.
- Open **STAB-104** from History. You land on the unchanged live workspace.

## 3. Phase C: voice lifecycle

```bash
cd api && pytest tests/tools/test_lifecycle.py tests/test_dispatch_scopes.py -q
```

Required cases ([tools-api-v2.md](contracts/tools-api-v2.md)). Every rejection asserts that the `experiments`, `samples` and `events` counts are unchanged.

| Case | Expect |
|---|---|
| create, `confirmed=false` | `NEEDS_CONFIRMATION`, 0 writes |
| create with protocol `STAB` | READY, code `STAB-105`, 1 `EXPERIMENT_CREATED` |
| create, unknown protocol | `PROTOCOL_NOT_FOUND` with alternatives |
| create with two protocols named alike | `AMBIGUOUS_PROTOCOL` |
| code collision (preseed `STAB-105`) | `STAB-106` |
| associate on RUNNING | `EXPERIMENT_ALREADY_STARTED` |
| start, no protocol | `NO_PROTOCOL` |
| start, `confirmed=false` | `NEEDS_CONFIRMATION` |
| start OK | RUNNING, `started_at` set by server |
| `experiment_ref` naming another user's experiment | `EXPERIMENT_NOT_FOUND` (not 403, not a leak) |
| `experiment_id` null with an `experiment`-scope tool | `EXPERIMENT_REQUIRED` |
| `write_protocol_step(new_protocol=true)` on DRAFT | unchanged 001/002 behaviour |

**T-C0, the empirical gate (research R-202)**: open a desk session, send a bench-profile `session.update`, and say "record A17 at 4.2 Celsius" against a bound RUNNING experiment. `record_measurement` must be called. If it is not, stop and escalate.

**End-to-end (the DoD)**:
1. On Home with nothing bound, select **Start voice**.
2. Say "Create an experiment called Enzyme Stability Trial 12". The agent asks which protocol.
3. Say "Use sample stability". The agent reads back a summary. Say "Yes". A DRAFT or READY row appears.
4. Say "Start it". The agent asks for confirmation. Say "Yes". The row is RUNNING, and the workspace opens.
5. Say "What's next?". The agent reads step 1 from the protocol. The `session_id` is unchanged throughout.

## 4. Phase D: comparison

On STAB-104, record "A17 is 4.3 Celsius", then ask "How does that compare with the previous run?".

Expected tool result: `{previous: 4.6, delta: -0.3, pct: -6.5, prev_experiment_code: "STAB-102"}`. The agent speaks those numbers and no others. Also check:
- A sample absent from STAB-102 returns `NO_CORRESPONDING_MEASUREMENT`.
- A fresh STAB experiment with the history removed returns `NO_PREVIOUS_RUN`.

```bash
cd api && pytest tests/tools/test_compare.py -q
```

## 5. Phase E: search, and the audit invariant

```bash
cd api && pytest tests/test_search.py -q     # includes frozen-clock date-range cases per tz
```

By voice from Home:
- "Show my stability experiments this week"
- "Experiments with deviations"
- "Find experiments containing sample A17"

Each result equals `GET /experiments/search` with the same filters, and equals the reference SQL. `resolved.date_range` is spoken as returned.

Audit invariant (the extended 001 query):

```sql
select 'experiment' as kind, x.id from experiments x
 where x.created_at > '<003 deploy time>'
   and not exists (select 1 from events e where e.entity_id = x.id and e.event_type = 'EXPERIMENT_CREATED')
union all
select 'sample', s.id from samples s
 where s.created_at > '<003 deploy time>'
   and not exists (select 1 from events e where e.entity_id = s.id and e.event_type = 'SAMPLE_CREATED');
```

Expected: 0 rows.

## 6. Phase F: live vocabulary

1. Start voice on STAB-104. Note the `session_id` in the dock's debug panel.
2. In the workspace, select **Add sample** and enter `B3`. Within about 1 second, the network log shows a `GET /voice/session-config` request and the socket carries a `session.update` whose keyterms include `B3`. `session.updated` is received.
3. Say "B3 is 4.1 Celsius". The measurement is recorded against B3, and the `session_id` is unchanged.
4. Force a failure by editing the config to include `greeting`. The dock shows "Vocabulary not refreshed", and the session continues.

The eval must include `vocab_*` scenarios where B3 is absent from the prompt (expect `SAMPLE_NOT_FOUND` or a clarifying question) and present (expect a record). The audio keyterm lift figure appears only once the audio harness exists (research R-212).
