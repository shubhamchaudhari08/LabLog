# Contract — browser reads and change subscriptions

**Status**: FROZEN · **Owner**: Stream A (schema) · **Consumed by**: Stream F (workspace UI)

The browser reads **directly from Supabase** with the anonymous key and the user's session. Reads are not proxied through FastAPI.

## Why reads bypass the backend

Row-level security already enforces exactly the scoping a read proxy would re-implement, and the browser's key carries the user's identity into the database. A proxy would add a hop, a second place for query logic to live, and a second set of types to keep in sync — to arrive at the same rows.

Writes are different and must go through FastAPI, because writes need validation the database cannot express: does this spoken sample code resolve to a real sample, is this unit derivable from the protocol, is this experiment in a state that accepts records. That asymmetry — reads direct, writes validated — is the shape of the system, not an inconsistency in it.

---

## Reads (TanStack Query keys owned by Stream F)

| Key | Query |
|---|---|
| `['experiment', id]` | `experiments` + embedded `protocols` |
| `['samples', id]` | `samples` where `experiment_id`, ordered by `sample_code` |
| `['measurements', id]` | `measurements` where `experiment_id` **and `superseded_by is null`**, ordered by `recorded_at desc`, embedding `samples(sample_code)` |
| `['observations', id]` | `observations` ordered by `recorded_at desc`, embedding `samples(sample_code)` |
| `['deviations', id]` | `deviations` ordered by `created_at desc` |
| `['events', id]` | `events` ordered by `created_at desc`, limit 100 |

`superseded_by is null` on the measurements read is the line that makes corrections work in the UI. Omit it and every correction appears as a duplicate row — the most likely visible bug in Stream F, and one that looks like a backend fault.

### The correction badge

A current measurement was corrected if `correction_reason is not null`. Its previous value comes from the row whose `superseded_by` equals this row's id — fetched lazily on hover or expansion, not in the list query.

---

## Change subscriptions

Subscribe per experiment, filtered server-side:

```ts
supabase.channel(`experiment:${experimentId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'measurements',
        filter: `experiment_id=eq.${experimentId}` },
      handler)
  // ... repeated for observations, deviations, events, experiments
  .subscribe()
```

Tables to subscribe: `measurements`, `observations`, `deviations`, `events`, `experiments`.

The `filter` must be present on every subscription. Without it the client receives changes for every experiment the policy allows and discards them locally — which works, and then does not, the moment the seeded history is added.

### Reconciliation with optimistic updates

Both paths write into the same cache ([research.md R-007](../research.md)):

1. A successful `tool.result` inserts an optimistic row carrying the `measurement_id` the backend returned, plus `_optimistic: true`.
2. The change event arrives and replaces the row **matched by id**, dropping `_optimistic`.
3. **The database always wins** on any field disagreement.
4. A row still `_optimistic` after 10 seconds is rendered as unconfirmed — never silently retained as though it were stored.

Matching by server id rather than by content is what makes step 2 exact. Content matching would mis-pair two measurements of the same type and value taken seconds apart, which is an ordinary occurrence in a lab.

## Changelog

| Date | Change |
|---|---|
| 2026-09-15 | Initial freeze. |
