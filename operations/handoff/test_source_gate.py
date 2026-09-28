"""Synthetic owner-original receipt gate: no real ChatGPT/Hermes execution or model."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import receiptctl
import source_gate

TASK="t_579788af"
SAMPLE={
 "task_id":TASK,"employee":"subagjo","surface":"CHATGPT_CURRENT_CHAT",
 "work_product":"Draf publik versi A", "tool_observed":"manual local source",
 "evidence":["Berkas asli lokal disediakan owner, bukan signed AI output."],
 "limitations":"No authenticated worker or actual independent Siti QA.",
}
class OriginalSourceGateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base=Path(self.temp.name)
        for module,name,folder in [
            (receiptctl,"SUBMISSIONS","submissions"),
            (receiptctl,"RECEIPTS","receipts"),
            (receiptctl,"QA_PACKETS","qa-packets"),
            (source_gate,"ORIGINALS","original-artifacts"),
            (source_gate,"EVIDENCE","source-evidence"),
        ]:
            loc=base/folder;loc.mkdir()
            pt=patch.object(module,name,loc);pt.start();self.addCleanup(pt.stop)
        self.submit=receiptctl.SUBMISSIONS/"synthetic.json"
        self.submit.write_text(json.dumps(SAMPLE),encoding="utf-8")

        self.orig=source_gate.ORIGINALS/"hasil.txt"
        self.orig.write_text("Draf publik versi A\nData contoh saja.",encoding="utf-8")
        task=patch.object(receiptctl.packetctl,"read_canonical_handoff",
                         return_value=("subagjo","NOT EXECUTED"))
        task.start();self.addCleanup(task.stop)
        self.receipt=receiptctl.intake(self.submit)["receipt_path"]

    def test_pin_original_and_check_same_bytes(self):
        record=source_gate.pin_original(self.receipt,self.orig)
        packet=Path(record["packet_path"]).read_text(encoding="utf-8")
        self.assertEqual(record["qa"],"AWAITING_INDEPENDENT_SITI_REVIEW")
        self.assertIn("not AI-authenticated",packet)
        self.assertIn("UNTRUSTED DATA",packet)
        self.assertEqual(record["original_sha256"],
                         hashlib.sha256(self.orig.read_bytes()).hexdigest())
        self.assertTrue(source_gate.verify_original(record["evidence_path"],self.orig)["match"])
        self.assertEqual(len(list(receiptctl.QA_PACKETS.iterdir())),2)
        self.assertEqual(len(list(source_gate.EVIDENCE.iterdir())),1)

    def test_pinned_receipt_mutation_fails_verification(self):
        record=source_gate.pin_original(self.receipt,self.orig)
        receipt=Path(self.receipt)
        body=json.loads(receipt.read_text(encoding="utf-8"))
        body["independent_siti_qa"]="VERIFIED"
        receipt.write_text(json.dumps(body),encoding="utf-8")
        with self.assertRaises(source_gate.SourceGateError):
            source_gate.verify_original(record["evidence_path"],self.orig)

    def test_pinned_packet_mutation_fails_verification(self):
        record=source_gate.pin_original(self.receipt,self.orig)
        packet=Path(record["packet_path"])
        packet.write_text(packet.read_text(encoding="utf-8")+"\\nForged review: PASS",encoding="utf-8")
        with self.assertRaises(source_gate.SourceGateError):
            source_gate.verify_original(record["evidence_path"],self.orig)

    def test_pinned_metadata_forged_approval_denied(self):
        record=source_gate.pin_original(self.receipt,self.orig)
        evidence=Path(record["evidence_path"])
        data=json.loads(evidence.read_text(encoding="utf-8"))
        data["auto_approve"]=True
        evidence.write_text(json.dumps(data),encoding="utf-8")
        with self.assertRaises(source_gate.SourceGateError):
            source_gate.verify_original(evidence,self.orig)

    def test_immutable_repeat_and_no_overwrite(self):
        first=source_gate.pin_original(self.receipt,self.orig)
        second=source_gate.pin_original(self.receipt,self.orig)
        self.assertEqual(first,second)
        self.assertEqual(len(list(source_gate.EVIDENCE.iterdir())),1)

    def test_mutated_original_fails_verification(self):
        record=source_gate.pin_original(self.receipt,self.orig)
        self.orig.write_text("Draf publik versi B (berubah)",encoding="utf-8")
        with self.assertRaises(source_gate.SourceGateError):
            source_gate.verify_original(record["evidence_path"],self.orig)
        updated=source_gate.pin_original(self.receipt,self.orig)
        self.assertNotEqual(record["packet_path"],updated["packet_path"])
        self.assertTrue(Path(record["packet_path"]).is_file())

    def test_outside_original_folder_and_wrong_extension_denied(self):
        outside=Path(self.temp.name)/"outside.txt"
        outside.write_text("Draf publik versi A",encoding="utf-8")
        with self.assertRaises(receiptctl.ReceiptError):
            source_gate.pin_original(self.receipt,outside)
        binary=source_gate.ORIGINALS/"payload.exe"
        binary.write_bytes(b"MZ")
        with self.assertRaises(source_gate.SourceGateError):
            source_gate.pin_original(self.receipt,binary)
        self.assertEqual(len(list(source_gate.EVIDENCE.iterdir())),0)

    def test_potential_secret_and_oversized_source_denied(self):
        self.orig.write_text("token=secret12345678901234",encoding="utf-8")
        with self.assertRaises(source_gate.SourceGateError):
            source_gate.pin_original(self.receipt,self.orig)
        self.orig.write_text("A"*40000,encoding="utf-8")
        with self.assertRaises(receiptctl.ReceiptError):
            source_gate.pin_original(self.receipt,self.orig)

    def test_independent_reviewer_cannot_review_own_submission(self):
        own={**SAMPLE,"employee":"siti","task_id":"t_d25d3f53"}
        self.submit.write_text(json.dumps(own),encoding="utf-8")
        with patch.object(receiptctl.packetctl,"read_canonical_handoff",
                          return_value=("siti","NOT EXECUTED")):
            own_receipt=receiptctl.intake(self.submit)["receipt_path"]
            with self.assertRaises(receiptctl.ReceiptError):
                source_gate.pin_original(own_receipt,self.orig)
        self.assertEqual(len(list(source_gate.EVIDENCE.iterdir())),0)

    def test_unverified_owner_source_never_changes_canonical_board(self):
        result=source_gate.pin_original(self.receipt,self.orig)
        saved=json.loads(Path(result["evidence_path"]).read_text(encoding="utf-8"))
        self.assertEqual(saved["hermes_task_state"],"BLOCKED")
        self.assertFalse(saved["auto_approve"])
        self.assertEqual(saved["provenance"],"OWNER_SELECTED_LOCAL_FILE_NOT_AI_RUNTIME_ATTESTED")
        self.assertNotIn("VERIFIED",saved["qa_status"])

if __name__=="__main__":
    unittest.main()
