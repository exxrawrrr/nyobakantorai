"""Synthetic manual return and QA tests; no real ChatGPT message or Hermes mutation."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import receiptctl

TASK = "t_579788af"
SUBMISSION = {
    "task_id": TASK, "employee": "subagjo", "surface": "CHATGPT_CURRENT_CHAT",
    "work_product": "Public README header checked; no files changed.",
    "tool_observed": "GitHub public read-only",
    "evidence": ["Public README line 6 is Hermes Agent, source revision sample."],
    "limitations": "This chat is not an independent Subagjo Hermes model run.",
}


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        folder = Path(self.temporary.name)
        for name in ("SUBMISSIONS", "RECEIPTS", "QA_PACKETS"):
            folder_path = folder / name.lower()
            folder_path.mkdir()
            p = patch.object(receiptctl, name, folder_path)
            p.start()
            self.addCleanup(p.stop)
        self.source = receiptctl.SUBMISSIONS / "sample.json"
        self.source.write_text(json.dumps(SUBMISSION), encoding="utf-8")
    def test_realistic_manual_intake_is_unverified(self):
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("subagjo", "NOT EXECUTED")):
            result = receiptctl.intake(self.source)
        self.assertEqual(result["qa"], "NOT_PERFORMED")
        body = json.loads(Path(result["receipt_path"]).read_text(encoding="utf-8"))
        self.assertEqual(body["provenance"], "OWNER_SUBMITTED_UNVERIFIED")
        self.assertEqual(body["task_status_in_hermes"], "BLOCKED")
        self.assertFalse(body["automatic_chatgpt_bridge"])
        self.assertEqual(body["sent_to_employee_chat"], "NOT_PROVEN")

    def test_repeat_is_idempotent(self):
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("subagjo", "NOT EXECUTED")):
            first = receiptctl.intake(self.source)
            second = receiptctl.intake(self.source)
        self.assertEqual(first["receipt_path"], second["receipt_path"])
        self.assertEqual(len(list(receiptctl.RECEIPTS.iterdir())), 1)

    def test_official_identity_mismatch_denied(self):
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("siti", "NOT EXECUTED")):
            with self.assertRaises(receiptctl.ReceiptError):
                receiptctl.intake(self.source)
        self.assertEqual(len(list(receiptctl.RECEIPTS.iterdir())), 0)

    def test_outside_submissions_folder_denied(self):
        outsider = Path(self.temporary.name) / "outside.json"
        outsider.write_text(json.dumps(SUBMISSION), encoding="utf-8")
        with self.assertRaises(receiptctl.ReceiptError):
            receiptctl.intake(outsider, verify_task=False)

    def test_unknown_extra_claims_denied(self):
        data = {**SUBMISSION, "qa": "VERIFIED"}
        with self.assertRaises(receiptctl.ReceiptError):
            receiptctl.validate_submission(data)
    def test_nonstring_identity_rejected_without_traceback(self):
        for key, value in (("task_id", ["t_579788af"]), ("employee", ["subagjo"]), ("surface", {"name":"CHATGPT_CURRENT_CHAT"})):
            with self.subTest(key=key):
                with self.assertRaises(receiptctl.ReceiptError):
                    receiptctl.validate_submission({**SUBMISSION, key: value})

    def test_preexisting_forged_qa_receipt_refused_at_intake(self):
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("subagjo", "NOT EXECUTED")):
            first = receiptctl.intake(self.source)
            path = Path(first["receipt_path"])
            data = json.loads(path.read_text(encoding="utf-8"))
            data["independent_siti_qa"] = "VERIFIED"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(receiptctl.ReceiptError):
                receiptctl.intake(self.source)

    def test_sensitive_text_denied(self):
        data = {**SUBMISSION, "evidence": ["password=supersecretcredential123"]}
        with self.assertRaises(receiptctl.ReceiptError):
            receiptctl.validate_submission(data)

    def test_siti_packet_is_not_a_verification(self):
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("subagjo", "NOT EXECUTED")):
            receipt = receiptctl.intake(self.source)
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("subagjo", "NOT EXECUTED")):
            qa = receiptctl.qa_handoff(receipt["receipt_path"])
        packet = Path(qa["qa_packet_path"]).read_text(encoding="utf-8")
        self.assertIn("UNVERIFIED", packet)
        self.assertIn("AWAITING_INDEPENDENT_REVIEW", packet)
        self.assertIn("untrusted evidence", packet)
        self.assertEqual(qa["task_in_hermes"], "BLOCKED")

    def test_siti_self_review_is_rejected(self):
        own = {**SUBMISSION, "task_id": "t_d25d3f53", "employee": "siti"}
        self.source.write_text(json.dumps(own), encoding="utf-8")
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("siti", "NOT EXECUTED")):
            receipt = receiptctl.intake(self.source)
            with self.assertRaises(receiptctl.ReceiptError):
                receiptctl.qa_handoff(receipt["receipt_path"])
        self.assertEqual(len(list(receiptctl.QA_PACKETS.iterdir())), 0)

    def test_siti_packet_rechecks_current_official_assignment(self):
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("subagjo", "NOT EXECUTED")):
            receipt = receiptctl.intake(self.source)
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("siti", "NOT EXECUTED")):
            with self.assertRaises(receiptctl.ReceiptError):
                receiptctl.qa_handoff(receipt["receipt_path"])
        self.assertEqual(len(list(receiptctl.QA_PACKETS.iterdir())), 0)

    def test_fabricated_verified_receipt_denied(self):
        with patch.object(receiptctl.packetctl, "read_canonical_handoff", return_value=("subagjo", "NOT EXECUTED")):
            receipt = receiptctl.intake(self.source)
        file = Path(receipt["receipt_path"])
        data = json.loads(file.read_text(encoding="utf-8"))
        data["independent_siti_qa"] = "VERIFIED"
        file.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaises(receiptctl.ReceiptError):
            receiptctl.qa_handoff(file)


if __name__ == "__main__":
    unittest.main()
