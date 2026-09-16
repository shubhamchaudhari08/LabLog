-- LabLog — initial schema
-- Implements specs/001-lablog-voice-notebook/data-model.md
--
-- Seven tables. Protocol steps are embedded as JSONB rather than given their own
-- table: for a fixed, seeded, six-step protocol a steps table buys normalisation
-- nobody needs and costs a join on the hottest read path.
--
-- Corrections are modelled by supersession, never by UPDATE or DELETE
-- (Constitution Principle II). `events` is append-only.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- protocols — the authority on what "next" means. Read, never generated.
-- ---------------------------------------------------------------------------
create table protocols (
  id            uuid primary key default gen_random_uuid(),
  protocol_code text not null,
  name          text not null,
  version       text,
  -- steps: ordered array; `index` must equal array position.
  -- [{ "index":1, "id":"initial_temp", "name":"Record initial temperature",
  --    "required_fields":["sample_id","temperature"],
  --    "default_unit":{"temperature":"C"} }]
  steps         jsonb not null default '[]',
  owner_id      uuid references auth.users(id),   -- null = shared library protocol
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- experiments — owner_id is the authorisation anchor for the whole system.
-- ---------------------------------------------------------------------------
create table experiments (
  id                 uuid primary key default gen_random_uuid(),
  experiment_code    text not null unique,
  name               text not null,
  description        text,
  protocol_id        uuid references protocols(id),
  owner_id           uuid not null references auth.users(id),
  status             text not null default 'DRAFT'
                     check (status in ('DRAFT','READY','RUNNING','PAUSED','COMPLETED','CANCELLED')),
  current_step_index int not null default 0,
  started_at         timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- samples — the resolution target for spoken sample identifiers.
-- ---------------------------------------------------------------------------
create table samples (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  sample_code   text not null,
  name          text,
  sample_type   text default 'experimental',   -- experimental | control
  status        text default 'active',         -- active | consumed
  metadata      jsonb default '{}',
  created_at    timestamptz not null default now(),
  unique (experiment_id, sample_code)
);

-- ---------------------------------------------------------------------------
-- measurements — append-only in effect. superseded_by NULL means "current".
-- ---------------------------------------------------------------------------
create table measurements (
  id                  uuid primary key default gen_random_uuid(),
  experiment_id       uuid not null references experiments(id) on delete cascade,
  sample_id           uuid references samples(id),
  measurement_type    text not null,
  value               numeric not null,        -- finiteness enforced in the handler:
                                               -- Postgres numeric accepts 'NaN'
  unit                text,
  raw_spoken_value    text,                    -- verbatim utterance; provenance
  protocol_step_index int,
  superseded_by       uuid references measurements(id),
  correction_reason   text,
  created_by          uuid references auth.users(id),
  recorded_at         timestamptz not null default now()   -- server-generated (FR-006)
);

-- ---------------------------------------------------------------------------
-- observations — free text. Never coerced to numeric.
-- ---------------------------------------------------------------------------
create table observations (
  id                  uuid primary key default gen_random_uuid(),
  experiment_id       uuid not null references experiments(id) on delete cascade,
  sample_id           uuid references samples(id),   -- nullable: may concern the run
  observation         text not null,
  protocol_step_index int,
  created_by          uuid references auth.users(id),
  recorded_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- deviations
-- ---------------------------------------------------------------------------
create table deviations (
  id                  uuid primary key default gen_random_uuid(),
  experiment_id       uuid not null references experiments(id) on delete cascade,
  protocol_step_index int,
  type                text,                       -- timing | procedure | other
  description         text not null,
  reason              text,
  severity            text default 'medium',      -- low | medium | high
  status              text default 'open',        -- open | resolved
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

-- ---------------------------------------------------------------------------
-- events — append-only audit trail. Written on EVERY mutation, no exceptions.
-- The invariant "every data row has at least one event row" is what proves no
-- write path bypassed the dispatcher.
-- ---------------------------------------------------------------------------
create table events (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references experiments(id) on delete cascade,
  event_type       text not null,   -- MEASUREMENT_CREATED | MEASUREMENT_CORRECTED
                                    -- OBSERVATION_CREATED | DEVIATION_CREATED
                                    -- PROTOCOL_STEP_COMPLETED | EXPERIMENT_COMPLETED
  entity_type      text,
  entity_id        uuid,
  payload          jsonb,
  actor_id         uuid references auth.users(id),
  voice_session_id text,            -- ties a stored value to the conversation
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger experiments_touch
  before update on experiments
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security — owner-scoped.
--
-- CRITICAL: the backend uses the service role key, which BYPASSES all of this.
-- RLS protects the browser's direct reads and Realtime subscriptions. It
-- protects NOTHING on the backend write path — the explicit
-- `experiment.owner_id == user.id` check in the dispatcher is the only control
-- there. See research.md R-006 and Constitution Principle I.
-- ---------------------------------------------------------------------------
alter table protocols    enable row level security;
alter table experiments  enable row level security;
alter table samples      enable row level security;
alter table measurements enable row level security;
alter table observations enable row level security;
alter table deviations   enable row level security;
alter table events       enable row level security;

create policy exp_owner on experiments for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy proto_read on protocols for select
  using (owner_id = auth.uid() or owner_id is null);

create policy samples_by_owner on samples for all
  using (exists (select 1 from experiments e
                  where e.id = samples.experiment_id and e.owner_id = auth.uid()));

create policy meas_by_owner on measurements for all
  using (exists (select 1 from experiments e
                  where e.id = measurements.experiment_id and e.owner_id = auth.uid()));

create policy obs_by_owner on observations for all
  using (exists (select 1 from experiments e
                  where e.id = observations.experiment_id and e.owner_id = auth.uid()));

create policy dev_by_owner on deviations for all
  using (exists (select 1 from experiments e
                  where e.id = deviations.experiment_id and e.owner_id = auth.uid()));

create policy evt_by_owner on events for select
  using (exists (select 1 from experiments e
                  where e.id = events.experiment_id and e.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Indexes
--
-- The partial index matters more than it looks: resolving the current value for
-- a sample/type sits inside a spoken turn for both record_measurement
-- (duplicate detection) and correct_measurement (finding the target). That is
-- the latency a user perceives as the agent hesitating.
-- ---------------------------------------------------------------------------
create index measurements_current_idx
  on measurements (experiment_id, sample_id, measurement_type)
  where superseded_by is null;

create index measurements_recent_idx on measurements  (experiment_id, recorded_at desc);
create index observations_recent_idx on observations  (experiment_id, recorded_at desc);
create index deviations_recent_idx   on deviations    (experiment_id, created_at desc);
create index events_recent_idx       on events        (experiment_id, created_at desc);
create index samples_by_experiment   on samples       (experiment_id, sample_code);
