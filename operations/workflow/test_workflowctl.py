"""Synthetic routing tests; never create Hermes cards or invoke a model."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import workflowctl as w


class WorkflowTests(unittest.TestCase):
    def test_exactly_six_distinct_primary_roles(self):
        self.assertEqual(len(w.ROUTES), 6)
        self.assertEqual(set(role for role, _ in w.ROUTES.values()), set(w.packetctl.ROLES))

    def test_all_categories_only_preview(self):
        for category, (role, _) in w.ROUTES.items():
            with self.subTest(category=category):
                result = w.plan(category, "PUBLIC", "DRAFT_ONLY")
                self.assertEqual(result["suggested_employee"], role)
                self.assertFalse(result["actual_employee_run"])
                self.assertFalse(result["tool_access_authorized"])
                self.assertIsNone(result["official_task_id"])
                self.assertEqual(result["status"], "ROUTING_PREVIEW_ONLY")

    def test_sensitive_classification_denied(self):
        for privacy in ("SECRET", "CLIENT_CONFIDENTIAL", None):
            with self.subTest(privacy=privacy):
                with self.assertRaises(w.WorkflowError):
                    w.plan("creative", privacy, "DRAFT_ONLY")

    def test_write_or_paid_actions_denied(self):
        for action in ("PUBLISH", "ADS_MUTATION", "PAID_MODEL", "SEND_TELEGRAM", None):
            with self.subTest(action=action):
                with self.assertRaises(w.WorkflowError):
                    w.plan("metrics", "PUBLIC", action)
    def test_unknown_or_unhashable_category_denied(self):
        for category in ("other", ["engineering"], None):
            with self.subTest(category=category):
                with self.assertRaises(w.WorkflowError):
                    w.plan(category, "PUBLIC", "DRAFT_ONLY")

    def test_official_matching_assignee_eligible_not_sent(self):
        with patch.object(w.packetctl, "read_canonical_handoff", return_value=("subagjo", "OWNER MANUAL DRAFT")):
            result = w.official("t_579788af", "engineering")
        self.assertEqual(result["official_assignee"], "subagjo")
        self.assertEqual(result["official_state"], "BLOCKED")
        self.assertEqual(result["delivery"], "NOT_SENT")
        self.assertEqual(result["inference"], "NOT_PERFORMED")

    def test_existing_assignee_mismatch_denied(self):
        with patch.object(w.packetctl, "read_canonical_handoff", return_value=("subagjo", "OWNER MANUAL DRAFT")):
            with self.assertRaises(w.WorkflowError):
                w.official("t_579788af", "quality")

    def test_invalid_official_id_denied_before_controller(self):
        with patch.object(w.packetctl, "read_canonical_handoff") as caller:
            for ident in ("../../kanban", ["t_579788af"], ""):
                with self.assertRaises(w.WorkflowError):
                    w.official(ident, "engineering")
            caller.assert_not_called()

    def test_prepare_uses_existing_exporter_not_new_board(self):
        with patch.object(w.packetctl, "read_canonical_handoff", return_value=("subagjo", "DRAFT")):
            with patch.object(w.packetctl, "export_packet", return_value={
                "packet_path": "dummy.md", "sha256": "sample-sha"}) as exporter:
                result = w.official("t_579788af", "engineering", exporter=True)
        exporter.assert_called_once_with("t_579788af")
        self.assertEqual(result["status"], "MANUAL_PACKET_PREPARED_NOT_SENT")
    def test_cross_employee_handoff_is_only_a_manual_proposal(self):
        with patch.object(w.packetctl, "read_canonical_handoff", return_value=("subagjo", "DRAFT")):
            result = w.handoff_preview("t_579788af", "praroro", "engineering")
        self.assertEqual(result["destination"], "subagjo")
        self.assertEqual(result["claimed_origin"], "praroro")
        self.assertFalse(result["origin_authenticated"])
        self.assertTrue(result["manual_owner_transfer_required"])
        self.assertEqual(result["handoff_status"], "DRAFT_NOT_DELIVERED")

    def test_self_handoff_rejected(self):
        with patch.object(w.packetctl, "read_canonical_handoff", return_value=("subagjo", "DRAFT")):
            with self.assertRaises(w.WorkflowError):
                w.handoff_preview("t_579788af", "subagjo", "engineering")

    def test_spoofed_or_unknown_handoff_origin_rejected(self):
        with patch.object(w.packetctl, "read_canonical_handoff") as caller:
            for origin in ("owner", "unknown", None, ["praroro"]):
                with self.assertRaises(w.WorkflowError):
                    w.handoff_preview("t_579788af", origin, "engineering")
            caller.assert_not_called()

    def make_receipt(self, root, *, employee="subagjo", surface="CHATGPT_CURRENT_CHAT"):
        data = {
            "task_id": "t_579788af", "employee": employee, "surface": surface,
            "work_product": "Dummy public source analysis",
            "tool_observed": "NONE_SYNTHETIC",
            "evidence": ["Synthetic test record"], "limitations": "Not a real employee run",
        }
        location = root / "sample.json"
        location.write_text(json.dumps({"owner_submission": data}), encoding="utf-8")
        return location

    def test_review_request_is_only_manual_and_unverified(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = self.make_receipt(root)
            with patch.object(w.receiptctl, "RECEIPTS", root):
                with patch.object(w.receiptctl, "qa_handoff", return_value={"qa_packet_path": "dummy-qa.md"}) as qa:
                    result = w.reviewer_request(path)
            qa.assert_called_once_with(path)
        self.assertEqual(result["requested_reviewer"], "siti")
        self.assertFalse(result["independent_qa_executed"])
        self.assertEqual(result["delivery"], "NOT_SENT")

    def test_siti_self_review_denied_before_qa(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = self.make_receipt(root, employee="siti")
            with patch.object(w.receiptctl, "RECEIPTS", root):
                with patch.object(w.receiptctl, "qa_handoff") as qa:
                    with self.assertRaises(w.WorkflowError):
                        w.reviewer_request(path)
                    qa.assert_not_called()
    def test_fixture_cannot_enter_operational_review(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = self.make_receipt(root, surface="SYNTHETIC_FIXTURE")
            with patch.object(w.receiptctl, "RECEIPTS", root):
                with patch.object(w.receiptctl, "qa_handoff") as qa:
                    with self.assertRaises(w.WorkflowError):
                        w.reviewer_request(path)
                    qa.assert_not_called()

    def test_path_outside_receipt_directory_denied(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "receipts").mkdir()
            path = self.make_receipt(root)
            with patch.object(w.receiptctl, "RECEIPTS", root / "receipts"):
                with self.assertRaises(w.receiptctl.ReceiptError):
                    w.reviewer_request(path)

    def test_malformed_receipt_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "bad.json"
            path.write_text("{not json", encoding="utf-8")
            with patch.object(w.receiptctl, "RECEIPTS", root):
                with self.assertRaises(w.WorkflowError):
                    w.reviewer_request(path)


if __name__ == "__main__":
    unittest.main()
