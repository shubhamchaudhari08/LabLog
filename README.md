# LabLog

Voice-native laboratory notebook. Say "A17 is 4.2 Celsius" and a validated,
audited measurement lands in Postgres and on screen while the agent confirms
what was actually stored.

- **AssemblyAI Voice Agent API** owns the conversation: speech recognition, turn
  detection, reasoning, tool selection, speech and barge-in, over one WebSocket
  that runs browser ↔ AssemblyAI.
- **FastAPI** owns the truth. `POST /tools` is the only write path: verify JWT →
  owner check → Pydantic → semantic validation → write → audit event.
- **No agent framework.** The reasoning loop lives in AssemblyAI's LLM Gateway;
  the backend receives a function call and returns a row. That's a dispatcher,
  and wrapping it in LangGraph would add a layer while giving no control.

Design: [`specs/001-lablog-voice-notebook/`](specs/001-lablog-voice-notebook/plan.md)

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

## Not yet measured

The Phase 0 entity-accuracy spike (spoken sample IDs, with and without
`input.keyterms`) needs a microphone and hasn't been run. Its accuracy figures
belong here.
