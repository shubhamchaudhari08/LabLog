# Quickstart — running and validating LabLog

**Feature**: 001-lablog-voice-notebook

How to stand the system up and how to *prove* each integration gate actually passed. Every check below produces an observable outcome; none is satisfied by "it looked right."

This is a validation guide. Implementation belongs in `tasks.md` and the code.

---

## Prerequisites

| Need | Notes |
|---|---|
| Python 3.11+, Node 20+ | |
| A Supabase project | Free tier is sufficient. Note the region — the backend must deploy near it ([research.md R-013](research.md)) |
| An AssemblyAI API key | With Voice Agent API access |
| Supabase CLI | For migrations and seeding |
| **Chromium** | Firefox and Safari cannot force a 24 kHz `AudioContext` ([research.md R-012](research.md)) |
| A working microphone | Browsers require HTTPS or `localhost` for microphone access |

### Environment

`api/.env` — **privileged; never shipped to a browser**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # bypasses row-level security
SUPABASE_JWT_SECRET=            # Supabase → Settings → API → JWT secret
ASSEMBLYAI_API_KEY=
ALLOWED_ORIGINS=http://localhost:3000,https://<vercel-domain>
```

`web/.env.local` — **shipped to the browser; assume it is public**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_APP_URL=
```

**Check this before anything else.** Run from the repository root:

```bash
grep -rn "SERVICE_ROLE\|ASSEMBLYAI_API_KEY\|JWT_SECRET" web/ && echo "FAIL" || echo "PASS"
```

Any hit is a gate G3 violation. This belongs in continuous integration, not in a checklist someone remembers to run.

---

## Setup

```bash
# Database
supabase link --project-ref <ref>
supabase db push                      # applies supabase/migrations/0001_init.sql
# create the demo user in the Supabase dashboard (Auth → Users) first — seed.sql resolves its id
psql "$DATABASE_URL" -f supabase/seed.sql

# Backend
cd api && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Frontend
cd web && npm install && npm run dev
```

---

## Gate 0 — Foundation

**Entry**: Stream 0 complete.

```bash
curl -s http://localhost:8000/health          # → {"status":"ok"}
```

- [ ] Health endpoint responds locally **and** on the deployed backend.
- [ ] The **deployed** frontend reaches the **deployed** backend from a browser with no CORS error in the console. Testing this locally proves nothing — cross-origin failures are a deployment property.
- [ ] The secret-leak grep above passes.
- [ ] `git log` shows the contracts committed.

---

## Gate I1 — Backend truth

**Entry**: Streams A + B + C complete. **Proves**: FR-001, FR-004, FR-005, FR-012 – FR-020.

Get a JWT: sign in to the frontend and copy `access_token` from the Supabase session in devtools.

### 1.1 The happy path

```bash
curl -s -X POST http://localhost:8000/tools \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"tool":"record_measurement","experiment_id":"'$EXP'","session_id":"test",
       "args":{"sample_code":"A17","measurement_type":"temperature","value":4.2,"unit":"C",
               "raw_spoken_value":"A seventeen is four point two Celsius"}}'
```

Expect `success: true` with the stored values echoed back. Then verify in the database, which is the part that matters:

```sql
select m.value, m.unit, m.raw_spoken_value, m.protocol_step_index, s.sample_code
  from measurements m join samples s on s.id = m.sample_id
 where m.superseded_by is null order by m.recorded_at desc limit 1;

select event_type, entity_type, voice_session_id from events order by created_at desc limit 1;
```

- [ ] The measurement row exists with the right sample, value, unit and step index.
- [ ] `recorded_at` is the **server's** time, not anything supplied.
- [ ] A `MEASUREMENT_CREATED` event exists carrying `voice_session_id`.

### 1.2 Rejections — each must produce its specific error

| Call | Expect |
|---|---|
| `sample_code: "A99"` | `SAMPLE_NOT_FOUND`, **with `detail.valid_samples` present** — the agent needs it to suggest |
| `record_measurement` with no `unit`, type with no protocol default | `UNIT_REQUIRED` |
| `value: "NaN"` | `INVALID_VALUE` — not a successful write of a NaN ([data-model.md V4](data-model.md)) |
| An `experiment_id` owned by another user | **HTTP 403**, and **no row created** |
| No `Authorization` header | **HTTP 401** |
| `correct_measurement` for a sample with no prior measurement | `MEASUREMENT_NOT_FOUND` |
| `complete_experiment` with `confirmed: false` | `NEEDS_CONFIRMATION` |
| `complete_experiment` with `confirmed: true`, data missing | `INCOMPLETE` with a populated `detail.missing` |

- [ ] All eight behave as specified.
- [ ] After every rejection, the row count is unchanged. **Check this explicitly** — a handler that validates *after* writing passes every response assertion above while corrupting the database.

### 1.3 Correction preserves history

Record 4.2 for A17, then correct to 4.3:

```sql
select id, value, superseded_by, correction_reason from measurements
 where measurement_type='temperature' order by recorded_at;
```

- [ ] **Two** rows exist. The 4.2 row's `superseded_by` points at the 4.3 row. Nothing was deleted or updated in place.
- [ ] Two events: `MEASUREMENT_CREATED` then `MEASUREMENT_CORRECTED`, the latter carrying both values.
- [ ] The current-values query returns only 4.3.

### 1.4 The completeness invariant (SC-008)

```sql
select count(*) from measurements m
 where not exists (select 1 from events e where e.entity_id = m.id);
```

- [ ] Returns **0**. Any other number means a write path bypassed the dispatcher, which is the one architectural invariant that cannot be allowed to slip.

---

## Gate I2 — Voice loop

**Entry**: Streams B + D + E complete. **Proves**: FR-021 – FR-025. No tools yet.

1. Open the workspace and grant microphone access.
2. Confirm in devtools: `GET /voice/bootstrap` returns 200, the WebSocket opens against `wss://agents.assemblyai.com/v1/ws?token=…`, and `session.ready` arrives.

- [ ] The response contains **no** API key, service role key or JWT secret. Inspect the body directly.
- [ ] Speaking produces grey provisional text that firms up into a committed turn.
- [ ] The agent's greeting is audible and free of clicks or dropouts.
- [ ] Status transitions Ready → Listening → Thinking → Speaking → Listening.
- [ ] `session_id` from `session.ready` is stored.

### 2.1 Barge-in (FR-022, SC-010)

Ask something that produces a long reply, then talk over it.

- [ ] Agent audio stops essentially immediately.
- [ ] **Nothing stale resumes afterwards.** This is the specific failure of forgetting to reset the scheduling cursor ([contracts/aai-websocket.md §7](contracts/aai-websocket.md)) — audio stops, and then several seconds later the discarded tail plays over the next turn.
- [ ] `reply.done` was received with `status: "interrupted"`. If barge-in works but this never appears, the handler is firing on the wrong signal and will break.

### 2.2 Reconnect (FR-025)

Disable the network for five seconds.

- [ ] A degraded state is shown and destructive actions are disabled.
- [ ] On restore: a **fresh** token is minted and `session.resume` is sent with the stored `session_id`.
- [ ] Nothing in the interface claims a save that did not complete.

---

## Gate I3 — The hero path

**Entry**: I1 + I2 + Stream F. **Proves**: the whole product. This is the demo.

Run the full sequence by voice, touching nothing:

| # | Say | Expect |
|---|---|---|
| 1 | *"What's the current experiment?"* | STAB-104 named, current step stated |
| 2 | *"A17 is 4.2 Celsius."* | **Cell updates, then the agent confirms** |
| 3 | *"A18 is 4.1."* | Agent asks for the unit; **no row written yet** |
| 4 | *"Celsius."* | Row written |
| 5 | *"Note that A18 looks slightly cloudy."* | Observation panel, **not** the measurement table |
| 6 | *"Change A17 to 4.3."* | Value becomes 4.3 with a correction badge and the previous value |
| 7 | *"Log a deviation: preparation was delayed forty minutes."* | Amber deviation entry |
| 8 | *"What's next?"* | The stored step. Verify it against `protocols.steps` in the database |
| 9 | *"What chemical should I add next?"* (not in protocol) | **Declines to improvise.** The single most important line in the demo |
| 10 | *"Finish the experiment."* | Completeness check runs; missing items named; completion refused |
| 11 | Supply the missing data, then *"Finish the experiment." → "Yes."* | Status COMPLETED with a server-computed summary |

- [ ] All eleven behave as specified.
- [ ] **Step 2 ordering**: the cell updates *before* the spoken confirmation finishes. If the confirmation lands first, the optimistic patch is not wired and the hero moment is lost ([research.md R-007](research.md)).
- [ ] The timeline shows every action in order, drawn from `events`.
- [ ] Keyboard and mouse were untouched after starting (SC-001).
- [ ] Every value the agent spoke matches what is in the database. Cross-check row by row — an agent confirming values it was *asked* to store rather than values it *did* store is a failure that looks exactly like success.

---

## Gate I4 — Evidence

**Entry**: I1 + Streams G + H. **Proves**: FR-029 – FR-031, SC-003 – SC-007.

```bash
cd api && python -m eval.run --scenarios eval/scenarios.py --out eval/metrics.json
```

- [ ] At least 30 scenarios ran across all seven categories.
- [ ] The harness invoked the **real handler functions**, not mocks — confirm by checking that rows appeared in the disposable test experiment.
- [ ] `metrics.json` matches [contracts/eval-metrics.md](contracts/eval-metrics.md).
- [ ] `procedure_hallucination_rate` is **0.000**. Any other value is a release blocker, not a metric.
- [ ] `false_record_creation_rate` is **0.000**.
- [ ] The dashboard renders those exact numbers, with `scenario_count`, `generated_at` and the failure list visible.
- [ ] Deleting `metrics.json` makes the dashboard say so rather than render a placeholder.

### The question this gate exists to survive

> *"How did you measure 96%?"*

The answer must be: *"`api/eval/run.py`, N scenarios in `eval/scenarios.py`, running the real validation handlers. The repository is public — here are the failures too."* If any displayed figure cannot be traced to that command, remove the figure.

---

## Demo-day checklist

- [ ] Chromium, with the microphone permission already granted.
- [ ] Backend warm — issue a request a minute beforehand. A cold start lands on step 2 (R-013).
- [ ] The database reset to seed state; a rehearsal that left `STAB-104` COMPLETED breaks step 1.
- [ ] Network stable; the audio socket is continuous.
- [ ] Notifications silenced — they steal audio focus mid-turn.
- [ ] Reliability dashboard already loaded in a second tab.
