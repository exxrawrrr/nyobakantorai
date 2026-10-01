#!/usr/bin/env python3
"""Independent verifier for canonical live portability run records.

This implementation does not import, invoke, or consume a JavaScript comparator verdict.
It reads the public reference manifest/contracts and independently verifies one run.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

IMPLEMENTATION_ID = "python-portability-run-verifier-v1"
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
GIT_SHA_RE = re.compile(r"^[a-f0-9]{40}$")
PRIVATE_PATH_PATTERNS = [
    re.compile(r"[A-Za-z]:\\\\Users\\\\[^\\\\\s]+", re.I),
    re.compile(r"[A-Za-z]:\\\\[^\s\"'<>]+", re.I),
    re.compile(r"/home/[^/\s]+/", re.I),
    re.compile(r"/Users/[^/\s]+/", re.I),
]
SECRET_VALUE_RE = re.compile(r"(?:OPENAI_API_KEY|GITHUB_TOKEN|GH_TOKEN|HERMES_HOME|NYOBAKANTORAI_HERMES_HOME)\s*[:=]", re.I)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def protected_value(output: Any, path: str) -> Any:
    parts = [p for p in str(path).split(".") if p]
    current = output
    i = 0
    while i < len(parts):
        part = parts[i]
        if part == "claims" and isinstance(current, dict) and isinstance(current.get("claims"), list) and i + 1 < len(parts):
            claim_id = parts[i + 1]
            current = next((item for item in current["claims"] if isinstance(item, dict) and item.get("claim_id") == claim_id), None)
            i += 2
            continue
        if not isinstance(current, dict):
            return None
        current = current.get(part)
        i += 1
    return current


def accepted_values(atom: dict[str, Any]) -> list[Any]:
    values = atom.get("accepted")
    if isinstance(values, list) and values:
        return values
    return [atom.get("expected")]


def public_safety_findings(record: Any) -> list[str]:
    serialized = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
    findings: list[str] = []
    if SECRET_VALUE_RE.search(serialized):
        findings.append("CREDENTIAL_OR_PRIVATE_ENV_NAME_VALUE")
    if any(pattern.search(serialized) for pattern in PRIVATE_PATH_PATTERNS):
        findings.append("PRIVATE_MACHINE_PATH")
    return sorted(set(findings))


def verify_run(run: dict[str, Any], *, raw_bytes: bytes, root: Path) -> dict[str, Any]:
    manifest = load_json(root / "benchmarks/portability/reference-case/manifest.json")
    contract = load_json(root / "benchmarks/portability/reference-case/verification-contract.json")
    source = load_json(root / "benchmarks/portability/reference-case/source-artifact.json")
    reasons: list[str] = []
    checks: list[dict[str, Any]] = []

    def check(check_id: str, condition: bool, reason: str) -> None:
        checks.append({"id": check_id, "passed": bool(condition)})
        if not condition:
            reasons.append(reason)

    check("schema", run.get("schema") == 1, "RUN_SCHEMA_INVALID")
    check("reference_case", run.get("reference_case_id") == manifest.get("reference_case_id"), "REFERENCE_CASE_ID_MISMATCH")
    check("core_hash", run.get("core_bundle_sha256") == manifest.get("core_bundle_sha256"), "CORE_BUNDLE_HASH_MISMATCH")
    check("component_hashes", run.get("component_sha256") == manifest.get("component_sha256"), "COMPONENT_HASH_REFERENCE_MISMATCH")
    check("live_class", run.get("evidence_class") == "LIVE_RUNTIME_EVIDENCE", "EVIDENCE_CLASS_NOT_LIVE")

    runtime = run.get("runtime") if isinstance(run.get("runtime"), dict) else {}
    provider = str(runtime.get("provider") or "").lower()
    check("runtime_provider", provider in {"hermes", "codex"}, "RUNTIME_PROVIDER_INVALID")
    expected_adapter = {"hermes": "hermes-reference", "codex": "codex-reference"}.get(provider)
    adapter = run.get("adapter") if isinstance(run.get("adapter"), dict) else {}
    check("adapter_identity", bool(expected_adapter) and adapter.get("id") == expected_adapter and bool(adapter.get("version")), "ADAPTER_IDENTITY_INVALID")

    execution = run.get("execution") if isinstance(run.get("execution"), dict) else {}
    check("execution_success", execution.get("ok") is True and execution.get("state") == "SUCCEEDED" and not execution.get("error_category"), "RUNTIME_EXECUTION_NOT_SUCCESSFUL")
    check("cleanup", execution.get("cleanup_attempted") is True and execution.get("cleanup_ok") is True, "CLEANUP_INCOMPLETE")
    check("timestamps", bool(execution.get("started_at")) and bool(execution.get("finished_at")), "TIMESTAMPS_INCOMPLETE")

    normalized = run.get("normalized_result") if isinstance(run.get("normalized_result"), dict) else {}
    check("normalized_result", normalized.get("state") == "SUCCEEDED" and isinstance(normalized.get("output"), dict), "NORMALIZED_RESULT_NOT_SUCCESSFUL")
    output = normalized.get("output") if isinstance(normalized.get("output"), dict) else {}

    evidence = run.get("evidence") if isinstance(run.get("evidence"), dict) else {}
    workspace = evidence.get("workspace_mutation_check") if isinstance(evidence.get("workspace_mutation_check"), dict) else {}
    prohibited = evidence.get("prohibited_action_check") if isinstance(evidence.get("prohibited_action_check"), dict) else {}
    actions = evidence.get("runtime_actions") if isinstance(evidence.get("runtime_actions"), dict) else {}
    check("workspace_safety", workspace.get("temporary_workspace_only") is True and workspace.get("production_repo_changed") is False, "WORKSPACE_POLICY_VIOLATION")
    check("prohibited_actions", prohibited.get("passed") is True, "PROHIBITED_ACTION_CHECK_FAILED")
    check("runtime_actions", all(actions.get(k) is False for k in ("install", "login", "account_mutation", "external_write")), "FORBIDDEN_RUNTIME_ACTION")
    check("evidence_refs", bool(evidence.get("raw_result_ref")) and bool(evidence.get("normalized_result_ref")) and bool(evidence.get("capabilities_used")), "EVIDENCE_INCOMPLETE")

    binding = run.get("evidence_binding") if isinstance(run.get("evidence_binding"), dict) else {}
    commit = str(binding.get("code_commit") or "")
    check("binding_core", binding.get("core_bundle_sha256") == manifest.get("core_bundle_sha256"), "CORE_EVIDENCE_BINDING_MISMATCH")
    check("binding_workspace_hashes", bool(SHA256_RE.fullmatch(str(binding.get("workspace_before_sha256") or ""))) and bool(SHA256_RE.fullmatch(str(binding.get("workspace_after_sha256") or ""))), "WORKSPACE_HASH_MISSING")
    check("binding_commit", bool(GIT_SHA_RE.fullmatch(commit)), "LIVE_CODE_COMMIT_NOT_EXACT_SHA")
    refs = evidence.get("evidence_refs") if isinstance(evidence.get("evidence_refs"), list) else []
    check("binding_refs", f"core-bundle-sha256:{manifest.get('core_bundle_sha256')}" in refs and f"code-commit:{commit}" in refs, "EVIDENCE_BINDING_REF_MISSING")

    protected_ok = True
    protected_checks: list[dict[str, Any]] = []
    for atom in contract.get("protected_atoms", []):
        actual = protected_value(output, atom.get("path", ""))
        accepted = accepted_values(atom)
        passed = actual in accepted
        protected_ok = protected_ok and passed
        protected_checks.append({
            "path": atom.get("path"),
            "expected": atom.get("expected"),
            "accepted": accepted,
            "actual": actual,
            "passed": passed,
        })
    check("protected_atoms", protected_ok, "PROTECTED_ATOM_MISMATCH")

    limitations = output.get("residual_limitations") if isinstance(output.get("residual_limitations"), list) else []
    residual_ok = any("incomplete" in str(item).lower() and "not verified" in str(item).lower() for item in limitations)
    check("residual_limitation", residual_ok, "RESIDUAL_LIMITATION_MISSING")

    facts = source.get("facts") if isinstance(source.get("facts"), dict) else {}
    source_truth_ok = (
        facts.get("canonical_worker") == "siti"
        and facts.get("external_write_performed") is False
        and facts.get("source_status") != "VERIFIED"
        and facts.get("evidence_packet_complete") is False
    )
    check("source_truth_basis", source_truth_ok, "SOURCE_TRUTH_BASIS_INVALID")

    capture = run.get("capture") if isinstance(run.get("capture"), dict) else {}
    cap_repo = capture.get("repository") if isinstance(capture.get("repository"), dict) else {}
    cap_provider = capture.get("provider") if isinstance(capture.get("provider"), dict) else {}
    qualification = capture.get("qualification") if isinstance(capture.get("qualification"), dict) else {}
    cap_safety = capture.get("public_safety") if isinstance(capture.get("public_safety"), dict) else {}
    capture_ok = (
        capture.get("origin") == "canonical-live-reference-runner-v1"
        and capture.get("mode") == "live"
        and capture.get("runtime") == provider
        and cap_repo.get("clean") is True
        and cap_repo.get("commit") == commit
        and cap_provider.get("install_state") == "INSTALLED"
        and cap_provider.get("command_detected") is True
        and cap_provider.get("version_verified") is True
        and qualification.get("eligible") is True
        and qualification.get("evidence_class") == "LIVE_RUNTIME_EVIDENCE"
        and qualification.get("reasons") == []
        and cap_safety.get("ok") is True
        and cap_safety.get("findings") == []
    )
    check("capture_qualification", capture_ok, "LIVE_CAPTURE_QUALIFICATION_INVALID")

    findings = public_safety_findings(run)
    check("independent_public_safety_scan", not findings, "PUBLIC_SAFETY_SCAN_FAILED")

    status = "PASS" if not reasons else "FAIL"
    report_core = {
        "schema": 1,
        "implementation_id": IMPLEMENTATION_ID,
        "independent": True,
        "status": status,
        "run_file_sha256": sha256_bytes(raw_bytes),
        "reference_case_id": run.get("reference_case_id"),
        "core_bundle_sha256": run.get("core_bundle_sha256"),
        "runtime_provider": provider or None,
        "code_commit": commit or None,
        "checks": checks,
        "protected_atoms": protected_checks,
        "public_safety_findings": findings,
        "reasons": sorted(set(reasons)),
        "truth_boundary": "independent run verification != proof of global portability or external-world correctness",
    }
    evidence_ref = "sha256:" + sha256_bytes(canonical_json(report_core).encode("utf-8"))
    return {**report_core, "evidence_ref": evidence_ref}


def verified_copy(run: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    value = copy.deepcopy(run)
    value["external_verification"] = {
        "status": report["status"],
        "independent": True,
        "implementation_id": IMPLEMENTATION_ID,
        "evidence_ref": report["evidence_ref"],
    }
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("run")
    parser.add_argument("--out")
    parser.add_argument("--verified-run-out")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    run_path = Path(args.run)
    if not run_path.is_absolute():
        run_path = (Path.cwd() / run_path).resolve()
    raw = run_path.read_bytes()
    run = json.loads(raw.decode("utf-8"))
    report = verify_run(run, raw_bytes=raw, root=root)
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        Path(args.out).write_text(rendered, encoding="utf-8")
    if args.verified_run_out:
        Path(args.verified_run_out).write_text(json.dumps(verified_copy(run, report), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sys.stdout.write(rendered)
    return 0 if report["status"] == "PASS" else 3


if __name__ == "__main__":
    raise SystemExit(main())
