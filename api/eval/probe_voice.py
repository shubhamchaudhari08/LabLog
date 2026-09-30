"""Live probe: does a desk voice session reach create_experiment? (specs/007 quickstart §4.1)

    cd api && .venv/Scripts/python -m eval.probe_voice

Opens a real AssemblyAI voice session with the real desk configuration (prompt,
keyterms, tool schemas), speaks to it with Windows SAPI speech, and prints the
event sequence. Tool calls run through the real models and handlers against the
in-memory seeded store the eval uses, so nothing reaches the database.

Exit 0: create_experiment was called with confirmed true. Exit 1: the agent
stalled - no reply and no tool call for --stall seconds after the user spoke.
That is what a dropped call looks like: the vendor silently discards a tool call
whose arguments hold a value the user did not say, and a holding agent then
ignores the user (specs/007 research R-716). --tools, --say, --prompt and
--parameters isolate which tool, words or argument trigger it.

Owner-run: it mints a token with ASSEMBLYAI_API_KEY and uses about a minute of
agent time.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

import websockets
from dotenv import load_dotenv

from app.db import get_experiment_context
from app.resolve import readable_protocols
from app.routers.voice import WS_URL, _mint_token, _session_config
from app.tools.prompt import (
    DESK_GREETING,
    build_desk_keyterms,
    build_desk_prompt,
    build_greeting,
    build_keyterms,
    build_prompt,
)
from app.tools.schemas import tool_schemas
from tests.conftest import seeded_store, stability_store

from .run import execute

RATE = 24_000
CHUNK = RATE * 2 // 10  # 100 ms of PCM16 mono
STALL_SECONDS = 35
MAX_SECONDS = 150
QUIET = {"reply.audio", "transcript.user.delta", "input.audio"}


def synthesise(text: str) -> bytes:
    """PCM16 24 kHz mono from Windows SAPI, the sample format the session declares."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "u.wav"
        script = (
            "Add-Type -AssemblyName System.Speech;"
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = -1;"
            "$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000,"
            " [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,"
            " [System.Speech.AudioFormat.AudioChannel]::Mono);"
            f"$s.SetOutputToWaveFile('{path}', $f); $s.Speak($env:PROBE_TEXT); $s.Dispose()"
        )
        env = {**__import__("os").environ, "PROBE_TEXT": text}
        subprocess.run(["powershell", "-NoProfile", "-Command", script], check=True, env=env)
        with wave.open(str(path)) as w:
            assert w.getframerate() == RATE and w.getsampwidth() == 2 and w.getnchannels() == 1
            return w.readframes(w.getnframes())


class Probe:
    def __init__(self, ws, sb, experiment):
        self.ws, self.sb, self.experiment = ws, sb, experiment
        self.t0 = time.monotonic()
        self.speech: asyncio.Queue[bytes] = asyncio.Queue()
        self.ready = asyncio.Event()
        self.reply_open: str | None = None
        self.held: list[dict] = []
        self.last_user_at: float | None = None
        self.activity_at = time.monotonic()
        self.outcome: int | None = None
        self.said: list[str] = []
        self.pending_answer: str | None = None
        self.passed = False
        self.spoke = False
        self.script = [line.strip() for line in ARGS.then.split("|") if line.strip()]

    def log(self, text: str) -> None:
        print(f"{time.monotonic() - self.t0:6.1f}s  {text}", flush=True)

    async def pump(self) -> None:
        """Microphone stand-in: real-time frames, silence when nothing is being said."""
        await self.ready.wait()
        silence = bytes(CHUNK)
        buffer = b""
        while self.outcome is None:
            if not buffer and not self.speech.empty():
                buffer = self.speech.get_nowait() + bytes(RATE * 2 * 2)  # 2 s trailing silence
            frame, buffer = (buffer[:CHUNK], buffer[CHUNK:]) if buffer else (silence, b"")
            frame = frame.ljust(CHUNK, b"\0")
            await self.ws.send(json.dumps({"type": "input.audio", "audio": base64.b64encode(frame).decode()}))
            await asyncio.sleep(0.1)

    def say(self, text: str) -> None:
        self.log(f"USER SAYS  {text!r}")
        self.said.append(text)
        self.speech.put_nowait(synthesise(text))

    async def send_result(self, call_id: str, result: dict) -> None:
        await self.ws.send(json.dumps({"type": "tool.result", "call_id": call_id, "result": json.dumps(result)}))
        self.log(f"-> tool.result {call_id} success={result.get('success')} error={result.get('error')}")

    async def on_tool(self, message: dict) -> None:
        name, args, call_id = message["name"], message.get("arguments") or {}, message["call_id"]
        self.log(f"TOOL.CALL  {name} {json.dumps(args)}")
        result = execute(self.sb, self.experiment, name, args)
        self.log(f"   result {json.dumps(result)[:300]}")
        if name == ARGS.expect and result.get("success") and (name != "create_experiment" or args.get("confirmed")):
            self.passed = True
        elif result.get("error") == "NEEDS_CONFIRMATION":
            self.pending_answer = "Yes"
        # Hold mode has no enclosing reply: send now. Otherwise wait for reply.done (§6).
        if self.reply_open is None:
            await self.send_result(call_id, result)
        else:
            self.held.append({"call_id": call_id, "result": result})

    async def listen(self) -> None:
        async for raw in self.ws:
            message = json.loads(raw)
            kind = message.get("type")
            if kind not in QUIET:
                self.activity_at = time.monotonic()
            if kind == "session.updated" and ARGS.dump_config:
                Path(ARGS.dump_config).write_text(json.dumps(message, indent=1), encoding="utf-8")
                self.log(f"session.updated written to {ARGS.dump_config}")
                self.outcome = 0
                return
            if kind == "session.ready":
                self.log("session.ready")
                self.ready.set()
            elif kind == "transcript.user":
                self.last_user_at = time.monotonic()
                self.log(f"transcript.user  {message.get('text')!r}")
            elif kind == "transcript.agent":
                self.spoke = True
                self.log(f"transcript.agent {message.get('text')!r}")
            elif kind == "reply.started":
                self.spoke = False
                self.reply_open = message.get("reply_id")
                self.log("reply.started")
            elif kind == "reply.done":
                self.log(f"reply.done ({message.get('status')})")
                self.reply_open = None
                for item in self.held:
                    await self.send_result(item["call_id"], item["result"])
                self.held.clear()
                # A reply that only carried a tool call says nothing; the user
                # waits for the spoken answer to it, as a person would.
                if self.spoke:
                    await self.after_reply()
            elif kind == "tool.call":
                await self.on_tool(message)
            elif kind in ("session.error", "error"):
                self.log(f"ERROR {message.get('code')}: {message.get('message')}")
            elif kind not in QUIET:
                extra = {k: v for k, v in message.items() if k != "type"}
                self.log(f"{kind} {json.dumps(extra)[:200]}")

    async def after_reply(self) -> None:
        if self.passed and not self.script:
            self.log(f"PASS: {ARGS.expect} succeeded")
            self.outcome = 0
        elif len(self.said) == 0:
            self.say(ARGS.say)
        elif self.pending_answer:
            self.say(self.pending_answer)
            self.pending_answer = None
        elif self.script:
            self.say(self.script.pop(0))
        elif len(self.said) < 4 and ARGS.profile == "desk":
            self.say("Yes please go ahead")
        else:
            self.log("FAIL: script finished" + ("" if self.passed else f" and {ARGS.expect} never succeeded"))
            self.outcome = 0 if self.passed else 1

    async def watch(self) -> None:
        while self.outcome is None:
            await asyncio.sleep(1)
            now = time.monotonic()
            if now - self.t0 > MAX_SECONDS:
                self.log(f"FAIL: ran out of time without {ARGS.expect} succeeding")
                self.outcome = 1
            elif self.last_user_at and self.reply_open is None and now - self.activity_at > ARGS.stall:
                self.log(f"STALL: no reply and no tool call for {ARGS.stall}s after the user spoke")
                self.outcome = 1


OPENING = (
    "Create an experiment called Probe Run using the Sample Stability Evaluation protocol "
    "with samples A17 as test and A18 as control"
)


async def main() -> int:
    load_dotenv()
    # stability: STAB v1.0 with structured requirements (2 test + 1 control, ranges);
    # seeded: the legacy STAB v1 (temperature for every sample, no composition).
    sb = stability_store() if ARGS.store == "stability" else seeded_store()
    from tests.conftest import OWNER_ID

    if ARGS.profile == "bench":
        experiment = sb.rows("experiments")[0]  # STAB-104, RUNNING at "Record initial temperature"
        ctx = get_experiment_context(sb, experiment["id"], OWNER_ID)
        config = _session_config(
            ARGS.prompt or build_prompt(ctx), build_greeting(ctx), build_keyterms(ctx), tool_schemas("bench")
        )
    else:
        experiment = None
        protocols = readable_protocols(sb, OWNER_ID)
        open_runs = [e for e in sb.rows("experiments") if e.get("status") not in ("COMPLETED", "CANCELLED")]
        config = _session_config(
            ARGS.prompt or build_desk_prompt(protocols, open_runs),
            DESK_GREETING,
            build_desk_keyterms(protocols, open_runs),
            tool_schemas("desk"),
        )
    if ARGS.tools:
        config["tools"] = [t for t in config["tools"] if t["name"] in ARGS.tools.split(",")]
    if ARGS.parameters:  # try another schema for one tool without editing models.py
        tool_name, schema = ARGS.parameters.split("=", 1)
        next(t for t in config["tools"] if t["name"] == tool_name)["parameters"] = json.loads(schema)
    print("tools:", ", ".join(t["name"] for t in config["tools"]))

    token = await _mint_token()
    async with websockets.connect(f"{WS_URL}?token={token}", max_size=None) as ws:
        await ws.send(json.dumps({"type": "session.update", "session": config}))
        probe = Probe(ws, sb, experiment)
        tasks = [asyncio.create_task(c) for c in (probe.listen(), probe.pump(), probe.watch())]
        while probe.outcome is None:
            await asyncio.sleep(0.2)
        await ws.send(json.dumps({"type": "session.end"}))
        for task in tasks:
            task.cancel()
    return probe.outcome


parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument("--profile", choices=["desk", "bench"], default="desk", help="bench binds the seeded STAB-104")
parser.add_argument("--store", choices=["stability", "seeded"], default="stability", help="which seeded protocol")
parser.add_argument("--then", default="", help="what the user says next, one line per agent reply, separated by |")
parser.add_argument("--expect", default="create_experiment", help="the tool that must succeed for a pass")
parser.add_argument("--tools", default="", help="comma-separated subset of the desk tools (default: all)")
parser.add_argument("--say", default=OPENING, help="the first thing the user says")
parser.add_argument("--dump-config", default="", help="write the session.updated echo to this file and stop")
parser.add_argument("--prompt", default="", help="replace the desk system prompt")
parser.add_argument("--parameters", default="", help="TOOL=JSON: replace one tool's parameters with this schema")
parser.add_argument("--stall", type=int, default=STALL_SECONDS, help="seconds of silence that count as a stall")
ARGS = parser.parse_args([])

if __name__ == "__main__":
    ARGS = parser.parse_args()
    sys.exit(asyncio.run(main()))
