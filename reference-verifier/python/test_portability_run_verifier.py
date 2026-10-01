import copy
import json
import tempfile
import unittest
from pathlib import Path

from portability_run_verifier import verify_run

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / "benchmarks/portability/reference-case/manifest.json").read_text(encoding="utf-8"))
CONTRACT = json.loads((ROOT / "benchmarks/portability/reference-case/verification-contract.json").read_text(encoding="utf-8"))


def valid_run(provider="codex", alternate_path=False):
    output = {
        "schema": 1,
        "review_state": "FAIL",
        "claims": [
            {"claim_id": "claim-worker", "verdict": "SUPPORTED", "evidence_path": "facts.canonical_worker"},
            {"claim_id": "claim-write", "verdict": "CONTRADICTED", "evidence_path": "facts.external_write_performed"},
            {"claim_id": "claim-verified", "verdict": "CONTRADICTED", "evidence_path": "facts.evidence_packet_complete" if alternate_path else "facts.source_status"},
        ],
        "residual_limitations": ["The evidence packet is incomplete, so the case is not VERIFIED."],
    }
    commit = "a" * 40
    core = MANIFEST["core_bundle_sha256"]
    adapter = "codex-reference" if provider == "codex" else "hermes-reference"
    runtime_ref = "codex:ephemeral:read-only" if provider == "codex" else "hermes:profile:default"
    return {
        "schema": 1,
        "reference_case_id": MANIFEST["reference_case_id"],
        "core_bundle_sha256": core,
        "component_sha256": copy.deepcopy(MANIFEST["component_sha256"]),
        "evidence_class": "LIVE_RUNTIME_EVIDENCE",
        "adapter": {"id": adapter, "version": "1.0.0"},
        "runtime": {"provider": provider, "runtime_ref": runtime_ref, "provider_version": "fixture"},
        "execution": {
            "ok": True, "state": "SUCCEEDED", "error_category": None,
            "started_at": "2026-10-01T00:00:00.000Z", "finished_at": "2026-10-01T00:00:20.000Z",
            "cleanup_attempted": True, "cleanup_ok": True,
        },
        "normalized_result": {
            "schema": 1, "state": "SUCCEEDED", "summary": "valid",
            "output": output, "artifact_refs": ["sha256:" + "1" * 64],
            "evidence_refs": ["core-bundle-sha256:" + core],
        },
        "evidence": {
            "schema": 1,
            "raw_result_ref": "sha256:" + "2" * 64,
            "normalized_result_ref": "sha256:" + "3" * 64,
            "capabilities_used": ["bounded_process", "model_inference", "temporary_workspace", "evidence_collection"],
            "workspace_mutation_check": {"temporary_workspace_only": True, "production_repo_changed": False},
            "prohibited_action_check": {"passed": True, "observed": []},
            "runtime_actions": {"install": False, "login": False, "account_mutation": False, "external_write": False},
            "evidence_refs": [
                "core-bundle-sha256:" + core,
                "workspace-before-sha256:" + "4" * 64,
                "workspace-after-sha256:" + "4" * 64,
                "code-commit:" + commit,
            ],
            "artifact_refs": ["sha256:" + "5" * 64],
        },
        "evidence_binding": {
            "core_bundle_sha256": core,
            "workspace_before_sha256": "4" * 64,
            "workspace_after_sha256": "4" * 64,
            "code_commit": commit,
        },
        "external_verification": {
            "status": "NOT_RUN", "independent": False,
            "implementation_id": None, "evidence_ref": None,
        },
        "capture": {
            "schema": 1,
            "origin": "canonical-live-reference-runner-v1",
            "runtime": provider,
            "mode": "live",
            "repository": {"commit": commit, "clean": True},
            "provider": {
                "install_state": "INSTALLED", "command_detected": True,
                "version_verified": True, "version": "fixture",
            },
            "qualification": {"eligible": True, "evidence_class": "LIVE_RUNTIME_EVIDENCE", "reasons": []},
            "public_safety": {"ok": True, "findings": []},
        },
    }


def run_report(run):
    raw = (json.dumps(run, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return verify_run(run, raw_bytes=raw, root=ROOT)


class PortabilityRunVerifierTests(unittest.TestCase):
    def test_valid_live_record_passes(self):
        report = run_report(valid_run())
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["reasons"], [])
        self.assertTrue(report["evidence_ref"].startswith("sha256:"))

    def test_enumerated_alternate_evidence_path_passes(self):
        report = run_report(valid_run(alternate_path=True))
        self.assertEqual(report["status"], "PASS")

    def test_wrong_protected_atom_fails(self):
        run = valid_run()
        run["normalized_result"]["output"]["claims"][1]["verdict"] = "SUPPORTED"
        report = run_report(run)
        self.assertEqual(report["status"], "FAIL")
        self.assertIn("PROTECTED_ATOM_MISMATCH", report["reasons"])

    def test_non_live_record_fails(self):
        run = valid_run()
        run["evidence_class"] = "FIXTURE_EVIDENCE"
        report = run_report(run)
        self.assertEqual(report["status"], "FAIL")
        self.assertIn("EVIDENCE_CLASS_NOT_LIVE", report["reasons"])

    def test_self_attested_pass_cannot_override_invalid_record(self):
        run = valid_run()
        run["external_verification"] = {
            "status": "PASS", "independent": True,
            "implementation_id": "self-claim", "evidence_ref": "sha256:" + "9" * 64,
        }
        run["execution"]["ok"] = False
        report = run_report(run)
        self.assertEqual(report["status"], "FAIL")
        self.assertIn("RUNTIME_EXECUTION_NOT_SUCCESSFUL", report["reasons"])

    def test_private_machine_path_is_rejected(self):
        run = valid_run()
        run["normalized_result"]["summary"] = "C:\\Users\\Private\\secret"
        report = run_report(run)
        self.assertEqual(report["status"], "FAIL")
        self.assertIn("PUBLIC_SAFETY_SCAN_FAILED", report["reasons"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
