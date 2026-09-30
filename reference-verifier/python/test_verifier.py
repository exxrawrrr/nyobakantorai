import base64
import copy
import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from verifier import (
    canonical_json,
    execution_receipt_ref,
    resolve_receipt_trust,
    sha256_text,
    validate_trust_registry,
    verify_execution_receipt,
    verify_receipt_packet,
)


NOW = datetime(2026, 9, 29, 3, 45, tzinfo=timezone.utc)


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def base_payload(**overrides):
    payload = {
        "schema": 1,
        "receipt_id": "receipt.maya.0001",
        "task_id": "task-42",
        "employee_id": "maya",
        "action": "Update approved Meta campaign budget",
        "capability_id": "ads.meta.write",
        "risk_class": "PAID_ACTION",
        "autonomy": "GUARDED",
        "authorization": {
            "allowed": True,
            "reason": "CONNECTED_AND_OWNER_APPROVED",
            "approval_ref": "approval://task-42/owner",
        },
        "started_at": "2026-09-29T03:40:00.000Z",
        "finished_at": "2026-09-29T03:41:00.000Z",
        "result": {
            "state": "SUCCEEDED",
            "summary": "Budget update completed and provider read-back matched.",
            "artifact_refs": ["artifact://meta/change-42.json"],
            "evidence_refs": [
                "runtime://meta/change-42",
                "test://readback/change-42",
            ],
        },
        "runtime": {
            "provider": "meta-ads",
            "runtime_ref": "runtime://meta/change-42",
            "provider_version": "python-fixture",
        },
        "usage": {
            "input_tokens": 1200,
            "output_tokens": 240,
            "cost_known": True,
            "cost_amount": 0.031,
            "currency": "USD",
        },
        "previous_receipt_sha256": None,
    }
    payload.update(overrides)
    return payload


def public_pem(private_key):
    return (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )


def sign_payload(payload, private_key, key_id="local:python-test"):
    canonical = canonical_json(payload)
    signature = private_key.sign(canonical.encode("utf-8"))
    return {
        "schema": 1,
        "alg": "Ed25519",
        "key_id": key_id,
        "payload": copy.deepcopy(payload),
        "payload_sha256": sha256_text(canonical),
        "signature_base64": base64.b64encode(signature).decode("ascii"),
    }


def trust_entry(private_key, **overrides):
    entry = {
        "key_id": "key:active",
        "public_key_pem": public_pem(private_key),
        "status": "ACTIVE",
        "signer_identity": "python runtime signer",
        "key_owner": "owner-security",
        "generation_boundary": "outside repository",
        "storage_expectation": "private key stays in signer-owned secret storage",
        "valid_from": "2026-09-29T03:00:00.000Z",
        "valid_until": None,
        "runtime_provider_scope": ["meta-ads"],
        "runtime_ref_prefixes": ["runtime://meta/"],
        "revoked_at": None,
        "compromise_cutoff": None,
        "revocation_reason": None,
        "historical_policy": "ALLOW_WITHIN_VALIDITY",
    }
    entry.update(overrides)
    return entry


def trust_registry(private_key, **entry_overrides):
    return {
        "schema": 1,
        "registry_id": "python-trust-registry-v1",
        "keys": [trust_entry(private_key, **entry_overrides)],
    }



class IndependentReceiptVerifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private_key = Ed25519PrivateKey.generate()
        cls.public_key_pem = public_pem(cls.private_key)

    def verify(self, envelope, **kwargs):
        return verify_execution_receipt(
            envelope,
            public_keys={"local:python-test": self.public_key_pem},
            now=NOW,
            **kwargs,
        )

    def valid_envelope(self, **payload_overrides):
        return sign_payload(base_payload(**payload_overrides), self.private_key)

    def test_canonical_json_is_stable_and_compact(self):
        self.assertEqual(
            canonical_json({"b": 2, "a": {"z": 3, "y": 1}, "text": "Siti"}),
            '{"a":{"y":1,"z":3},"b":2,"text":"Siti"}',
        )
        self.assertEqual(canonical_json({"cost": 0.031}), '{"cost":0.031}')

    def test_valid_receipt_verifies_with_exact_bindings(self):
        envelope = self.valid_envelope()
        result = self.verify(
            envelope,
            required_task_id="task-42",
            required_employee_id="maya",
            required_capability_id="ads.meta.write",
            required_result_states=["SUCCEEDED"],
            allowed_runtime_providers=["meta-ads"],
            allowed_runtime_ref_prefixes=["runtime://meta/"],
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["decision"], "VALID")
        self.assertEqual(result["receipt_ref"], execution_receipt_ref(envelope))

    def test_modified_payload_breaks_hash_and_signature(self):
        envelope = self.valid_envelope()
        envelope["payload"]["result"]["summary"] = "Changed after signing."
        result = self.verify(envelope)
        self.assertFalse(result["ok"])
        self.assertIn("PAYLOAD_HASH_MISMATCH", result["reasons"])
        self.assertIn("SIGNATURE_INVALID", result["reasons"])

    def test_wrong_signature_fails(self):
        envelope = self.valid_envelope()
        raw = bytearray(base64.b64decode(envelope["signature_base64"]))
        raw[0] ^= 1
        envelope["signature_base64"] = base64.b64encode(bytes(raw)).decode("ascii")
        result = self.verify(envelope)
        self.assertFalse(result["ok"])
        self.assertIn("SIGNATURE_INVALID", result["reasons"])

    def test_unknown_key_fails_closed(self):
        envelope = self.valid_envelope()
        result = verify_execution_receipt(
            envelope,
            public_keys={},
            now=NOW,
        )
        self.assertFalse(result["ok"])
        self.assertIn("UNTRUSTED_KEY_ID", result["reasons"])

    def test_stale_receipt_fails_freshness_policy(self):
        envelope = self.valid_envelope()
        result = verify_execution_receipt(
            envelope,
            public_keys={"local:python-test": self.public_key_pem},
            now=datetime(2026, 9, 29, 4, 30, tzinfo=timezone.utc),
            max_receipt_age_ms=15 * 60 * 1000,
        )
        self.assertFalse(result["ok"])
        self.assertIn("RECEIPT_STALE", result["reasons"])

    def test_future_receipt_is_rejected(self):
        future = NOW + timedelta(minutes=10)
        payload = base_payload(
            started_at=iso(future - timedelta(seconds=30)),
            finished_at=iso(future),
        )
        envelope = sign_payload(payload, self.private_key)
        result = self.verify(envelope)
        self.assertFalse(result["ok"])
        self.assertTrue(
            any(
                reason.startswith("PAYLOAD_INVALID:finished_at is too far in the future")
                for reason in result["reasons"]
            )
        )

    def test_task_worker_capability_and_result_bindings_fail(self):
        envelope = self.valid_envelope()
        result = self.verify(
            envelope,
            required_task_id="task-other",
            required_employee_id="gugun",
            required_capability_id="ads.google.write",
            required_result_states=["FAILED"],
        )
        self.assertFalse(result["ok"])
        for code in (
            "TASK_BINDING_MISMATCH",
            "EMPLOYEE_BINDING_MISMATCH",
            "CAPABILITY_BINDING_MISMATCH",
            "RESULT_STATE_NOT_ALLOWED",
        ):
            self.assertIn(code, result["reasons"])

    def test_runtime_scope_mismatch_fails(self):
        envelope = self.valid_envelope()
        result = self.verify(
            envelope,
            allowed_runtime_providers=["hermes"],
            allowed_runtime_ref_prefixes=["hermes-kanban:"],
        )
        self.assertFalse(result["ok"])
        self.assertIn("RUNTIME_PROVIDER_NOT_ALLOWED", result["reasons"])
        self.assertIn("RUNTIME_REF_NOT_ALLOWED", result["reasons"])

    def test_consumed_receipt_is_replay(self):
        envelope = self.valid_envelope()
        ref = execution_receipt_ref(envelope)
        result = self.verify(envelope, consumed_receipt_refs=[ref])
        self.assertFalse(result["ok"])
        self.assertIn("RECEIPT_REPLAYED", result["reasons"])

    def packet_for(self, envelopes, refs=None, **expected_overrides):
        expected = {
            "task_id": "task-42",
            "assignee_id": "maya",
            "capability_id": "ads.meta.write",
            "require_signed_execution_receipt": True,
            "required_receipt_result_states": ["SUCCEEDED"],
            "receipt_public_keys": {"local:python-test": self.public_key_pem},
            "max_execution_receipt_age_ms": 15 * 60 * 1000,
            "allowed_receipt_runtime_providers": ["meta-ads"],
            "allowed_receipt_runtime_ref_prefixes": ["runtime://meta/"],
            "consumed_receipt_refs": [],
        }
        expected.update(expected_overrides)
        return {
            "now": iso(NOW),
            "expected": expected,
            "evidence": {
                "signed_receipts": envelopes,
                "refs": list(refs or []),
            },
        }

    def test_duplicate_receipt_in_packet_is_detected_as_replay(self):
        envelope = self.valid_envelope()
        ref = execution_receipt_ref(envelope)
        result = verify_receipt_packet(
            self.packet_for([envelope, copy.deepcopy(envelope)], refs=[ref])
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["metrics"]["signed_receipts_valid"], 1)
        self.assertEqual(result["metrics"]["signed_receipts_invalid"], 1)
        details = result["reasons"][0]["details"]
        self.assertIn("RECEIPT_REPLAYED", details)

    def test_missing_receipt_reference_rejects_packet(self):
        envelope = self.valid_envelope()
        result = verify_receipt_packet(self.packet_for([envelope], refs=[]))
        self.assertFalse(result["ok"])
        codes = [item["code"] for item in result["reasons"]]
        self.assertIn("SIGNED_RECEIPT_REFERENCE_MISSING", codes)

    def test_malformed_envelope_shape_fails_closed(self):
        envelope = self.valid_envelope()
        envelope["unexpected"] = "field"
        result = self.verify(envelope)
        self.assertFalse(result["ok"])
        self.assertIn("ENVELOPE_SHAPE_INVALID", result["reasons"])

    def test_trust_registry_active_key_verifies_signed_receipt(self):
        private_key = Ed25519PrivateKey.generate()
        registry = trust_registry(private_key)
        envelope = sign_payload(base_payload(), private_key, "key:active")
        result = verify_execution_receipt(
            envelope,
            trust_registry=registry,
            public_keys={"key:active": "not-used"},
            now=NOW,
        )
        self.assertTrue(result["ok"])

    def test_trust_registry_retired_key_preserves_historical_receipt(self):
        private_key = Ed25519PrivateKey.generate()
        registry = trust_registry(
            private_key,
            status="RETIRED",
            valid_until="2026-09-29T03:42:00.000Z",
        )
        envelope = sign_payload(base_payload(), private_key, "key:active")
        result = verify_execution_receipt(
            envelope,
            trust_registry=registry,
            now=NOW,
        )
        self.assertTrue(result["ok"])

    def test_trust_registry_revoked_key_overrides_legacy_public_key_map(self):
        private_key = Ed25519PrivateKey.generate()
        registry = trust_registry(
            private_key,
            status="REVOKED",
            historical_policy="REJECT_ALL",
            revoked_at="2026-09-29T03:44:00.000Z",
            revocation_reason="compromised",
        )
        envelope = sign_payload(base_payload(), private_key, "key:active")
        result = verify_execution_receipt(
            envelope,
            trust_registry=registry,
            public_keys={"key:active": public_pem(private_key)},
            now=NOW,
        )
        self.assertFalse(result["ok"])
        self.assertIn("KEY_REVOKED", result["reasons"])
        self.assertNotIn("UNTRUSTED_KEY_ID", result["reasons"])

    def test_trust_registry_pre_compromise_policy_is_cutoff_bounded(self):
        private_key = Ed25519PrivateKey.generate()
        registry = trust_registry(
            private_key,
            status="REVOKED",
            historical_policy="ALLOW_PRE_COMPROMISE",
            revoked_at="2026-09-29T03:44:00.000Z",
            compromise_cutoff="2026-09-29T03:42:00.000Z",
            revocation_reason="bounded earliest-known compromise",
        )
        before = sign_payload(base_payload(), private_key, "key:active")
        before_result = verify_execution_receipt(
            before,
            trust_registry=registry,
            now=NOW,
        )
        self.assertTrue(before_result["ok"])

        after_payload = base_payload(
            finished_at="2026-09-29T03:43:00.000Z",
        )
        after = sign_payload(after_payload, private_key, "key:active")
        after_result = verify_execution_receipt(
            after,
            trust_registry=registry,
            now=NOW,
        )
        self.assertFalse(after_result["ok"])
        self.assertIn("KEY_COMPROMISED_AFTER_CUTOFF", after_result["reasons"])

    def test_trust_registry_scope_and_private_key_rules_fail_closed(self):
        private_key = Ed25519PrivateKey.generate()
        registry = trust_registry(private_key)
        scoped = resolve_receipt_trust(
            registry,
            key_id="key:active",
            finished_at="2026-09-29T03:41:00.000Z",
            runtime_provider="hermes",
            runtime_ref="hermes:task:42",
        )
        self.assertFalse(scoped["ok"])
        self.assertIn("KEY_RUNTIME_PROVIDER_NOT_ALLOWED", scoped["reasons"])
        self.assertIn("KEY_RUNTIME_REF_NOT_ALLOWED", scoped["reasons"])

        registry["keys"][0]["public_key_pem"] = (
            private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            ).decode("utf-8")
        )
        errors = validate_trust_registry(registry)
        self.assertTrue(any("public key material only" in item for item in errors))

    def test_verifier_source_has_no_javascript_runtime_dependency(self):
        source = Path(__file__).with_name("verifier.py").read_text(encoding="utf-8")
        forbidden = (
            "subprocess",
            "packages/evidence-verifier",
            "packages/execution-receipt",
            ".mjs",
        )
        for marker in forbidden:
            self.assertNotIn(marker, source)


if __name__ == "__main__":
    unittest.main()
