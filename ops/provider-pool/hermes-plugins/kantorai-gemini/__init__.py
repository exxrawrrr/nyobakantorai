from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from hermes_constants import get_hermes_home

PLUGIN_NAME = "kantorai-gemini"
DEFAULT_MODELS = ("gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash")
MAX_PROMPT_CHARS = 12000
MODEL_TIMEOUT_SECONDS = 45


def _root_home() -> Path:
    home = get_hermes_home().resolve()
    if home.parent.name.lower() == "profiles":
        return home.parent.parent
    return home


def _shared_gemini_home() -> Path:
    configured = os.environ.get("KANTORAI_GEMINI_HOME", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return _root_home() / "shared" / "gemini-specialist"


def _resolve_hermes_exe() -> str:
    configured = os.environ.get("KANTORAI_HERMES_EXE", "").strip()
    if configured and Path(configured).is_file():
        return configured
    for candidate in ("hermes.exe", "hermes"):
        found = shutil.which(candidate)
        if found:
            return found
    argv0 = Path(sys.argv[0]).resolve()
    if argv0.is_file() and argv0.stem.lower() == "hermes":
        return str(argv0)
    raise RuntimeError("Hermes executable not found. Set KANTORAI_HERMES_EXE.")


def _models() -> tuple[str, ...]:
    raw = os.environ.get("KANTORAI_GEMINI_MODELS", "").strip()
    if not raw:
        return DEFAULT_MODELS
    models = tuple(x.strip() for x in raw.split(",") if x.strip())
    return models or DEFAULT_MODELS


def _classify_failure(text: str) -> str:
    upper = (text or "").upper()
    if "429" in upper or "RESOURCE_EXHAUSTED" in upper or "RATE LIMIT" in upper:
        return "RATE_LIMITED"
    if "503" in upper or "UNAVAILABLE" in upper or "HIGH DEMAND" in upper:
        return "HIGH_DEMAND"
    if "403" in upper or "PERMISSION_DENIED" in upper:
        return "PERMISSION_DENIED"
    return "ERROR"


def _append_receipt(*, model: str, status: str, elapsed_ms: int, prompt: str) -> None:
    try:
        home = _shared_gemini_home()
        log_dir = home / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        receipt = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "profile": get_hermes_home().name,
            "model": model,
            "status": status,
            "elapsed_ms": elapsed_ms,
            "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        }
        with (log_dir / "telegram-gemini-receipts.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(receipt, ensure_ascii=True) + "\n")
    except Exception:
        pass


async def _run_model(exe: str, model: str, prompt: str) -> tuple[bool, str, str]:
    env = os.environ.copy()
    env["HERMES_HOME"] = str(_shared_gemini_home())
    env["HERMES_GEMINI_AQ_STUDIO_PILOT"] = "1"
    specialist_prompt = (
        "You are the Gemini specialist consulted explicitly by KANTORAI. "
        "Answer the user's request directly in the user's language. "
        "Do not claim to be Alex, Siti, or another KANTORAI employee. "
        "Do not claim external actions you did not perform.\n\n"
        + prompt
    )
    kwargs = {}
    if os.name == "nt":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    started = time.monotonic()
    proc = await asyncio.create_subprocess_exec(
        exe,
        "--ignore-rules",
        "--model",
        model,
        "-z",
        specialist_prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        **kwargs,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=MODEL_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        elapsed = int((time.monotonic() - started) * 1000)
        _append_receipt(model=model, status="TIMEOUT", elapsed_ms=elapsed, prompt=prompt)
        return False, "", "TIMEOUT"

    elapsed = int((time.monotonic() - started) * 1000)
    out = stdout.decode("utf-8", errors="replace").strip()
    err = stderr.decode("utf-8", errors="replace").strip()
    combined = "\n".join(x for x in (out, err) if x)
    if proc.returncode == 0 and out:
        _append_receipt(model=model, status="PASS", elapsed_ms=elapsed, prompt=prompt)
        return True, out, "PASS"

    status = _classify_failure(combined)
    _append_receipt(model=model, status=status, elapsed_ms=elapsed, prompt=prompt)
    return False, "", status


async def gemini_command(raw_args: str) -> str:
    prompt = (raw_args or "").strip()
    if not prompt:
        return "Usage: /gemini <pertanyaan>. Contoh: /gemini ringkas tren AI terbaru."

    if len(prompt) > MAX_PROMPT_CHARS:
        return f"Prompt terlalu panjang untuk /gemini (maks {MAX_PROMPT_CHARS} karakter)."

    home = _shared_gemini_home()
    if not (home / "auth.json").is_file():
        return "Gemini specialist belum punya credential lokal. Setup API key perlu dilakukan di mesin operator."

    try:
        exe = _resolve_hermes_exe()
    except Exception as exc:
        return f"Gemini specialist belum siap: {exc}"

    failures: list[tuple[str, str]] = []
    for model in _models():
        ok, output, status = await _run_model(exe, model, prompt)
        if ok:
            return f"🧠 Gemini specialist · {model}\n\n{output}"
        failures.append((model, status))
        if status in {"PERMISSION_DENIED", "ERROR"}:
            break

    summary = ", ".join(f"{m}={s}" for m, s in failures)
    return (
        "⚠️ Gemini specialist belum bisa menjawab turn ini. "
        f"Status: {summary}. Default bot tetap Nous dan tidak diubah."
    )


def register(ctx) -> None:
    ctx.register_command(
        name="gemini",
        handler=gemini_command,
        description="Send one explicit request to the isolated KANTORAI Gemini specialist.",
        args_hint="<prompt>",
        argument_mode="text",
    )
