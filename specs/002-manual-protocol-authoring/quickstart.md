# Quickstart: validating Manual Protocol Authoring

## Prerequisites

- The 001 setup works (Supabase project, `api/.env`, `web/.env.local`, and a signed-in user).
- Apply the migration: `supabase/migrations/0002_protocol_events.sql` (run it in the SQL editor, or use `supabase db push`).

## 1. API unit tests (no database)

```bash
cd api && pytest tests/test_protocols.py -q
```

Expected: all pass. The cases required by [contracts/protocols-api.md](contracts/protocols-api.md) are:

| Case | Asserts |
|------|---------|
| 3-step valid create | 200 `success:true`; stored `steps` equal the contract example; `owner_id == caller`; 1 `PROTOCOL_CREATED` event |
| body sends `index`/`id`/`owner_id`/`created_at` | ignored; server values stored |
| 0 steps / blank name / blank step name | `INVALID_ARGS`; **protocols and events counts unchanged** |
| duplicate code (own, and library `owner_id=null`, different case) | `PROTOCOL_CODE_TAKEN`; counts unchanged |
| another user's protocol with the same code | allowed (not readable by caller) |
| `pH` with unit `C` | `INVALID_UNIT`, `allowed == ["pH"]`; counts unchanged |
| unlisted type `turbidity` with unit `NTU` | accepted as given |
| duplicate reading in one step | stored once |
| 201 steps | `INVALID_ARGS` |
| no bearer token | 401 |

## 2. End-to-end in the browser

1. `cd api && uvicorn app.main:app --reload` and `cd web && npm run dev`, then sign in.
2. Open **Protocols** and select **New protocol**. The form shows one empty step.
3. Enter code `PCR-02`, name `Colony PCR screen`. Add 5 steps. Give step 1 the reading *temperature* in *C*. Remove step 3. Move step 4 up.
4. Try to leave the page. A confirm prompt appears.
5. Clear the name and select Save. The name field is marked, and nothing appears in the list.
6. Restore the name and select Save. The page lands on `/protocols?id=…` with the new protocol selected and 4 steps in the displayed order. Expanding step 1 shows `temperature · C`.
7. Create another protocol with code `pcr-02`. It is refused with "already used".

## 3. Audit invariant

```sql
select p.id, p.protocol_code
from protocols p
where p.owner_id is not null
  and p.protocol_code not like 'ADHOC-%'
  and not exists (select 1 from events e
                  where e.entity_type = 'protocol' and e.entity_id = p.id
                    and e.event_type = 'PROTOCOL_CREATED');
```

Expected: 0 rows. Seeded rows may be excluded by `created_at`, if the seed creates owned non-ADHOC protocols.

## 4. Voice compatibility (SC-103)

Point a DRAFT or RUNNING experiment's `protocol_id` at the new protocol (SQL is enough, because experiment creation is out of scope). Start a session and say "what's next?". The agent reads step 1 of the form-created protocol verbatim.
