-- LabLog — demo seed data
--
-- Fixes the two defects in the source brief's seed (data-model.md §Seed):
--   1. '00000000-0000-0000-0000-0000000000p1' is NOT a valid UUID — `p` is not a
--      hexadecimal digit and Postgres rejects the insert outright.
--   2. owner_id was a hard-coded placeholder, which makes the seed
--      irreproducible on a fresh project. It is now resolved at run time from
--      auth.users, so a public repository can be set up from scratch.
--
-- specs/007-step-scoped-completeness: the demo protocol is now "Sample Stability
-- Evaluation v1.0" (11 steps, structured requirements, a 14–17 min hold). Its
-- step definitions mirror api/tests/conftest.py STABILITY_STEPS. Requires
-- migration 0003.
--
-- Prerequisite: create the demo user in Supabase (Auth -> Users) first. The
-- seed assigns everything to the earliest-created user — the MVP has one.
-- Runs as plain SQL, so it works from the Supabase SQL editor or psql alike.

do $$
declare
  v_owner    uuid;
  v_legacy   uuid := '00000000-0000-0000-0000-000000000001';  -- STAB v1, six steps
  v_protocol uuid := '00000000-0000-0000-0000-000000000002';  -- STAB v1.0, eleven steps
  v_exp103   uuid := '00000000-0000-0000-0000-000000000103';
  v_exp104   uuid := '00000000-0000-0000-0000-000000000104';
  v_exp      uuid;
  v_sample   uuid;
  v_row      uuid;
  v_code     text;
  v_base     numeric;
  v_start    timestamptz;
  i          int;
  s          int;
begin
  select id into v_owner from auth.users order by created_at limit 1;

  if v_owner is null then
    raise exception 'No user found. Create the demo user in Supabase (Auth -> Users) before seeding.';
  end if;

  -- Re-running the seed IS the demo reset: children cascade with their experiment.
  delete from experiments
   where experiment_code in ('STAB-100', 'STAB-101', 'STAB-102', 'STAB-103', 'STAB-104');

  -- A protocol no run uses can be replaced; one a run uses is a record and stays.
  -- The legacy six-step STAB v1, if still referenced, is renamed so "STAB"
  -- resolves to v1.0 alone.
  delete from protocols p
   where p.id in (v_legacy, v_protocol)
     and not exists (select 1 from experiments e where e.protocol_id = p.id);
  update protocols set protocol_code = 'STAB-V1', name = 'Sample Stability Evaluation (legacy)'
   where id = v_legacy;

  -- -------------------------------------------------------------------------
  -- Protocol: Sample Stability Evaluation v1.0 (fictional, safe)
  --
  -- Every requirement is structured data read by the completeness engine
  -- (api/app/tools/requirements.py); nothing is parsed from a step's name.
  -- required_fields/default_unit are kept for the web's step view.
  -- -------------------------------------------------------------------------
  insert into protocols (id, protocol_code, name, version, steps, owner_id)
  values (
    v_protocol, 'STAB', 'Sample Stability Evaluation', 'v1.0',
    '[
      {"index": 0, "id": "REGISTER_SAMPLES", "name": "Register samples", "required_fields": [], "requirements": [{"type": "samples", "sample_type": "test", "count": 2}, {"type": "samples", "sample_type": "control", "count": 1}]},
      {"index": 1, "id": "INITIAL_TEMP", "name": "Record initial temperature", "required_fields": ["sample_id", "temperature"], "requirements": [{"type": "measurement", "measurement_type": "temperature", "scope": "all_samples", "min": 2, "max": 8, "unit": "C"}], "default_unit": {"temperature": "C"}},
      {"index": 2, "id": "INITIAL_PH", "name": "Record initial pH", "required_fields": ["sample_id", "pH"], "requirements": [{"type": "measurement", "measurement_type": "pH", "scope": "all_samples", "min": 6.5, "max": 7.5}]},
      {"index": 3, "id": "INITIAL_APPEARANCE", "name": "Record initial appearance", "required_fields": [], "requirements": [{"type": "observation", "scope": "all_samples"}]},
      {"index": 4, "id": "START_HOLD", "name": "Start stability hold", "required_fields": []},
      {"index": 5, "id": "STABILITY_HOLD", "name": "Stability hold", "required_fields": [], "expected_duration_seconds": 900, "min_duration_seconds": 840, "max_duration_seconds": 1020, "requirements": [{"type": "step_execution", "must_start": true, "must_complete": true}]},
      {"index": 6, "id": "FINAL_TEMP", "name": "Record final temperature", "required_fields": ["sample_id", "temperature"], "requirements": [{"type": "measurement", "measurement_type": "temperature", "scope": "all_samples", "min": 2, "max": 8, "unit": "C"}], "default_unit": {"temperature": "C"}},
      {"index": 7, "id": "FINAL_PH", "name": "Record final pH", "required_fields": ["sample_id", "pH"], "requirements": [{"type": "measurement", "measurement_type": "pH", "scope": "all_samples", "min": 6.5, "max": 7.5}]},
      {"index": 8, "id": "FINAL_APPEARANCE", "name": "Record final appearance", "required_fields": [], "requirements": [{"type": "observation", "scope": "all_samples"}]},
      {"index": 9, "id": "REVIEW_DEVIATIONS", "name": "Review deviations", "required_fields": [], "requirements": [{"type": "deviation_review"}]},
      {"index": 10, "id": "COMPLETE", "name": "Complete experiment", "required_fields": []}
    ]'::jsonb,
    null                      -- library protocol: readable by any owner
  )
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- STAB-104 — the live demo experiment. RUNNING, at step index 1
  -- (Record initial temperature), nothing yet recorded.
  -- -------------------------------------------------------------------------
  insert into experiments (id, experiment_code, name, description, protocol_id,
                           owner_id, status, current_step_index, started_at)
  values (
    v_exp104, 'STAB-104', 'Sample Stability Evaluation Run 104',
    'Fourth stability run in the STAB series.',
    v_protocol, v_owner, 'RUNNING', 1, now() - interval '5 minutes'
  )
  on conflict (id) do nothing;

  insert into samples (experiment_id, sample_code, name, sample_type)
  values (v_exp104, 'A17',        'Aliquot 17',      'test'),
         (v_exp104, 'A18',        'Aliquot 18',      'test'),
         (v_exp104, 'CONTROL-01', 'Reference blank', 'control')
  on conflict (experiment_id, sample_code) do nothing;

  insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id)
  values (v_exp104, 'PROTOCOL_STEP_COMPLETED', 'experiment', v_exp104,
          '{"step_index":0,"step_name":"Register samples"}'::jsonb, v_owner);

  -- -------------------------------------------------------------------------
  -- STAB-103 — the hold demo (specs/007 research R-705, option A). RUNNING at
  -- step index 5 (Stability hold), initial readings recorded, the hold started
  -- 20 minutes before seeding by the server. Completing the hold on camera
  -- shows a STEP_DURATION_TOO_LONG deviation without waiting 15 minutes.
  -- No API can backdate a start; only this seed does.
  -- -------------------------------------------------------------------------
  v_start := now() - interval '45 minutes';
  insert into experiments (id, experiment_code, name, description, protocol_id,
                           owner_id, status, current_step_index, started_at)
  values (
    v_exp103, 'STAB-103', 'Sample Stability Evaluation Run 103',
    'Hold demo: the stability hold is already running.',
    v_protocol, v_owner, 'RUNNING', 5, v_start
  )
  on conflict (id) do nothing;

  foreach v_code in array array['A17', 'A18', 'CONTROL-01'] loop
    insert into samples (experiment_id, sample_code, sample_type)
    values (v_exp103, v_code, case when v_code = 'CONTROL-01' then 'control' else 'test' end)
    returning id into v_sample;

    insert into measurements (experiment_id, sample_id, measurement_type, value, unit,
                              protocol_step_index, created_by, recorded_at)
    values (v_exp103, v_sample, 'temperature',
            case v_code when 'A17' then 4.2 when 'A18' then 4.4 else 4.1 end, 'C', 1, v_owner,
            v_start + interval '5 minutes')
    returning id into v_row;
    insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id, created_at)
    values (v_exp103, 'MEASUREMENT_CREATED', 'measurement', v_row,
            jsonb_build_object('sample_code', v_code, 'measurement_type', 'temperature', 'step_index', 1), v_owner,
            v_start + interval '5 minutes');

    insert into measurements (experiment_id, sample_id, measurement_type, value, unit,
                              protocol_step_index, created_by, recorded_at)
    values (v_exp103, v_sample, 'pH',
            case v_code when 'A17' then 7.1 when 'A18' then 7.0 else 7.2 end, 'pH', 2, v_owner,
            v_start + interval '10 minutes')
    returning id into v_row;
    insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id, created_at)
    values (v_exp103, 'MEASUREMENT_CREATED', 'measurement', v_row,
            jsonb_build_object('sample_code', v_code, 'measurement_type', 'pH', 'step_index', 2), v_owner,
            v_start + interval '10 minutes');

    insert into observations (experiment_id, sample_id, observation, protocol_step_index, created_by, recorded_at)
    values (v_exp103, v_sample, case v_code when 'A18' then 'slightly cloudy' else 'clear' end, 3, v_owner,
            v_start + interval '15 minutes')
    returning id into v_row;
    insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id, created_at)
    values (v_exp103, 'OBSERVATION_CREATED', 'observation', v_row,
            jsonb_build_object('sample_code', v_code, 'step_index', 3), v_owner, v_start + interval '15 minutes');
  end loop;

  for s in 0..4 loop
    insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id, created_at)
    values (v_exp103, 'PROTOCOL_STEP_COMPLETED', 'experiment', v_exp103,
            jsonb_build_object('step_index', s), v_owner, v_start + (s * 6 || ' minutes')::interval);
  end loop;

  insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id, created_at)
  values (v_exp103, 'PROTOCOL_STEP_STARTED', 'experiment', v_exp103,
          jsonb_build_object('step_index', 5, 'step_code', 'STABILITY_HOLD', 'step_name', 'Stability hold',
                             'started_at', to_jsonb(now() - interval '20 minutes'), 'source', 'seed'),
          v_owner, now() - interval '20 minutes');

  -- -------------------------------------------------------------------------
  -- Historical completed runs, so aggregate views and the previous-run
  -- comparison (specs/006) have real data behind them. Readings sit at the
  -- v1.0 step indices: temperature at 1 and 6, pH at 2 and 7.
  -- -------------------------------------------------------------------------
  for i in 0..2 loop
    v_code := 'STAB-10' || i;
    v_exp  := gen_random_uuid();
    v_start := now() - ((14 - i * 4) || ' days')::interval;

    insert into experiments (id, experiment_code, name, protocol_id, owner_id,
                             status, current_step_index, started_at, completed_at)
    values (v_exp, v_code, 'Sample Stability Evaluation Run 10' || i,
            v_protocol, v_owner, 'COMPLETED', 10,
            v_start, v_start + interval '52 minutes')
    on conflict (experiment_code) do nothing;

    foreach v_code in array array['A17', 'A18', 'CONTROL-01'] loop
      insert into samples (experiment_id, sample_code, sample_type)
      values (v_exp, v_code,
              case when v_code = 'CONTROL-01' then 'control' else 'test' end)
      on conflict (experiment_id, sample_code) do nothing;

      select id into v_sample
        from samples where experiment_id = v_exp and sample_code = v_code;

      -- Plausible spread around 4 °C; the control runs a little tighter.
      v_base := case when v_code = 'CONTROL-01' then 4.0 else 4.0 + (i * 0.1) end;

      insert into measurements (experiment_id, sample_id, measurement_type, value,
                                unit, protocol_step_index, created_by, recorded_at)
      values (v_exp, v_sample, 'temperature', v_base + 0.2, 'C', 1, v_owner, v_start + interval '6 minutes'),
             (v_exp, v_sample, 'pH',          7.1,          'pH', 2, v_owner, v_start + interval '9 minutes'),
             (v_exp, v_sample, 'temperature', v_base + 0.4, 'C', 6, v_owner, v_start + interval '38 minutes'),
             (v_exp, v_sample, 'pH',          7.0,          'pH', 7, v_owner, v_start + interval '41 minutes');
    end loop;

    insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id)
    values (v_exp, 'EXPERIMENT_COMPLETED', 'experiment', v_exp,
            '{"seeded":true}'::jsonb, v_owner);
  end loop;

  raise notice 'Seed complete. STAB-104 is RUNNING at step 2; STAB-103 is mid-hold.';
end $$;
