# LabLog

Voice-native laboratory notebook. Say "A17 is 4.2 Celsius" and a validated,
audited measurement lands in Postgres and on screen while the agent confirms
what was actually stored.

**The public demo can be accessed using the link:** `https://lablog-web.vercel.app`

- **AssemblyAI Voice Agent API** owns the conversation: speech recognition, turn
  detection, reasoning, tool selection, speech and barge-in, over one WebSocket
  that runs browser ↔ AssemblyAI.
- **FastAPI** owns the truth. `POST /tools` is the only write path: verify JWT →
  owner check → Pydantic → semantic validation → write → audit event.
- **No agent framework.** The reasoning loop lives in AssemblyAI's LLM Gateway;
  the backend receives a function call and returns a row. That's a dispatcher,
  and wrapping it in LangGraph would add a layer while giving no control.


## Run it

**1. Supabase.** Create a project and run `supabase/migrations/0001_init.sql`.

Create the demo user under Auth → Users → Add user, with an email **and a
password**, and tick "Auto Confirm User". Then run `supabase/seed.sql`, which
assigns the seeded experiment to that user. Re-running the seed resets the demo.

Put those same credentials in `web/.env.local` as `NEXT_PUBLIC_DEMO_EMAIL` and
`NEXT_PUBLIC_DEMO_PASSWORD`. The app then signs itself in, so reviewers land
straight on the workspace with no login. This is guest mode, not an auth bypass:
a real session is created, so every request still carries a genuine JWT and the
backend's ownership check still runs. Leave both blank to require a real login.

The magic-link form stays at `/login` for real accounts. To use it, add
`http://localhost:3000/dashboard` to Auth → URL Configuration → Redirect URLs.

**2. API.**
```bash
cd api && cp .env.example .env    # fill it in
pip install -r requirements.txt && uvicorn app.main:app --reload
pytest                            # 79 tests, no database needed
```

**3. Web** (Chromium: the mic pipeline forces a 24 kHz AudioContext).
```bash
cd web && cp .env.local.example .env.local   # fill it in
npm install && npm run dev                   # http://localhost:3000
```

**4. Reliability numbers.**
```bash
cd api && python -m eval.run      # 36 scenarios -> web/public/metrics.json -> /reliability
```
The scenarios go through the real system prompt, the real tool schemas and the
real handlers. Only a complete run writes the file, so no half-measured numbers.

## Demo path

"What's the current experiment?" → "A17 is 4.2 Celsius." → "A18 is 4.1." (asks for
the unit) → "Celsius." → "Note A18 looks slightly cloudy." → "Change A17 to 4.3." →
"Log a deviation: prep delayed." → "What's next?" → "What chemical should I add
next?" (declines) → talk over the agent → "Finish the experiment." (lists what's
missing) → record it → "Finish the experiment." → "Yes."

## Timers

A countdown on the current protocol step. Say "start a
timer for 10 minutes", "how long is left?" or "stop the timer". When the current
step's text states one duration ("Centrifuge at 4,000 rpm for 10 minutes"), the
agent offers the timer and starts it only after a yes. The countdown shows beside
its step and in the header on every screen. At zero the app beeps for about three
seconds, then the agent says the timer is complete. On the bench, a timed step
also has **Start timer** and **Cancel** buttons that work without voice.

One timer runs per experiment. Timers exist only on a RUNNING experiment, run
from 5 seconds to 24 hours, and are recorded in the activity log. Durations are
read from digits in the step text: "10 min" is detected, "ten minutes" is not.

## Search and comparison

With no experiment open, voice can find past runs:
"Show my PCR experiments from this week", "Find experiments containing sample A17",
"Which experiments had temperature deviations?", "Open yesterday's enzyme stability
experiment". Filters are fixed: words in the name or protocol, a period (today,
yesterday, this week, last week, this month), status, a sample, and deviations. The
browser sends its time zone with each tool call, and the server works out the dates.
"Open" opens a single match: a finished run read-only, a running run for recording.

During a run, "How does this temperature compare with the previous run?" compares
with the same sample, type and step in the latest completed run of the same protocol.
The backend does the arithmetic and returns the sentence the agent says.



