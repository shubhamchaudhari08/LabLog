-- Step-scoped completeness (specs/007-step-scoped-completeness data-model §3).
--
-- Additive only: existing deviations keep nulls and nothing is rewritten
-- (Constitution Principle II).
--
-- System-created deviations (a reading outside its step's range, a timed step
-- outside its window) carry a stable source_key, so the event that raises one can
-- run again without logging it twice. User-logged deviations have no key.
alter table deviations add column if not exists code           text;
alter table deviations add column if not exists source_key     text;
alter table deviations add column if not exists measurement_id uuid references measurements(id);

create unique index if not exists deviations_source_key_uniq
  on deviations (experiment_id, source_key)
  where source_key is not null;
