-- LabLog — demo seed data
--
-- Fixes the two defects in the source brief's seed (data-model.md §Seed):
--   1. '00000000-0000-0000-0000-0000000000p1' is NOT a valid UUID — `p` is not a
--      hexadecimal digit and Postgres rejects the insert outright.
--   2. owner_id was a hard-coded placeholder, which makes the seed
--      irreproducible on a fresh project. It is now resolved at run time from
--      auth.users, so a public repository can be set up from scratch.
--
-- Prerequisite: create the demo user in Supabase (Auth -> Users) first. The
-- seed assigns everything to the earliest-created user — the MVP has one.
-- Runs as plain SQL, so it works from the Supabase SQL editor or psql alike.

do $$
declare
  v_owner    uuid;
  v_protocol uuid := '00000000-0000-0000-0000-000000000001';
  v_exp104   uuid := '00000000-0000-0000-0000-000000000104';
  v_a17      uuid;
  v_a18      uuid;
  v_ctrl     uuid;
  v_exp      uuid;
  v_sample   uuid;
  v_code     text;
  v_base     numeric;
  i          int;
begin
  select id into v_owner from auth.users order by created_at limit 1;

  if v_owner is null then
    raise exception 'No user found. Create the demo user in Supabase (Auth -> Users) before seeding.';
  end if;

  -- Re-running the seed IS the demo reset: children cascade with their experiment.
  delete from experiments where experiment_code in ('STAB-100', 'STAB-101', 'STAB-102', 'STAB-104');

  -- -------------------------------------------------------------------------
  -- Protocol: Sample Stability Evaluation v1 (fictional, safe)
  -- -------------------------------------------------------------------------
  insert into protocols (id, protocol_code, name, version, steps, owner_id)
  values (
    v_protocol, 'STAB', 'Sample Stability Evaluation', 'v1',
    '[
      {"index":0,"id":"register","name":"Register samples","required_fields":[]},
      {"index":1,"id":"initial_temp","name":"Record initial temperature",
       "required_fields":["sample_id","temperature"],
       "default_unit":{"temperature":"C"}},
      {"index":2,"id":"prep_complete","name":"Mark preparation complete","required_fields":[]},
      {"index":3,"id":"second_temp","name":"Record second temperature",
       "required_fields":["sample_id","temperature"],
       "default_unit":{"temperature":"C"}},
      {"index":4,"id":"observation","name":"Add visual observation","required_fields":[]},
      {"index":5,"id":"complete","name":"Complete evaluation","required_fields":[]}
    ]'::jsonb,
    null                      -- library protocol: readable by any owner
  )
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- STAB-104 — the live demo experiment. RUNNING, at step index 1.
  -- -------------------------------------------------------------------------
  insert into experiments (id, experiment_code, name, description, protocol_id,
                           owner_id, status, current_step_index, started_at)
  values (
    v_exp104, 'STAB-104', 'Sample Stability Evaluation Run 104',
    'Fourth stability run in the STAB series.',
    v_protocol, v_owner, 'RUNNING', 1, now() - interval '35 minutes'
  )
  on conflict (id) do nothing;

  insert into samples (experiment_id, sample_code, name, sample_type)
  values (v_exp104, 'A17',        'Aliquot 17',      'experimental'),
         (v_exp104, 'A18',        'Aliquot 18',      'experimental'),
         (v_exp104, 'CONTROL-01', 'Reference blank', 'control')
  on conflict (experiment_id, sample_code) do nothing;

  select id into v_a17  from samples where experiment_id = v_exp104 and sample_code = 'A17';
  select id into v_a18  from samples where experiment_id = v_exp104 and sample_code = 'A18';
  select id into v_ctrl from samples where experiment_id = v_exp104 and sample_code = 'CONTROL-01';

  -- Step 0 (register samples) is already complete, so the demo opens on step 1
  -- with nothing yet recorded — the first spoken measurement is the first row.
  insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id)
  values (v_exp104, 'PROTOCOL_STEP_COMPLETED', 'experiment', v_exp104,
          '{"step_index":0,"step_name":"Register samples"}'::jsonb, v_owner);

  -- -------------------------------------------------------------------------
  -- Historical completed runs, so aggregate views have real data behind them.
  -- -------------------------------------------------------------------------
  for i in 0..2 loop
    v_code := 'STAB-10' || i;
    v_exp  := gen_random_uuid();

    insert into experiments (id, experiment_code, name, protocol_id, owner_id,
                             status, current_step_index, started_at, completed_at)
    values (v_exp, v_code, 'Sample Stability Evaluation Run 10' || i,
            v_protocol, v_owner, 'COMPLETED', 5,
            now() - ((14 - i * 4) || ' days')::interval,
            now() - ((14 - i * 4) || ' days')::interval + interval '52 minutes')
    on conflict (experiment_code) do nothing;

    foreach v_code in array array['A17', 'A18', 'CONTROL-01'] loop
      insert into samples (experiment_id, sample_code, sample_type)
      values (v_exp, v_code,
              case when v_code = 'CONTROL-01' then 'control' else 'experimental' end)
      on conflict (experiment_id, sample_code) do nothing;

      select id into v_sample
        from samples where experiment_id = v_exp and sample_code = v_code;

      -- Plausible spread around 4 °C; the control runs a little tighter.
      v_base := case when v_code = 'CONTROL-01' then 4.0 else 4.0 + (i * 0.1) end;

      insert into measurements (experiment_id, sample_id, measurement_type, value,
                                unit, protocol_step_index, created_by, recorded_at)
      values (v_exp, v_sample, 'temperature', v_base + 0.2, 'C', 1, v_owner,
              now() - ((14 - i * 4) || ' days')::interval + interval '12 minutes'),
             (v_exp, v_sample, 'temperature', v_base + 0.4, 'C', 3, v_owner,
              now() - ((14 - i * 4) || ' days')::interval + interval '38 minutes');
    end loop;

    insert into events (experiment_id, event_type, entity_type, entity_id, payload, actor_id)
    values (v_exp, 'EXPERIMENT_COMPLETED', 'experiment', v_exp,
            '{"seeded":true}'::jsonb, v_owner);
  end loop;

  raise notice 'Seed complete. Demo experiment STAB-104 is RUNNING at step index 1.';
end $$;
