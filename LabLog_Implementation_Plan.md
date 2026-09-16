# LabLog — End-to-End Implementation Plan (FastAPI edition)

**Voice-Native AI Laboratory Notebook & Experiment Copilot**
Target: AssemblyAI Voice Agent Hackathon (Sep 1–30, 2026) · Solo/small team · Month-long build
**Stack decision: Next.js (frontend) + FastAPI (backend) + Supabase. No agent framework.**

> **How to use this document with Claude Code.** This is a build spec, not code. Work through it **phase by phase** (Section 13). For each phase, paste the relevant sections into Claude Code and ask it to implement *only that phase*, then test the Definition of Done before moving on. Do **not** ask Claude Code to build everything at once.

> **⚠️ API-freshness caveat (read first).** The AssemblyAI **Voice Agent API** launched April 2026. Exact JSON event names, field shapes, and SDK signatures in Sections 7–9 are reconstructed from AssemblyAI's public docs/blogs and **must be verified against the live docs before you rely on them**:
> - Voice Agent API: https://www.assemblyai.com/docs/voice-agents/voice-agent-api
> - Session config, deploy, tool-calling guide (linked from that page)
> - Python reference (streaming): https://www.assemblyai.com/products/streaming-speech-to-text
> - Node/browser reference builds (for the browser audio parts): AssemblyAI blog
>
> **First Claude Code task:** fetch these pages, confirm current event/field names + whether the Python SDK exposes the Voice Agent (vs. raw WebSocket), and correct Sections 7–9 where they differ. Live docs win.

---

## Table of contents
1. Locked scope (MVP vs deferred)
2. What "done" looks like (north-star loop)
3. Architecture (incl. why no LangChain/LangGraph)
4. Tech stack, repo structure, environment
5. Phase 0 — Entity-accuracy spike (do first)
6. Data model (DDL + RLS + seed)
7. AssemblyAI Voice Agent integration
8. Tool definitions (Pydantic → schemas)
9. FastAPI backend + tool handlers
10. Agent system prompt
11. Frontend (components, state, realtime)
12. Eval harness + reliability dashboard
13. Week-by-week build plan
14. Demo script → feature map
15. Risk register
16. Submission checklist
17. Claude Code working agreement

---

## 1. Locked scope (MVP vs deferred)

The product spec's "MVP" lists 17 features. **We are not building that.** We build the single demo loop flawlessly, then extend only if time remains. Claude Code should refuse scope creep against this table.

### MVP — IN (v1 only)

| # | Capability | Why |
|---|---|---|
| 1 | Supabase auth (magic link; one demo account fine) | records need owner + RLS |
| 2 | Seeded demo protocol + experiment + samples + history | removes "create experiment" from critical path |
| 3 | One screen: **Experiment Workspace** | the only screen the video shows |
| 4 | Voice loop: mic in, agent audio out, live partial+final transcript, status, **barge-in** | core AssemblyAI story |
| 5 | Tool calling with **backend validation** | the Application-of-Tech differentiator |
| 6 | Live dashboard update on tool success | the "voice → database → UI" hero causality |
| 7 | Tools: record_measurement, correct_measurement, record_observation, create_deviation, get_next_protocol_step, complete_protocol_step, check_experiment_completeness, complete_experiment, get_active_experiment, get_sample_history | the demo path (§14) |
| 8 | Ambiguity clarification (missing sample / unit / vague value) | reliability moment on camera |
| 9 | Append-only **event/audit trail** + corrections that don't delete | "feels like real lab infra" |
| 10 | Eval harness + **reliability dashboard with real numbers** | highest presentation ROI |

### DEFERRED — OUT of MVP (extend in this order)
1. Reliability dashboard polish / more scenarios (half in MVP already)
2. Barcode-scan-selects-sample (also entity-accuracy insurance — promote if §5 is shaky)
3. Previous-run comparison
4. Dynamic vocabulary / live agent reconfig mid-session
5. Voice experiment search
6. Multi-page dashboard (Home / History / Detail / Protocol Library)
7. Voice experiment creation (seed instead)

### NEVER (hackathon)
Org admin, billing, permissions matrix, LIMS replacement, real instrument drivers, full unit-conversion library, RAG, native mobile, regulatory certification, PDF protocol ingestion.

---

## 2. What "done" looks like (the north-star loop)

```
HEAR      "A17 temperature is 4.3 Celsius."
UNDERSTAND → measurement intent
VALIDATE  → A17 exists? 4.3 numeric? unit resolvable? experiment RUNNING?
ACT       → record_measurement() → FastAPI
RECORD    → measurements row + events row (append-only)
CONFIRM   → dashboard cell updates + agent says "A17 recorded at 4.3 degrees Celsius."
```

**MVP success test:** a new user can, by voice only, record several measurements, log an observation, correct a value, create a deviation, ask "what's next," and complete the experiment with a completeness check — no keyboard.

**Demo reliability targets** (state as *measured*, from the eval harness — never fabricate): measurement recognition ≥95%, correct sample association ≥95%, valid tool execution ≥95%, ambiguous critical actions clarified 100%, **unsupported procedures invented: 0**.

---

## 3. Architecture (incl. why no agent framework)

### Data flow (the crux)

```
① Browser → GET  {API}/voice/bootstrap?experiment_id=… ─► FastAPI (holds AAI key)
     returns { token (single-use), session_config { system_prompt, voice, tools } }
② Browser ── WSS ──► wss://agents.assemblyai.com/v1/ws?token=<token>     (audio stays browser↔AAI)
③ Browser → session.update (session_config from step ①)
④ Mic → AudioWorklet → Int16 PCM 24kHz mono → base64 → audio frames over WS
⑤ AAI → partial/final transcript · agent audio · turn events · tool.call · reply.done
⑥ tool.call → Browser POST {API}/tools  (Authorization: Bearer <supabase JWT>)
                 └─► FastAPI: verify JWT → authorize (owns experiment?) → validate (Pydantic)
                       → write Supabase (service role) → write event → return {success,data|error}
⑦ Browser → tool.result over WS → agent speaks confirmation (2nd pass)
⑧ Supabase write → Realtime → dashboard patches/refetches
⑨ user interrupts → AAI emits stop → Browser flushes audio buffer + restarts output (barge-in)
```

Two services: **Next.js on Vercel** (frontend + browser audio) and **FastAPI** (token + tools + eval). The browser audio WebSocket goes **directly to AssemblyAI** — that never routes through FastAPI. FastAPI is the validated tool/data layer.

### Why this topology
- **Secrets server-side only.** Browser sees a single-use AAI token (expires in seconds) + the user's own Supabase session. It never sees `ASSEMBLYAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
- **The model never touches the DB.** Every mutation goes through a validated FastAPI route. This "never trust the model" layer is the Application-of-Tech differentiator.
- **DB is the source of truth for the UI.** Tool results patch the UI instantly; Supabase Realtime reconciles.

### Why NOT LangChain / LangGraph (state this in the pitch — it's a strength)
With the Voice Agent API, **AssemblyAI owns the agent loop**: the reasoning LLM lives in their stack (routed via their LLM Gateway to Claude/OpenAI/Gemini), and they manage conversation history, turn-taking, in-session context, and *when* to call a tool. Your backend receives a validated function call and returns a row — that's a **dispatcher, not an agent**. LangGraph orchestrates a reasoning loop *you* own; there is no such loop in your process to orchestrate, so it would wrap a single function call for zero control gained. The only way it'd earn its place is if you abandoned the Voice Agent API and hand-rolled STT→your-loop→TTS — which re-implements turn detection, barge-in, and TTS streaming (the exact work the API removes) at a hackathon judged on AssemblyAI usage. So: **Pydantic for tool validation + typed models, a plain dispatcher for routing, AssemblyAI for orchestration and in-session context.** Your "context" (active experiment, samples, protocol state) is ordinary DB state injected into the system prompt at session start and read in handlers — not LLM-framework state.

### Alternative to consider: stored-agent server-side HTTP tools
Because you're on FastAPI (publicly reachable), AssemblyAI's **stored agent with server-side HTTP tools** becomes attractive: create the agent once via REST, register your FastAPI tool endpoints, and AAI calls them **directly** — removing the browser-forwards-tool-call hop (⑥/⑦). Browser still does audio direct to AAI. Needs session correlation and public endpoints (you have both). **Default to browser-forwards-to-FastAPI for control; switch to server-side HTTP tools only if the live docs make it clearly simpler.** Decide in week 2 and document the choice.

---

## 4. Tech stack, repo structure, environment

### Stack (locked)
- **Frontend:** Next.js 14+ (App Router), React, TypeScript, Tailwind, shadcn/ui, Recharts (reliability dashboard), TanStack Query, `@supabase/supabase-js` (auth + Realtime).
- **Voice:** AssemblyAI Voice Agent API (single WebSocket, browser↔AAI).
- **Backend:** **FastAPI** (Python 3.11+), Pydantic v2, `uvicorn`, `httpx`, `supabase` (supabase-py) or SQLModel, `pyjwt`.
- **DB / Auth / Realtime:** Supabase (PostgreSQL).
- **Frontend hosting:** Vercel. **Backend hosting:** Railway / Render / Fly.io — **same region as Supabase**. Submission URL = Vercel app URL.
- **Eval harness:** Python script in `api/eval/`.

### Repo structure (monorepo)
```
lablog/
  web/                              # Next.js frontend
    app/
      (auth)/login/page.tsx
      dashboard/experiments/[id]/page.tsx   # THE workspace screen (MVP)
    components/
      voice/
        VoiceAgent.tsx              # WS lifecycle + orchestration
        useVoiceAgent.ts            # connect, mic, events, tool routing
        audio/micWorklet.ts         # Float32 → Int16 PCM 24k
        audio/player.ts             # PCM playback + barge-in flush
        TranscriptPanel.tsx  VoiceStatus.tsx  MicControl.tsx
      experiment/
        ExperimentHeader.tsx  ProtocolProgress.tsx  SamplePanel.tsx
        MeasurementTable.tsx  ObservationPanel.tsx  DeviationPanel.tsx
        ExperimentTimeline.tsx
      reliability/ReliabilityDashboard.tsx
    lib/
      supabase.ts                   # browser client (anon) — auth + realtime only
      api.ts                        # fetch wrapper → FastAPI (adds Supabase JWT)
    .env.local.example

  api/                              # FastAPI backend
    app/
      main.py                       # app, CORS, routers
      deps.py                       # get_current_user (JWT verify), supabase_admin()
      routers/
        voice.py                    # GET /voice/bootstrap  (token + session_config)
        tools.py                    # POST /tools           (dispatcher)
        experiments.py              # GET reads for dashboard hydration (optional; browser can read Supabase directly)
      tools/
        models.py                   # Pydantic arg models per tool
        schemas.py                  # build OpenAI-compliant TOOL_SCHEMAS from models
        handlers.py                 # validation + DB writes per tool
        prompt.py                   # system prompt builder (§10)
      db.py                         # supabase-py service-role client + queries
      audit.py                      # write_event()
    eval/
      scenarios.py  run.py  metrics.json
    requirements.txt  .env.example  Dockerfile

  supabase/
    migrations/0001_init.sql        # DDL + RLS (§6)
    seed.sql                        # demo protocol/experiment/samples/history
  README.md
```

### Environment variables
```
# web/.env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=            # FastAPI base URL
NEXT_PUBLIC_APP_URL=

# api/.env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # server only
SUPABASE_JWT_SECRET=            # from Supabase project settings → API → JWT secret (HS256)
ASSEMBLYAI_API_KEY=             # server only
ALLOWED_ORIGINS=http://localhost:3000,https://<your-vercel-domain>
```

Rules Claude Code must follow: `ASSEMBLYAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` live **only** in `api/`. The browser only ever holds the anon key + the user's session. Configure **CORS** in FastAPI for the Vercel domain.

---

## 5. Phase 0 — Entity-accuracy spike (DO THIS BEFORE ANYTHING ELSE)

**The biggest technical risk is STT mishearing sample IDs and numbers** — "A17"→"8017", "control one"→"control on", "4.2"→"forty two". Your entire hero demo is spoken alphanumerics. Find out in 48 hours whether it works before building the app.

### Throwaway test rig
A tiny script/page that mints an AAI token, opens the streaming/voice WS, streams mic (or clips), and prints partial+final transcripts with timestamps. (Python SDK streaming example is a fine starting point; verify it exposes what you need.)

### Test matrix (say each ~10×, log accuracy)
| Utterance | Target parse |
|---|---|
| "A seventeen temperature is four point two Celsius" | A17 / 4.2 / C |
| "sample A one seven" vs "sample A seventeen" | A17 (standardize one phrasing) |
| "control one is four point zero" | CONTROL-01 / 4.0 |
| "pH is seven point four" | pH / 7.4 |
| "thirty seven degrees" | 37 / (unit?) |
| "twelve thousand RPM" | 12000 / rpm |

### Decision outputs (write into README)
- **Sample-ID scheme** the ASR handles reliably. If "A17" is unreliable → switch demo IDs to phonetically distinct ones, or **promote barcode-selects-sample to MVP** (ID set visually, voice carries only the value).
- **Number/unit phrasing** conventions for the demo script.
- Whether you need a **normalization layer** in the handler (map "control one/control-one/control 1" → `CONTROL-01` via a per-experiment alias table built from the seeded sample list). Plan for one.

> Strong accuracy → proceed. Shaky → **narrow the input space** (barcode IDs, constrained vocab, confirm-on-write), don't hope. This is the make-or-break gate.

---

## 6. Data model (DDL + RLS + seed)

7 tables. Protocol steps embedded as JSONB (no steps table for MVP). Corrections via `superseded_by`. `events` = append-only audit trail.

### `supabase/migrations/0001_init.sql`
```sql
create extension if not exists "pgcrypto";

create table protocols (
  id            uuid primary key default gen_random_uuid(),
  protocol_code text not null,
  name          text not null,
  version       text,
  -- steps: [{ "index":0,"id":"prepare","name":"Prepare samples",
  --           "required_fields":[],"default_unit":{"temperature":"C"} }]
  steps         jsonb not null default '[]',
  owner_id      uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

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

create table samples (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  sample_code   text not null,
  name          text,
  sample_type   text default 'experimental',
  status        text default 'active',
  metadata      jsonb default '{}',
  created_at    timestamptz not null default now(),
  unique (experiment_id, sample_code)
);

create table measurements (
  id                 uuid primary key default gen_random_uuid(),
  experiment_id      uuid not null references experiments(id) on delete cascade,
  sample_id          uuid references samples(id),
  measurement_type   text not null,
  value              numeric not null,
  unit               text,
  raw_spoken_value   text,
  protocol_step_index int,
  superseded_by      uuid references measurements(id),
  correction_reason  text,
  created_by         uuid references auth.users(id),
  recorded_at        timestamptz not null default now()
);

create table observations (
  id                 uuid primary key default gen_random_uuid(),
  experiment_id      uuid not null references experiments(id) on delete cascade,
  sample_id          uuid references samples(id),
  observation        text not null,
  protocol_step_index int,
  created_by         uuid references auth.users(id),
  recorded_at        timestamptz not null default now()
);

create table deviations (
  id                  uuid primary key default gen_random_uuid(),
  experiment_id       uuid not null references experiments(id) on delete cascade,
  protocol_step_index int,
  type                text,
  description         text not null,
  reason              text,
  severity            text default 'medium',
  status              text default 'open',
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create table events (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references experiments(id) on delete cascade,
  event_type       text not null,
  entity_type      text,
  entity_id        uuid,
  payload          jsonb,
  actor_id         uuid references auth.users(id),
  voice_session_id text,
  created_at       timestamptz not null default now()
);

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger experiments_touch before update on experiments
  for each row execute function touch_updated_at();
```

### RLS (owner-scoped)
```sql
alter table protocols    enable row level security;
alter table experiments  enable row level security;
alter table samples      enable row level security;
alter table measurements enable row level security;
alter table observations enable row level security;
alter table deviations   enable row level security;
alter table events       enable row level security;

create policy exp_owner on experiments for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy proto_read on protocols for select
  using (owner_id = auth.uid() or owner_id is null);
create policy samples_by_owner on samples for all
  using (exists (select 1 from experiments e where e.id = samples.experiment_id and e.owner_id = auth.uid()));
create policy meas_by_owner on measurements for all
  using (exists (select 1 from experiments e where e.id = measurements.experiment_id and e.owner_id = auth.uid()));
create policy obs_by_owner on observations for all
  using (exists (select 1 from experiments e where e.id = observations.experiment_id and e.owner_id = auth.uid()));
create policy dev_by_owner on deviations for all
  using (exists (select 1 from experiments e where e.id = deviations.experiment_id and e.owner_id = auth.uid()));
create policy evt_by_owner on events for select
  using (exists (select 1 from experiments e where e.id = events.experiment_id and e.owner_id = auth.uid()));
```

> **Critical:** FastAPI uses the **service role key**, which **bypasses RLS**. So handlers must **explicitly check** `experiment.owner_id == user_id` on every call (§9). RLS protects the browser's direct Realtime/reads; the explicit check protects writes.

### Seed (`supabase/seed.sql`) — demo dataset
"Sample Stability Evaluation v1" protocol (fictional, safe), one RUNNING experiment `STAB-104` with samples `A17`, `A18`, `CONTROL-01`, plus completed historical `STAB-100/101/102` with measurements so Home stats / comparison look real.
```sql
insert into protocols (id, protocol_code, name, version, steps) values
('00000000-0000-0000-0000-0000000000p1','STAB','Sample Stability Evaluation','v1',
 '[
   {"index":0,"id":"register","name":"Register samples","required_fields":[]},
   {"index":1,"id":"initial_temp","name":"Record initial temperature","required_fields":["sample_id","temperature"],"default_unit":{"temperature":"C"}},
   {"index":2,"id":"prep_complete","name":"Mark preparation complete","required_fields":[]},
   {"index":3,"id":"second_temp","name":"Record second temperature","required_fields":["sample_id","temperature"],"default_unit":{"temperature":"C"}},
   {"index":4,"id":"observation","name":"Add visual observation","required_fields":[]},
   {"index":5,"id":"complete","name":"Complete evaluation","required_fields":[]}
 ]');
-- Experiment STAB-104 (RUNNING) + samples + historical STAB-100..102.
-- Claude Code: fill owner_id with the seeded demo user's uuid at seed time.
```

---

## 7. AssemblyAI Voice Agent integration

> Verify every event/field name here against live docs (top-of-file caveat).

### 7.1 Bootstrap — `GET {API}/voice/bootstrap` (FastAPI, `routers/voice.py`)
Returns a fresh single-use token **and** the server-authored session config (prompt + tools + injected experiment context), so schema/prompt authoring stays in Python and off the client.
```python
# routers/voice.py
from fastapi import APIRouter, Depends
import httpx, os
from ..deps import get_current_user
from ..tools.prompt import build_prompt
from ..tools.schemas import TOOL_SCHEMAS
from ..db import get_experiment_context

router = APIRouter(prefix="/voice")

@router.get("/bootstrap")
async def bootstrap(experiment_id: str, user=Depends(get_current_user)):
    ctx = get_experiment_context(experiment_id, user.id)   # authorize + load context
    async with httpx.AsyncClient() as c:
        r = await c.get("https://agents.assemblyai.com/v1/token",
                        headers={"Authorization": f"Bearer {os.environ['ASSEMBLYAI_API_KEY']}"})
        token = r.json()["token"]     # single-use, expires 1–600s
    return {
        "token": token,
        "session_config": {
            "system_prompt": build_prompt(ctx),
            "voice": "<pick one of 30+ voices>",
            "tools": TOOL_SCHEMAS,
            # audio format keys: PCM16, 24000 Hz, mono, base64 — verify exact key names
            "turn_detection": {},     # neural defaults fine
        },
    }
```

### 7.2 WebSocket connect + session config (browser, `useVoiceAgent.ts`)
```ts
const { token, session_config } = await api.get(`/voice/bootstrap?experiment_id=${id}`);
const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${token}`);
ws.onopen = () => ws.send(JSON.stringify({ type: "session.update", session: session_config })); // verify event name
```
(Alternatively pre-create a **stored agent** via REST and connect by `agent_id`; see §3 alternative.)

### 7.3 Mic capture → PCM16 24kHz mono (`audio/micWorklet.ts`)
`new AudioContext({ sampleRate: 24000 })` (no resampling) → `AudioWorkletNode` converts Float32 → `Int16Array` (clamp [-32768,32767]) → base64 → send as audio message (verify shape, e.g. `{type:"input_audio", audio:"<b64>"}`).

### 7.4 Inbound events (handle all)
| Event (verify) | Action |
|---|---|
| partial user transcript | grey live text in TranscriptPanel |
| final user transcript | commit user turn |
| agent audio chunk (PCM b64) | decode → schedule on AudioContext (player.ts) |
| turn / end-of-turn | update VoiceStatus |
| `tool.call` | route to FastAPI (7.5) |
| `reply.done` | send queued `tool.result`; status→Listening |
| interruption / user-started | **barge-in** flush (7.6) |
| error / session | ⚠ + reconnect (§ below) |

### 7.5 Tool-call routing (browser → FastAPI)
```ts
async function onToolCall(call: { id: string; name: string; arguments: string }) {
  const args = JSON.parse(call.arguments);
  const result = await api.post("/tools", { tool: call.name, args, experiment_id, session_id });
  ws.send(JSON.stringify({ type: "tool.result", tool_call_id: call.id, result })); // verify shape; send after reply.done
}
// api.post attaches Authorization: Bearer <supabase access token>
```

### 7.6 Barge-in playback (`audio/player.ts`)
Queue scheduled `AudioBufferSourceNode`s. On interruption: `.stop()` all, clear queue, reset next-start cursor (flush stale speech), keep listening. **Demo explicitly** (Scene 9).

### 7.7 Reconnect / session resume
On WS drop: show "reconnecting", **disable destructive tool triggers**, keep dashboard state, re-mint token, reconnect, use session resume if docs expose it. Never claim a save that didn't happen.

---

## 8. Tool definitions — Pydantic → OpenAI-compliant schemas

Author tool args as **Pydantic models**, then generate the OpenAI-compliant function schemas AssemblyAI expects. One source of truth for the schema the agent sees *and* the validation the handler runs.

### `api/app/tools/models.py`
```python
from pydantic import BaseModel, Field
from typing import Optional, List

class RecordMeasurementArgs(BaseModel):
    sample_code: str = Field(..., description="e.g. A17, CONTROL-01")
    measurement_type: str = Field(..., description="temperature, mass, volume, pH, concentration, duration, rpm, voltage, current, pressure, humidity, or a numeric type")
    value: float
    unit: Optional[str] = Field(None, description="e.g. C, F, g, mL, rpm. Omit only if the protocol resolves it.")
    raw_spoken_value: Optional[str] = Field(None, description="verbatim of what the user said")

class CorrectMeasurementArgs(BaseModel):
    sample_code: str
    measurement_type: str
    new_value: float
    reason: str = "Voice correction"

class RecordObservationArgs(BaseModel):
    observation: str
    sample_code: Optional[str] = None

class CreateDeviationArgs(BaseModel):
    description: str
    reason: Optional[str] = None
    type: Optional[str] = Field(None, description="timing | procedure | other")

class CompleteProtocolStepArgs(BaseModel):
    step_id: Optional[str] = None

class GetSampleHistoryArgs(BaseModel):
    sample_code: str

class CreateSampleArgs(BaseModel):      # MVP-optional (samples seeded)
    sample_codes: List[str]
    sample_type: str = "experimental"

class CompleteExperimentArgs(BaseModel):
    confirmed: bool

class NoArgs(BaseModel):
    pass

# name -> (model, human description that steers tool selection)
TOOL_REGISTRY = {
  "get_active_experiment":       (NoArgs, "Return current experiment context: id, code, status, protocol, current step, sample codes. Call at session start."),
  "record_measurement":          (RecordMeasurementArgs, "Record ONE numeric measurement for a known sample. Do not call if sample, value, or (when unresolved) unit is missing — ask instead."),
  "correct_measurement":         (CorrectMeasurementArgs, "Correct the latest/specified measurement for a sample. Never deletes; supersedes and keeps history."),
  "record_observation":          (RecordObservationArgs, "Record a non-numeric textual observation. Never store an observation as a measurement."),
  "create_deviation":            (CreateDeviationArgs, "Log a protocol deviation with description and (if known) reason."),
  "get_next_protocol_step":      (NoArgs, "Return the next approved protocol step from stored state. Never invent steps."),
  "complete_protocol_step":      (CompleteProtocolStepArgs, "Mark the current protocol step complete and advance."),
  "get_sample_history":          (GetSampleHistoryArgs, "Return measurements and observations for a sample."),
  "create_sample":               (CreateSampleArgs, "Create sample(s) in the active experiment. (MVP-optional.)"),
  "check_experiment_completeness":(NoArgs, "Return whether all protocol-required fields are recorded; list what's missing. Call before completing."),
  "complete_experiment":         (CompleteExperimentArgs, "Mark experiment COMPLETED. Only after completeness passes AND the user explicitly confirms."),
}
```

### `api/app/tools/schemas.py`
```python
from .models import TOOL_REGISTRY

def _openai_fn(name, model, desc):
    schema = model.model_json_schema()
    schema.pop("title", None)
    return {"type": "function",
            "function": {"name": name, "description": desc, "parameters": schema}}

TOOL_SCHEMAS = [_openai_fn(n, m, d) for n, (m, d) in TOOL_REGISTRY.items()]
```
> If AssemblyAI's expected tool schema differs slightly from OpenAI's (verify), adjust `_openai_fn` only — single choke point.

---

## 9. FastAPI backend + tool handlers

Every handler: **authorize → resolve/normalize → validate → write → audit → return typed result.** The agent's spoken confirmation is driven by what you return.

### Auth dependency — `api/app/deps.py`
```python
import os, jwt
from fastapi import Depends, HTTPException, Header
from supabase import create_client

def supabase_admin():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

class User: 
    def __init__(self, id): self.id = id

async def get_current_user(authorization: str = Header(None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "UNAUTHENTICATED")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, os.environ["SUPABASE_JWT_SECRET"],
                             algorithms=["HS256"], audience="authenticated")
    except Exception:
        raise HTTPException(401, "INVALID_TOKEN")
    return User(id=payload["sub"])
# Alternative: supabase.auth.get_user(token) (network call) instead of local verify.
```

### Dispatcher — `api/app/routers/tools.py`
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError
from ..deps import get_current_user, supabase_admin
from ..tools.models import TOOL_REGISTRY
from ..tools import handlers

router = APIRouter()

class ToolCall(BaseModel):
    tool: str
    args: dict
    experiment_id: str
    session_id: str | None = None

@router.post("/tools")
async def call_tool(body: ToolCall, user=Depends(get_current_user)):
    if body.tool not in TOOL_REGISTRY:
        return {"success": False, "error": "UNKNOWN_TOOL"}
    model, _ = TOOL_REGISTRY[body.tool]
    try:
        args = model(**body.args)                      # Pydantic validation
    except ValidationError as e:
        return {"success": False, "error": "INVALID_ARGS", "detail": e.errors()}

    sb = supabase_admin()
    exp = sb.table("experiments").select("*").eq("id", body.experiment_id).single().execute().data
    if not exp or exp["owner_id"] != user.id:          # EXPLICIT ownership (RLS is bypassed)
        raise HTTPException(403, "FORBIDDEN")

    handler = getattr(handlers, body.tool)
    return handler(sb=sb, exp=exp, user_id=user.id, args=args, session_id=body.session_id)
```

### Validation rules per handler (`api/app/tools/handlers.py`)
**record_measurement**
1. Resolve `sample_code` → sample in this experiment (apply Phase-0 alias/normalization map). Not found → `{"success":False,"error":"SAMPLE_NOT_FOUND","message":"Sample <x> does not exist in <code>."}` (agent asks/suggests nearest).
2. `value` finite number (Pydantic covers type; check finite).
3. Resolve `unit`: provided → use; else protocol step `default_unit[type]`; else `{"success":False,"error":"UNIT_REQUIRED"}` (agent asks "Celsius or Fahrenheit?").
4. Experiment must be `RUNNING`.
5. Insert measurement (`raw_spoken_value`, `protocol_step_index = exp.current_step_index`) → `write_event("MEASUREMENT_CREATED")`.
6. Return `{"success":True,"data":{sample_code,measurement_type,value,unit}}`.

**correct_measurement** — find latest non-superseded (sample,type); none → `MEASUREMENT_NOT_FOUND`. Insert **new** row with `correction_reason`; set original `superseded_by = new.id` (never delete). `write_event("MEASUREMENT_CORRECTED", {from,to})`. Return `{new_value, previous_value}`.

**record_observation** — insert; never coerce numeric. `OBSERVATION_CREATED`.

**create_deviation** — insert (severity medium, status open). `DEVIATION_CREATED`. UI → amber.

**get_next_protocol_step** — read `protocol.steps[current_step_index (+1?)]`. Return `{step_index,name,required_fields}`. **Never generate.** Past last → "final step."

**complete_protocol_step** — advance `current_step_index` (bounded). `PROTOCOL_STEP_COMPLETED`.

**check_experiment_completeness** — for each step with `required_fields`, verify records exist (e.g. temperature for each expected sample). Return `{"complete":bool,"missing":[...]}`.

**complete_experiment** — require `args.confirmed and completeness.complete`; else `{"success":False,"error":"INCOMPLETE","missing":[...]}` or `NEEDS_CONFIRMATION`. On success: status COMPLETED, `completed_at=now()`, `EXPERIMENT_COMPLETED`, return **summary computed in SQL** (durations, counts) — never let the model do arithmetic.

**Timestamps always server-generated.** Reject any tool arg supplying a time. `write_event()` (`audit.py`) appends to `events` on every mutation.

### `api/app/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from .routers import voice, tools, experiments

app = FastAPI()
app.add_middleware(CORSMiddleware,
    allow_origins=os.environ["ALLOWED_ORIGINS"].split(","),
    allow_methods=["*"], allow_headers=["*"])
app.include_router(voice.router)
app.include_router(tools.router)
app.include_router(experiments.router)
```

---

## 10. Agent system prompt (`api/app/tools/prompt.py`)
```
You are LabLog, a laboratory documentation and workflow assistant. You are laboratory
software, not a chatbot and not customer support.

CONTEXT (injected at session start):
- Active experiment: {{experiment_code}} — {{experiment_name}} (status: {{status}})
- Protocol: {{protocol_name}} {{protocol_version}}
- Current step: {{current_step_index+1}} / {{step_count}} — {{current_step_name}}
- Samples: {{sample_codes}}
- Known measurement types: temperature, mass, volume, pH, concentration, duration, rpm,
  voltage, current, pressure, humidity, and arbitrary numeric values.

OBJECTIVES (priority order):
1. Convert valid spoken information into structured records via tools.
2. Follow the registered protocol; report state from tools, never from memory.
3. Detect and ask about missing/ambiguous critical info BEFORE acting.
4. Record deviations rather than silently changing the protocol.
5. Never invent scientific measurements. Never invent laboratory procedure.

HARD RULES:
- Structured data must NEVER be created from unresolved ambiguity. If sample, value, or
  unit is unclear, ASK one concise question instead of guessing.
- Within the active experiment, users need not restate it. "Record 4.2 for A17" is enough.
- Observations (non-numeric) → record_observation, never record_measurement.
- Corrections → correct_measurement (preserves history), never a new measurement.
- For "what's next"/"what step/chemical next", answer ONLY from get_next_protocol_step.
  If not in the approved protocol: "I don't have an approved protocol instruction for that
  step. Please verify the laboratory procedure before continuing." Do not improvise.
- Confirm before sensitive actions (complete/cancel). Complete only after completeness
  passes and the user says yes.
- Trust tool results over assumptions. On a tool error (e.g. SAMPLE_NOT_FOUND), relay it
  helpfully and suggest the nearest known sample.

STYLE: one or two short sentences. The user's hands are busy.
Good: "Recorded. A17 temperature is 4.3 degrees Celsius."
Bad:  "Wonderful! I've successfully recorded ..."
```

---

## 11. Frontend (components, state, realtime)

### Workspace screen (`web/app/dashboard/experiments/[id]/page.tsx`)
```
┌──────────────── ExperimentHeader (code · status · user) ────────────────┐
├───────────────────────┬─────────────────────────────────────────────────┤
│ VoiceAgent            │ ProtocolProgress (✓ done / → current / ○ pending)│
│  VoiceStatus          │                                                   │
│  TranscriptPanel      │                                                   │
│  MicControl / End     │                                                   │
├───────────────────────┼─────────────────────────────────────────────────┤
│ SamplePanel           │ MeasurementTable (shows "corrected" badge)        │
├───────────────────────┴─────────────────────────────────────────────────┤
│ ExperimentTimeline (from events, filterable) · DeviationPanel (amber)     │
└───────────────────────────────────────────────────────────────────────────┘
```

### State model
- **TanStack Query** hydrates panels. Reads come **directly from Supabase** via the browser anon client (RLS enforced) — no need to proxy reads through FastAPI. FastAPI is for token + mutations. (Add `experiments.py` read endpoints only if you prefer a single API surface.)
- **Two update paths, use both:** (1) optimistic — on `tool.result` success, patch the query cache instantly (sub-frame hero moment); (2) canonical — subscribe to **Supabase Realtime** on `measurements/observations/deviations/events/experiments` filtered by `experiment_id` and invalidate/patch.
- VoiceStatus from WS turn/reply events: `Ready → Listening → Processing → Speaking → ⚠`.

### Visual priorities (judged demo)
The **measurement cell updating the instant the value is spoken** is the hero — crisp highlight flash. Corrections show `4.3 °C` with `previous 4.2 · corrected 14:14`. Deviation panel amber + badge. Big type, high contrast, minimal chrome. Read the `frontend-design` skill before building components.

---

## 12. Eval harness + reliability dashboard (`api/eval/`)

Your differentiator and the honest source of the reliability numbers. **Text-level** eval (no audio) tests the meaningful part — tool selection, argument extraction, validation, refusal — and is fully buildable in Python.

### How it works (`eval/run.py`)
1. `eval/scenarios.py` — `{id, utterance, context, expect}` where `expect` = tool name (or `clarify`/`refuse`), expected args, or expected backend error.
2. For each scenario: send utterance + system prompt + `TOOL_SCHEMAS` to the **AssemblyAI LLM Gateway** (same model the voice agent uses; OpenAI-compatible — verify endpoint) with tools enabled. Capture the tool call; if any, run it through the **real handler** against a disposable test experiment.
3. Compare to `expect`; record pass/fail per metric → write `eval/metrics.json` (consumed by `ReliabilityDashboard.tsx`).

### Scenarios (build these)
| Scenario | Utterance | Expected |
|---|---|---|
| normal | "Record A17 temperature as 4.2 Celsius" | record_measurement{A17,temperature,4.2,C} |
| missing sample | "Temperature is 4.2 Celsius" (3 samples) | clarify |
| missing unit | "A17 is 37" (no default) | clarify |
| correction | "Actually make that 4.3" | correct_measurement (not 2nd measurement) |
| unknown sample | "A99 is 4.1" | backend SAMPLE_NOT_FOUND handled |
| obs vs measurement | "A18 looks cloudy" | record_observation |
| unsupported procedure | "What chemical next, not in protocol?" | refuse |
| completeness | "Finish the experiment" (missing data) | check_experiment_completeness first |

### Metrics (computed, then displayed)
Tool-selection accuracy · argument accuracy · measurement-extraction accuracy · sample-ID accuracy · ambiguity-clarification rate · **false-record-creation rate** · **procedure-hallucination rate (target 0)** · task-completion rate · backend-rejection-correctness. Run 30–50 (with paraphrase variants) so numbers mean something.

> Dashboard shows **real** `run.py` output. "How did you measure 96%?" → "this script, N scenarios, public repo."

---

## 13. Week-by-week build plan
Start ~Sep 4, deadline Sep 30. Each phase: Definition of Done (DoD) + cut line.

### Week 1 (Sep 4–10) — De-risk + two-service skeleton + raw voice loop
- **Phase 0 (Days 1–2):** entity-accuracy spike (§5). Gate: lock sample-ID scheme; promote barcode if needed.
- Scaffold `web/` (Vercel) + `api/` (Railway/Render/Fly, **same region as Supabase**). **Deploy both empty now** so URLs + CORS work. Wire `web/lib/api.ts` → FastAPI with Supabase JWT.
- Run migration + seed. Supabase auth (one demo user). Static workspace reading seeded data (no voice).
- Raw voice loop: `/voice/bootstrap`, WS connect, mic→PCM, play agent audio, live transcript. Agent talks, no tools.
- **DoD:** speak to agent, hear reply in browser; dashboard shows seeded experiment; frontend↔backend calls work cross-origin. **Cut line:** voice loop not up by Day 7 → stop all UI work, fix voice.

### Week 2 (Sep 11–17) — Tool calling end-to-end (make-or-break)
- `/tools` dispatcher + Pydantic models + handlers for get_active_experiment, record_measurement, correct_measurement, record_observation. Full validation + events.
- Wire `tool.call` → `/tools` → `tool.result`. Optimistic patch + Supabase Realtime.
- Decide browser-forwarded vs stored-agent server-side tools (§3); document it.
- Ambiguity behavior (missing sample/unit → clarify) on camera.
- **DoD:** "A17 is 4.2 Celsius" → cell updates + spoken confirm; "make that 4.3" → correction w/ audit; ambiguous → clarifying question. **Cut line:** if one tool is reliable, make it record_measurement.

### Week 3 (Sep 18–24) — Complete demo path + reliability behaviors
- Remaining tools: create_deviation, get_next_protocol_step, complete_protocol_step, check_experiment_completeness, complete_experiment (+ SQL summary), get_sample_history.
- **Barge-in** flush demoable (Scene 9). Protocol progress + deviation panel + timeline polished. Reconnect state.
- **DoD:** full §14 demo runs start-to-finish, no keyboard. **Cut line:** drop get_sample_history + create_sample first; keep deviation + completion gate.

### Week 4 (Sep 25–30) — Eval, dashboard, demo, submit
- Build `api/eval/`, run 30–50 scenarios, wire ReliabilityDashboard.
- Seed historical experiments for realistic stats.
- **Record demo video** (≤5 min, §14) by Day 28 (buffer to re-record).
- README (setup for both services + architecture + "why AssemblyAI is central" + "why no agent framework"), pitch deck (§72 narrative), public GitHub with **steady commits**, Vercel URL live.
- **Submit by Sep 29.** **Cut line:** eval unfinished → show harness + partial scenarios honestly, never fake numbers.

> Commit daily from Week 1. Empty repo + one final push = red flag.

---

## 14. Demo script → feature map (≤5-min video)
| Scene | Say | Proves | Tool(s) |
|---|---|---|---|
| 1 Problem | (voiceover, gloves) | framing | — |
| 2 Start | "Start experiment STAB-104." | context load | get_active_experiment |
| 3 Record | "A17 is 4.2 Celsius." | voice→DB→UI hero | record_measurement |
| 4 Ambiguity | "A18 is 4.1." → "Celsius?" | reliability | clarify → record |
| 5 Observation | "Note A18 looks slightly cloudy." | obs ≠ measurement | record_observation |
| 6 Correction | "Change A17 to 4.3." | audit trail | correct_measurement |
| 7 Deviation | "Log a deviation: prep delayed." | workflow depth | create_deviation |
| 8 Grounding | "What's next?" | no hallucinated steps | get_next_protocol_step |
| 9 Interrupt | (talk over agent) | AssemblyAI barge-in | — |
| 10 Finish | "Finish the experiment." → completeness → "Yes." | integrity gate | check_completeness → complete_experiment |
| Coda | show Reliability Dashboard | measured reliability | eval output |

Close on Problem / Insight / Solution / Differentiator; add one real scientist quote if you can get one.

---

## 15. Risk register
| Risk | Severity | Mitigation |
|---|---|---|
| STT mishears sample IDs/numbers | **High** | Phase 0 gate; normalization/alias map; barcode fallback; confirm-on-write |
| Voice Agent API wire format differs | **High** | First task: verify docs; isolate in `useVoiceAgent` |
| Scope creep (17-feature temptation) | **High** | §1 contract; cut lines |
| Two-service ops (CORS, cold starts, latency, JWT) | Medium | Deploy both week 1; same region; keep FastAPI warm (Railway/Render always-on or ping); test cross-origin early |
| Tool round-trip latency drags demo | Medium | Fast handlers; optimistic patch; indexed queries; backend near Supabase |
| Reliability numbers questioned | Medium | Real Python eval harness; public repo |
| "This is just LabTwin" | Medium | Position as real-time conversational agent on AssemblyAI 2026 Voice Agent API + validation/eval layer; incumbents = market validation |
| Domain authenticity | Medium | One real scientist quote |
| Solo bandwidth over a month | Medium | Deploy early, commit daily, submit Sep 29 |

---

## 16. Submission checklist (lablab)
- [ ] Working prototype at public URL (Vercel) with demo login/guest mode
- [ ] Pitch video ≤5 min (MP4): problem → live demo (§14) → business case
- [ ] Slide deck (PDF): narrative + architecture + reliability metrics
- [ ] Public GitHub repo (both `web/` and `api/`) with README + steady commits
- [ ] AssemblyAI usage explicit (real-time STT, turn detection, barge-in, tool calling, voice out)
- [ ] Correct technology/category tags on submission
- [ ] Company email at registration if available

---

## 17. Claude Code working agreement
Standing instructions each session:
1. **Verify the AssemblyAI wire format against live docs before writing voice code.** §§7–9 are a reconstruction; docs win. Also check whether the Python SDK exposes the Voice Agent API or you use a raw WebSocket.
2. **Build only the current phase (§13).** No deferred features. Ask before adding.
3. **`ASSEMBLYAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` live only in `api/`.** Browser holds anon key + user session. Configure CORS for the Vercel domain.
4. **No LangChain/LangGraph or agent framework.** AssemblyAI owns the agent loop; the backend is a validated dispatcher. Pydantic for validation, plain functions for routing.
5. **The model never writes to the DB directly.** Every mutation goes through `/tools` with authorize→validate→write→audit→return (§9), and an explicit `owner_id == user_id` check (service role bypasses RLS).
6. **Server-generate all timestamps.** Reject any tool arg supplying a time.
7. **Corrections supersede, never delete.** Every mutation writes an `events` row.
8. **Tool schema has one source of truth:** Pydantic models → `_openai_fn` (§8). Change the wrapper, not hand-written JSON.
9. **Test the phase's DoD before moving on;** write the eval scenario alongside the tool it tests.
10. **Commit after each working increment**, clear messages.
11. Ambiguity (unit/sample/value) → the agent **asks**; implement the handler errors (`UNIT_REQUIRED`, `SAMPLE_NOT_FOUND`) that make that behavior possible.

Suggested first prompt to Claude Code:
> "Read `LabLog_Implementation_Plan.md`. Start with Phase 0 (§5): build a throwaway entity-accuracy test rig for the AssemblyAI streaming/voice API, and separately fetch the current Voice Agent API docs and correct §§7–9 where they differ (including whether the Python SDK exposes the Voice Agent API). Do not build the app yet. Then scaffold the two-service skeleton (`web/` Next.js + `api/` FastAPI) and deploy both empty with CORS working."
