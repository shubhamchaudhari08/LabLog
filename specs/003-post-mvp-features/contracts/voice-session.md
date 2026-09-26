# Contract: Voice session profiles and live refresh

**Status**: DRAFT (FROZEN after T-C0 confirms tool swapping, research R-202) · **Amends**: 001 `voice-bootstrap.md`, `aai-websocket.md` §3

## 1. `GET /voice/bootstrap`: `experiment_id` becomes optional

| Query | Behaviour |
|---|---|
| `?experiment_id=<uuid>` | **Unchanged** for RUNNING and terminal experiments (profile `bench`, 11 existing tools + `compare_with_previous_run`). A DRAFT or READY experiment gets profile `setup`. |
| *(omitted)* | Desk mode: profile `desk`. The prompt has no experiment context and lists the user's protocols (cap 20). `experiment` in the response is `null`. |

Response additions: `"profile": "desk" | "setup" | "bench"`. `greeting` for desk mode is `"LabLog ready. No experiment is open. You can create one, start one, or search your experiments."`.

Authorization happens before the token is minted, in both modes. Desk mode requires only a valid user.

## 2. `GET /voice/session-config`: the refresh (no token)

```http
GET /voice/session-config?experiment_id=<uuid|omitted>
Authorization: Bearer <user JWT>
```

```jsonc
{
  "profile": "bench",
  "experiment": { "id": "…", "code": "STAB-105", "status": "RUNNING" } | null,
  "session": {
    "system_prompt": "…",
    "input": { "keyterms": ["A17", "B3", "STAB-105", "Record initial temperature", "temperature", …] },
    "tools": [ /* tool_schemas(profile) */ ]
  }
}
```

**The payload never contains `greeting`, `output`, `input.format` or `input.turn_detection`.** They are immutable or unchanged, and sending them risks `immutable_field`. It is produced by the same `build_session()` as bootstrap (research R-213). 404/403 semantics are the same as bootstrap.

## 3. Browser refresh procedure (`useVoiceAgent` / `VoiceSession`)

**Triggers**: a successful `tool.result` for `create_experiment`, `associate_protocol`, `start_experiment`, or `write_protocol_step` (any), a successful `POST /experiments/{id}/samples`, and the user opening a different experiment while a desk session is live.

1. If the tool result carries `experiment_id` and the session is unbound or bound elsewhere and still in desk mode, **rebind in place**: set `bound` without ending the session. This extends `bind()`, which today ignores rebinding while live. Rebinding is allowed only from `desk`, never from one experiment to another.
2. Fetch `/voice/session-config` for the bound experiment.
3. Send `{ "type": "session.update", "session": <response.session> }` verbatim. The browser does not author config (R-009).
4. On `session.updated`, record `profileApplied = profile`. The dock shows the vocabulary as refreshed.
5. On `session.error` in reply to it: keep the session and show "Vocabulary not refreshed". Do not retry in a loop, and do not claim success (Principle V).

**Ordering rule**: the `tool.result` for the triggering call MUST be sent **before** the refresh `session.update`. The 001 hard rule on `tool.result` timing still governs (`aai-websocket.md` §6).

**Invariant**: `session_id` is unchanged across a refresh. The quickstart §6 asserts this.
