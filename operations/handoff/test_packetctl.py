"""Synthetic tests: never call real Hermes or touch the official task database."""
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
import packetctl

ID = "t_579788af"
TEST_CONTROLLER = Path(__file__).resolve()
DRAFT = (
    "MANUAL HANDOFF DRAFT — NOT SENT\n"
    f"Hermes official task ID: {ID}\n"
    "Employee chat to OPEN MANUALLY: subagjo\n"
    "NYOBAKANTORAI_TASK_V1 / OWNER MANUAL TASK / NOT EXECUTED\n"
    "goal=Analyze a public readme with no account write\n"
    "approval=NOT_GRANTED; qa=NOT_VERIFIED; delivery=NOT_SENT\n"
)


def fake_runner(args, **kwargs):
    return SimpleNamespace(returncode=0, stdout=DRAFT)


class ManualPacketTests(unittest.TestCase):
    def test_bad_task_id_rejected(self):
        with self.assertRaises(packetctl.PacketError):
            packetctl.read_canonical_handoff("../secrets", runner=fake_runner)

    def test_owner_handoff_is_not_sent(self):
        employee, draft = packetctl.read_canonical_handoff(ID, runner=fake_runner, controller_path=TEST_CONTROLLER)
        self.assertEqual(employee, "subagjo")
        self.assertIn("NOT SENT", draft)
    def test_worker_environment_denied(self):
        with patch.dict(os.environ, {"HERMES_KANBAN_WORKER_ID": "worker-1"}):
            with self.assertRaises(packetctl.PacketError):
                packetctl.read_canonical_handoff(ID, runner=fake_runner, controller_path=TEST_CONTROLLER)

    def test_canonical_controller_refusal(self):
        def failed(*args, **kwargs):
            return SimpleNamespace(returncode=2, stdout="BLOCKED")
        with self.assertRaises(packetctl.PacketError):
            packetctl.read_canonical_handoff(ID, runner=failed, controller_path=TEST_CONTROLLER)

    def test_wrong_id_rejected(self):
        def wrong(*args, **kwargs):
            return SimpleNamespace(returncode=0, stdout=DRAFT.replace(ID, "t_12345678"))
        with self.assertRaises(packetctl.PacketError):
            packetctl.read_canonical_handoff(ID, runner=wrong, controller_path=TEST_CONTROLLER)

    def test_unknown_employee_rejected(self):
        def unknown(*args, **kwargs):
            return SimpleNamespace(returncode=0, stdout=DRAFT.replace("subagjo", "unknown"))
        with self.assertRaises(packetctl.PacketError):
            packetctl.read_canonical_handoff(ID, runner=unknown, controller_path=TEST_CONTROLLER)

    def test_packet_is_only_a_manual_draft(self):
        content = packetctl.render_packet(ID, "subagjo", DRAFT)
        self.assertIn("DRAFT_NOT_SENT", content)
        self.assertIn("QA_NOT_VERIFIED", content)
        self.assertIn("NOT_EXECUTED_UNTIL_ACTUAL_WORK", content)
        self.assertIn("Use only tools visible in THIS ChatGPT chat", content)
    def test_export_new_and_repeated_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / "packets"
            first = packetctl.export_packet(ID, folder, runner=fake_runner, controller_path=TEST_CONTROLLER)
            second = packetctl.export_packet(ID, folder, runner=fake_runner, controller_path=TEST_CONTROLLER)
            self.assertEqual(first["sha256"], second["sha256"])
            self.assertEqual(len(list(folder.iterdir())), 1)
            self.assertEqual(first["task_status"], "BLOCKED")
            self.assertFalse(first["external_write"])

    def test_existing_conflicting_packet_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / f"{ID}-subagjo-manual.md").write_text("USER DATA", encoding="utf-8")
            with self.assertRaises(packetctl.PacketError):
                packetctl.export_packet(ID, folder, runner=fake_runner, controller_path=TEST_CONTROLLER)
            self.assertEqual((folder / f"{ID}-subagjo-manual.md").read_text(encoding="utf-8"), "USER DATA")


if __name__ == "__main__":
    unittest.main()
