# Contracts — frozen interfaces

These five documents are the coordination mechanism for parallel work. Every work stream codes against the contract, never against another stream's source. Freeze them before any stream starts (plan.md §Stream 0).

| Contract | Defines | Owner | Consumed by |
|---|---|---|---|
| [aai-websocket.md](aai-websocket.md) | The AssemblyAI Voice Agent wire protocol | External — verified, not designed | E (transport), D (session config) |
| [voice-bootstrap.md](voice-bootstrap.md) | `GET /voice/bootstrap` | D | E |
| [tools-api.md](tools-api.md) | `POST /tools` — all ten tools | C | E, G, F |
| [db-read.md](db-read.md) | Browser reads and change subscriptions | A | F |
| [eval-metrics.md](eval-metrics.md) | `metrics.json` | G | H |

Each contract that carries a `.example.json` fixture is committed with it. Fixtures are how a stream tests against a dependency that does not exist yet.

---

## The change protocol

Contracts will need to change. The AssemblyAI documentation may lag its implementation; the entity-accuracy spike may reshape a stream's brief. When an agent finds a contract wrong:

1. **Stop.** Do not edit the contract and do not work around it locally.
2. **Report** the specific divergence with evidence — a logged event payload, a failing response body, a documentation link.
3. The contract is amended and the change is recorded in its changelog section.
4. Every stream listing that contract as a dependency is notified before it continues.

The failure this prevents: an agent finds a contract wrong, patches around it locally, and ships code that silently disagrees with three other streams until an integration gate fails in a way that takes a day to attribute.

---

## Status

| Contract | Status | Confidence |
|---|---|---|
| aai-websocket.md | Verified against live docs 2026-09-15 | High for message names and shapes; **medium** for exact turn-detection defaults and error-code lists — confirm with the connectivity probe |
| voice-bootstrap.md | Designed | High — entirely under our control |
| tools-api.md | Designed | High — entirely under our control |
| db-read.md | Designed | High |
| eval-metrics.md | Designed | High |

Only the first is an external dependency, and it is the only one that can change without our agreement. This is why the voice-transport stream's first task is a connectivity probe that logs every received event verbatim before any application code is written.
