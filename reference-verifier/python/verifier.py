"""Independent Python reference verifier for nyobakantorai signed execution receipts.

This implementation deliberately does not import, invoke, or consume verdicts from
the JavaScript verifier. It implements the public receipt contract independently.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

RECEIPT_ALG = "Ed25519"
HIGH_IMPACT = {"EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"}
RESULT_STATES = {"SUCCEEDED", "FAILED", "PARTIAL", "BLOCKED"}
RISK_CLASSES = {
    "READ_ONLY",
    "LOCAL_WRITE",
    "EXTERNAL_WRITE",
    "PAID_ACTION",
    "ACCOUNT_CHANGE",
    "DESTRUCTIVE",
}
AUTONOMY_MODES = {"OBSERVE", "GUARDED", "DELEGATED"}
ENVELOPE_KEYS = {
    "schema",
    "alg",
    "key_id",
    "payload",
    "payload_sha256",
    "signature_base64",
}
PAYLOAD_REQUIRED = {
    "schema",
    "receipt_id",
    "task_id",
    "employee_id",
    "action",
    "risk_class",
    "autonomy",
    "authorization",
    "started_at",
    "finished_at",
    "result",
    "runtime",
    "usage",
}
PAYLOAD_ALLOWED = PAYLOAD_REQUIRED | {"capability_id", "previous_receipt_sha256"}
AUTH_REQUIRED = {"allowed", "reason"}
AUTH_ALLOWED = AUTH_REQUIRED | {"approval_ref"}
RESULT_REQUIRED = {"state", "summary", "artifact_refs", "evidence_refs"}
RUNTIME_REQUIRED = {"provider", "runtime_ref"}
RUNTIME_ALLOWED = RUNTIME_REQUIRED | {"provider_version"}
USAGE_REQUIRED = {
    "input_tokens",
    "output_tokens",
    "cost_known",
    "cost_amount",
    "currency",
}
RECEIPT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{5,127}$")
EMPLOYEE_ID_RE = re.compile(r"^[a-z][a-z0-9-]{1,39}$")
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", re.I),
    re.compile(r"\b(?:s" + r"k-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\b(?:password|passwd|api[_ -]?key|secret|token)\s*[:=]\s*\S+", re.I),
)


def canonical_json(value: Any) -> str:
    """Canonical JSON compatible with the current receipt domain.

    Parsed receipt JSON contains only JSON data types. Keys are recursively sorted,
    no insignificant whitespace is emitted, UTF-8 characters remain unescaped, and
    non-finite numbers are rejected.
    """
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def execution_receipt_ref(envelope: Mapping[str, Any]) -> str | None:
    digest = envelope.get("payload_sha256")
    if isinstance(digest, str) and SHA256_RE.fullmatch(digest):
        return f"receipt:sha256:{digest}"
    return None


def _clean(value: Any, max_len: int) -> str:
    return str("" if value is None else value).strip()[:max_len]


def _dedupe(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _now_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = _parse_datetime(value)
        if parsed is None:
            raise ValueError("now must be a valid datetime")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonnegative_int_or_none(value: Any) -> bool:
    return value is None or (
        isinstance(value, int) and not isinstance(value, bool) and value >= 0
    )


def _contains_secret_like(value: Any) -> bool:
    try:
        text = value if isinstance(value, str) else canonical_json(value)
    except (TypeError, ValueError):
        return False
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def validate_payload(
    payload: Any,
    *,
    now: Any,
    max_future_skew_ms: int = 5 * 60 * 1000,
) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["payload must be an object"]

    keys = set(payload)
    missing = sorted(PAYLOAD_REQUIRED - keys)
    extra = sorted(keys - PAYLOAD_ALLOWED)
    if missing:
        errors.append("missing payload fields: " + ",".join(missing))
    if extra:
        errors.append("unexpected payload fields: " + ",".join(extra))

    if payload.get("schema") != 1:
        errors.append("schema must be 1")
    receipt_id = payload.get("receipt_id")
    if not isinstance(receipt_id, str) or not RECEIPT_ID_RE.fullmatch(receipt_id):
        errors.append("invalid receipt_id")
    if not _is_nonempty_string(payload.get("task_id")):
        errors.append("task_id required")
    employee_id = payload.get("employee_id")
    if not isinstance(employee_id, str) or not EMPLOYEE_ID_RE.fullmatch(employee_id):
        errors.append("invalid employee_id")
    if not _is_nonempty_string(payload.get("action")):
        errors.append("action required")

    capability_id = payload.get("capability_id")
    if capability_id is not None and not _is_nonempty_string(capability_id):
        errors.append("capability_id must be null or non-empty")
    if payload.get("risk_class") not in RISK_CLASSES:
        errors.append("invalid risk_class")
    if payload.get("autonomy") not in AUTONOMY_MODES:
        errors.append("invalid autonomy")

    authorization = payload.get("authorization")
    if not isinstance(authorization, dict):
        errors.append("authorization required")
    else:
        auth_keys = set(authorization)
        if AUTH_REQUIRED - auth_keys:
            errors.append("authorization missing required fields")
        if auth_keys - AUTH_ALLOWED:
            errors.append("authorization has unexpected fields")
        if not isinstance(authorization.get("allowed"), bool):
            errors.append("authorization.allowed must be boolean")
        if not _is_nonempty_string(authorization.get("reason")):
            errors.append("authorization.reason required")
        if (
            payload.get("risk_class") in HIGH_IMPACT
            and authorization.get("allowed") is True
            and not _is_nonempty_string(authorization.get("approval_ref"))
        ):
            errors.append("high-impact authorized receipt requires approval_ref")

    started = _parse_datetime(payload.get("started_at"))
    finished = _parse_datetime(payload.get("finished_at"))
    if started is None:
        errors.append("invalid started_at")
    if finished is None:
        errors.append("invalid finished_at")
    if started is not None and finished is not None and finished < started:
        errors.append("finished_at precedes started_at")
    try:
        now_dt = _now_datetime(now)
    except ValueError:
        now_dt = None
    if (
        finished is not None
        and now_dt is not None
        and (finished - now_dt).total_seconds() * 1000 > max_future_skew_ms
    ):
        errors.append("finished_at is too far in the future")

    result = payload.get("result")
    if not isinstance(result, dict):
        errors.append("result required")
    else:
        result_keys = set(result)
        if RESULT_REQUIRED - result_keys:
            errors.append("result missing required fields")
        if result_keys - RESULT_REQUIRED:
            errors.append("result has unexpected fields")
        if result.get("state") not in RESULT_STATES:
            errors.append("invalid result.state")
        if not _is_nonempty_string(result.get("summary")):
            errors.append("result.summary required")
        for name in ("artifact_refs", "evidence_refs"):
            refs = result.get(name)
            if not isinstance(refs, list):
                errors.append(f"result.{name} must be an array")
            elif any(not _is_nonempty_string(item) for item in refs):
                errors.append(f"result.{name} must contain non-empty strings")
            elif len(refs) != len(set(refs)):
                errors.append(f"result.{name} must contain unique items")
        if (
            result.get("state") != "BLOCKED"
            and isinstance(authorization, dict)
            and authorization.get("allowed") is not True
        ):
            errors.append("non-blocked execution result requires authorization.allowed=true")

    runtime = payload.get("runtime")
    if not isinstance(runtime, dict):
        errors.append("runtime required")
    else:
        runtime_keys = set(runtime)
        if RUNTIME_REQUIRED - runtime_keys:
            errors.append("runtime missing required fields")
        if runtime_keys - RUNTIME_ALLOWED:
            errors.append("runtime has unexpected fields")
        if not _is_nonempty_string(runtime.get("provider")):
            errors.append("runtime.provider required")
        if not _is_nonempty_string(runtime.get("runtime_ref")):
            errors.append("runtime.runtime_ref required")

    usage = payload.get("usage")
    if not isinstance(usage, dict):
        errors.append("usage required")
    else:
        usage_keys = set(usage)
        if USAGE_REQUIRED - usage_keys:
            errors.append("usage missing required fields")
        if usage_keys - USAGE_REQUIRED:
            errors.append("usage has unexpected fields")
        if not _is_nonnegative_int_or_none(usage.get("input_tokens")):
            errors.append("input_tokens must be a non-negative integer or null")
        if not _is_nonnegative_int_or_none(usage.get("output_tokens")):
            errors.append("output_tokens must be a non-negative integer or null")
        cost_known = usage.get("cost_known")
        if not isinstance(cost_known, bool):
            errors.append("cost_known must be boolean")
        amount = usage.get("cost_amount")
        currency = usage.get("currency")
        if cost_known is True:
            if (
                not isinstance(amount, (int, float))
                or isinstance(amount, bool)
                or not math.isfinite(float(amount))
                or amount < 0
            ):
                errors.append("known cost requires non-negative finite cost_amount")
            if not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency):
                errors.append("known cost requires ISO-like 3-letter currency")
        elif cost_known is False:
            if amount is not None:
                errors.append("unknown cost must not claim cost_amount")
            if currency is not None and str(currency).strip():
                errors.append("unknown cost must not claim currency")

    previous = payload.get("previous_receipt_sha256")
    if previous is not None and (
        not isinstance(previous, str) or not SHA256_RE.fullmatch(previous)
    ):
        errors.append("invalid previous_receipt_sha256")

    protected = {
        key: payload.get(key)
        for key in (
            "receipt_id",
            "task_id",
            "action",
            "capability_id",
            "authorization",
            "result",
            "runtime",
        )
    }
    if _contains_secret_like(protected):
        errors.append("secret-like content prohibited")

    return errors


def verify_execution_receipt(
    envelope: Any,
    *,
    public_keys: Mapping[str, str] | None = None,
    now: Any,
    max_future_skew_ms: int = 5 * 60 * 1000,
    max_receipt_age_ms: float | None = None,
    consumed_receipt_refs: Iterable[str] | None = None,
    allowed_runtime_providers: Iterable[str] | None = None,
    allowed_runtime_ref_prefixes: Iterable[str] | None = None,
    required_task_id: str | None = None,
    required_employee_id: str | None = None,
    required_capability_id: Any = ...,
    required_result_states: Iterable[str] | None = None,
) -> dict[str, Any]:
    reasons: list[str] = []
    public_keys = public_keys or {}

    if not isinstance(envelope, dict):
        envelope = {}
        reasons.append("ENVELOPE_SHAPE_INVALID")
    elif set(envelope) != ENVELOPE_KEYS:
        reasons.append("ENVELOPE_SHAPE_INVALID")

    if envelope.get("schema") != 1:
        reasons.append("ENVELOPE_SCHEMA_INVALID")
    if envelope.get("alg") != RECEIPT_ALG:
        reasons.append("UNSUPPORTED_ALGORITHM")
    if not _is_nonempty_string(envelope.get("key_id")):
        reasons.append("KEY_ID_MISSING")
    digest = envelope.get("payload_sha256")
    if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
        reasons.append("PAYLOAD_HASH_INVALID")
    if not _is_nonempty_string(envelope.get("signature_base64")):
        reasons.append("SIGNATURE_MISSING")

    payload_errors = validate_payload(
        envelope.get("payload"),
        now=now,
        max_future_skew_ms=max_future_skew_ms,
    )
    reasons.extend(f"PAYLOAD_INVALID:{item}" for item in payload_errors)

    canonical: str | None = None
    try:
        canonical = canonical_json(envelope.get("payload"))
    except (TypeError, ValueError) as exc:
        reasons.append(f"CANONICALIZATION_FAILED:{exc}")

    if canonical is not None and sha256_text(canonical) != digest:
        reasons.append("PAYLOAD_HASH_MISMATCH")

    key_id = envelope.get("key_id")
    public_key_pem = public_keys.get(key_id) if isinstance(key_id, str) else None
    if not _is_nonempty_string(public_key_pem):
        reasons.append("UNTRUSTED_KEY_ID")
    elif canonical is not None and _is_nonempty_string(envelope.get("signature_base64")):
        try:
            signature = base64.b64decode(envelope["signature_base64"], validate=True)
            public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
            if not isinstance(public_key, Ed25519PublicKey):
                raise TypeError("public key is not Ed25519")
            public_key.verify(signature, canonical.encode("utf-8"))
        except InvalidSignature:
            reasons.append("SIGNATURE_INVALID")
        except (ValueError, TypeError, binascii.Error):
            reasons.append("PUBLIC_KEY_OR_SIGNATURE_INVALID")

    payload = envelope.get("payload") if isinstance(envelope.get("payload"), dict) else {}
    if required_task_id is not None and payload.get("task_id") != required_task_id:
        reasons.append("TASK_BINDING_MISMATCH")
    if required_employee_id is not None and payload.get("employee_id") != required_employee_id:
        reasons.append("EMPLOYEE_BINDING_MISMATCH")
    if required_capability_id is not ... and payload.get("capability_id") != required_capability_id:
        reasons.append("CAPABILITY_BINDING_MISMATCH")

    allowed_states = list(required_result_states or [])
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    if allowed_states and result.get("state") not in allowed_states:
        reasons.append("RESULT_STATE_NOT_ALLOWED")

    receipt_ref = execution_receipt_ref(envelope)
    if max_receipt_age_ms is not None:
        if (
            not isinstance(max_receipt_age_ms, (int, float))
            or isinstance(max_receipt_age_ms, bool)
            or not math.isfinite(float(max_receipt_age_ms))
            or max_receipt_age_ms < 0
        ):
            reasons.append("RECEIPT_FRESHNESS_POLICY_INVALID")
        else:
            finished = _parse_datetime(payload.get("finished_at"))
            try:
                now_dt = _now_datetime(now)
            except ValueError:
                now_dt = None
            if (
                finished is not None
                and now_dt is not None
                and (now_dt - finished).total_seconds() * 1000 > max_receipt_age_ms
            ):
                reasons.append("RECEIPT_STALE")

    consumed = {_clean(item, 1000) for item in (consumed_receipt_refs or [])}
    if receipt_ref and receipt_ref in consumed:
        reasons.append("RECEIPT_REPLAYED")

    runtime = payload.get("runtime") if isinstance(payload.get("runtime"), dict) else {}
    provider = _clean(runtime.get("provider"), 120)
    runtime_ref = _clean(runtime.get("runtime_ref"), 512)
    allowed_providers = [_clean(item, 120) for item in (allowed_runtime_providers or [])]
    allowed_providers = [item for item in allowed_providers if item]
    allowed_prefixes = [_clean(item, 512) for item in (allowed_runtime_ref_prefixes or [])]
    allowed_prefixes = [item for item in allowed_prefixes if item]
    if allowed_providers and provider not in allowed_providers:
        reasons.append("RUNTIME_PROVIDER_NOT_ALLOWED")
    if allowed_prefixes and not any(runtime_ref.startswith(prefix) for prefix in allowed_prefixes):
        reasons.append("RUNTIME_REF_NOT_ALLOWED")

    unique_reasons = _dedupe(reasons)
    return {
        "ok": not unique_reasons,
        "decision": "VALID" if not unique_reasons else "INVALID",
        "receipt_ref": receipt_ref,
        "reasons": unique_reasons,
        "payload_sha256": digest if isinstance(digest, str) else None,
        "key_id": key_id if isinstance(key_id, str) else None,
    }


def verify_receipt_packet(packet: Mapping[str, Any]) -> dict[str, Any]:
    expected = packet.get("expected") if isinstance(packet.get("expected"), dict) else {}
    evidence = packet.get("evidence") if isinstance(packet.get("evidence"), dict) else {}
    now = packet.get("now")
    signed_receipts = evidence.get("signed_receipts")
    signed_receipts = signed_receipts if isinstance(signed_receipts, list) else []
    evidence_refs = [
        str(item).strip()
        for item in (evidence.get("refs") if isinstance(evidence.get("refs"), list) else [])
        if str(item).strip()
    ]

    public_keys = (
        expected.get("receipt_public_keys")
        if isinstance(expected.get("receipt_public_keys"), dict)
        else {}
    )
    required_states = expected.get("required_receipt_result_states")
    required_states = required_states if isinstance(required_states, list) else []
    consumed = {
        str(item).strip()
        for item in (
            expected.get("consumed_receipt_refs")
            if isinstance(expected.get("consumed_receipt_refs"), list)
            else []
        )
        if str(item).strip()
    }
    allowed_providers = expected.get("allowed_receipt_runtime_providers")
    allowed_providers = allowed_providers if isinstance(allowed_providers, list) else []
    allowed_prefixes = expected.get("allowed_receipt_runtime_ref_prefixes")
    allowed_prefixes = allowed_prefixes if isinstance(allowed_prefixes, list) else []

    max_age = expected.get("max_execution_receipt_age_ms", packet.get("max_age_ms", 15 * 60 * 1000))
    checks: list[dict[str, Any]] = []
    for envelope in signed_receipts:
        check = verify_execution_receipt(
            envelope,
            public_keys=public_keys,
            now=now,
            max_receipt_age_ms=max_age,
            consumed_receipt_refs=consumed,
            allowed_runtime_providers=allowed_providers,
            allowed_runtime_ref_prefixes=allowed_prefixes,
            required_task_id=_clean(expected.get("task_id"), 160) or None,
            required_employee_id=_clean(expected.get("assignee_id"), 40).lower() or None,
            required_capability_id=(
                expected.get("capability_id")
                if "capability_id" in expected
                else ...
            ),
            required_result_states=required_states or None,
        )
        checks.append(check)
        if check.get("receipt_ref"):
            consumed.add(check["receipt_ref"])

    reasons: list[dict[str, Any]] = []
    require_signed = expected.get("require_signed_execution_receipt") is True
    valid_refs = [check["receipt_ref"] for check in checks if check["ok"] and check["receipt_ref"]]
    invalid = [check for check in checks if not check["ok"]]

    if require_signed and not signed_receipts:
        reasons.append({"code": "SIGNED_EXECUTION_RECEIPT_REQUIRED", "details": []})
    if invalid:
        details: list[str] = []
        for check in invalid:
            details.append(check.get("receipt_ref") or check.get("key_id") or "unknown-receipt")
            details.extend(check["reasons"])
        reasons.append({"code": "SIGNED_EXECUTION_RECEIPT_INVALID", "details": details})
    if require_signed and signed_receipts and not valid_refs:
        reasons.append({"code": "SIGNED_EXECUTION_RECEIPT_MISSING_VALID", "details": []})
    if require_signed:
        missing_refs = [ref for ref in valid_refs if ref not in evidence_refs]
        if missing_refs:
            reasons.append({"code": "SIGNED_RECEIPT_REFERENCE_MISSING", "details": missing_refs})

    return {
        "ok": not reasons,
        "decision": "VERIFIED" if not reasons else "REJECTED",
        "reasons": reasons,
        "signed_receipt_checks": checks,
        "metrics": {
            "signed_receipts_valid": sum(1 for check in checks if check["ok"]),
            "signed_receipts_invalid": sum(1 for check in checks if not check["ok"]),
        },
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Independent Python receipt verifier")
    parser.add_argument("input", type=Path, help="JSON packet containing expected/evidence/now")
    args = parser.parse_args(argv)
    packet = json.loads(args.input.read_text(encoding="utf-8"))
    result = verify_receipt_packet(packet)
    json.dump(result, sys.stdout, ensure_ascii=False, sort_keys=True, indent=2)
    sys.stdout.write("\n")
    return 0 if result["ok"] else 3


if __name__ == "__main__":
    raise SystemExit(_main())
