# Contract — `GET /voice/bootstrap`

**Status**: FROZEN · **Owner**: Stream D · **Consumed by**: Stream E

One call, made once per voice session, that hands the browser everything it needs and nothing it should not have: a credential that expires in minutes and a configuration it did not author.

---

## Request

```http
GET /voice/bootstrap?experiment_id=<uuid>
Authorization: Bearer <user's Supabase access token>
```

## Response — 200

```jsonc
{
  "token": "<AssemblyAI temporary token, single-use, 300s redemption window>",
  "ws_url": "wss://agents.assemblyai.com/v1/ws",
  "experiment": {
    "id": "uuid", "code": "STAB-104", "name": "Sample Stability Evaluation Run 104",
    "status": "RUNNING", "current_step_index": 1
  },
  "session_config": { /* passed verbatim as session.update's `session` — see aai-websocket.md §3 */ }
}
```

| Status | Meaning |
|---|---|
| 401 | Missing or invalid JWT |
| 403 | Authenticated but does not own the experiment |
| 404 | Experiment does not exist |
| 502 | Token minting failed upstream — surface as "voice unavailable", do not retry in a tight loop |

---

## Stream E's obligations

1. Call this endpoint; do not construct a token any other way.
2. Open `ws_url + "?token=" + token`.
3. Send `{"type":"session.update","session":<session_config>}` **verbatim**.
4. Treat `session_config` as opaque. Do not read it, reshape it, merge defaults into it, or persist it.
5. Re-call this endpoint for every reconnect — the token is spent.

The `experiment` block is a convenience so the workspace can render before the socket opens. It is duplicated from the database deliberately; the browser may equally read it directly.

---

## Stream D's obligations

1. Verify the JWT and **authorise ownership before minting a token.** Minting first would let any authenticated user burn AssemblyAI quota against experiments they cannot see.
2. Load the experiment, its protocol and its sample codes.
3. Build `system_prompt` with that context injected.
4. Build `input.keyterms` from the sample codes plus the measurement vocabulary — deduplicated, **capped at 100** ([aai-websocket.md §3](aai-websocket.md)). Sample codes first; they are what the cap exists to protect.
5. Attach `TOOL_SCHEMAS` from Stream C, unmodified.
6. Mint the token with `expires_in_seconds=300`, `max_session_duration_seconds=3600`.
7. **Never** return the API key, the service role key or the JWT secret, in any field, under any condition.

---

## Why the backend authors the session configuration

It keeps tool schemas generated from the Pydantic models that also validate the incoming calls — one declaration, so the schema and the validation cannot drift ([research.md R-010](../research.md)). It keeps prompt engineering in one language and one repository. And it means the prompt or the tool set can change without a frontend deployment, which during a compressed build is the difference between a five-minute iteration and a twenty-minute one.

The browser is reduced to a transport. That is the correct amount of trust to place in a client.

---

## Parallel-work note

This contract is the **only** coupling between Streams D and E. With `voice-bootstrap.example.json` committed, Stream E builds the entire voice loop — microphone, playback, transcripts, barge-in, the pending-results buffer — against the fixture plus a manually minted token, before `routers/voice.py` exists. Stream D tests the *shape* of its response against the same fixture without knowing how the browser uses it.

## Changelog

| Date | Change |
|---|---|
| 2026-09-15 | Initial freeze. |
