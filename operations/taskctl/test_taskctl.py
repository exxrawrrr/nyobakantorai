"""Pure contract tests; NEVER connect to real Hermes or use owner tokens."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch

import taskctl as t


class ContractTests(TestCase):
    def data(self, **overrides):
        values=dict(employee="subagjo",title="Review local project",
                    goal="Inspect scope and draft a safe plan",request_id="RFD-20260920-ARCH-01",
                    done="Evidence and proposed rollback",privacy="INTERNAL")
        values.update(overrides)
        return t.contract(**values)

    def test_all_six_employees(self):
        for name in t.EMPLOYEES:
            self.assertEqual(self.data(employee=name)["employee"],name)

    def test_disallow_unknown_employee(self):
        with self.assertRaises(t.TaskError): self.data(employee="default")

    def test_public_and_internal_only(self):
        self.assertEqual(self.data(privacy="PUBLIC")["privacy"],"PUBLIC")
        for privacy in ("SECRET","CLIENT_CONFIDENTIAL"):
            with self.assertRaises(t.TaskError): self.data(privacy=privacy)

    def test_deny_secrets_and_linebreak(self):
        for title in ("password=abcd1234567890123","Bearer abcdefghijklmnopq",
                      "Skilled\nforge status", ""):
            with self.assertRaises(t.TaskError): self.data(title=title)

    def test_deny_unsafe_request_id_and_goal(self):
        for identity in ("x","/etc/passwd","hello world","A"*100):
            with self.assertRaises(t.TaskError): self.data(request_id=identity)
        with self.assertRaises(t.TaskError): self.data(goal="x"*321)

    def test_envelope_truth_labels(self):
        text=t.body(self.data())
        self.assertIn("NOT EXECUTED",text)
        self.assertIn("CHATGPT_REGULAR_MANUAL",text)
        self.assertIn("qa=NOT_VERIFIED",text)
        self.assertNotIn("MODEL_ALREADY_RUNNING",text)

    def test_no_dispatch_gate_fails_closed(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name in ("default",*t.EMPLOYEES):
                p=root/"config.yaml" if name=="default" else root/"profiles"/name/"config.yaml"
                p.parent.mkdir(parents=True,exist_ok=True)
                p.write_text("kanban:\n  dispatch_in_gateway: false\n  review_dispatch: false\n",encoding="utf8")
            self.assertTrue(t.safe_config(root))
            (root/"profiles"/"siti"/"config.yaml").write_text("kanban:\n  dispatch_in_gateway: true\n",encoding="utf8")
            self.assertFalse(t.safe_config(root))

    def test_create_only_blocked_official_board_receipt(self):
        data=self.data()
        with patch.object(t,"preflight"),patch.object(t,"cli",side_effect=[
            json.dumps({"id":"t_12345678"}),json.dumps({"task":{"id":"t_12345678","assignee":"subagjo","status":"blocked","title":data["title"],"body":t.body(data)}})
        ]) as run:
            receipt=t.create(data)
        self.assertEqual(receipt["status"],"blocked")
        self.assertEqual(receipt["qa"],"NOT_VERIFIED")
        sent=run.call_args_list[0].args[0]
        self.assertIn("--initial-status",sent)
        self.assertEqual(sent[sent.index("--initial-status")+1],"blocked")
        self.assertEqual(sent[sent.index("--idempotency-key")+1],"nyoba-v1-RFD-20260920-ARCH-01")
        self.assertNotIn("dispatch",sent)
        self.assertNotIn("unblock",sent)

    def test_fail_closed_when_official_status_not_blocked(self):
        with patch.object(t,"preflight"),patch.object(t,"cli",side_effect=[
            json.dumps({"id":"t_12345678"}),json.dumps({"task":{"id":"t_12345678","assignee":"subagjo","status":"ready"}})
        ]):
            with self.assertRaises(t.TaskError): t.create(self.data())

    def test_list_only_official_redacted_fields(self):
        with patch.object(t,"preflight"),patch.object(t,"cli",return_value=json.dumps([
            {"id":"t_12345678","title":"safe","body":"confidential source that is not exposed","assignee":"alex","status":"blocked"}
        ])):
            result=t.list_safe()
        self.assertEqual(set(result[0]),{"id","title","assignee","status"})
        self.assertNotIn("confidential source",str(result))

    def test_handoff_refuses_forged_task(self):
        for obj in (
            {"id":"t_12345678","assignee":"alex","status":"blocked","body":"fake"},
            {"id":"t_12345678","assignee":"alex","status":"ready","body":"NYOBAKANTORAI_TASK_V1 / OWNER MANUAL TASK"},
        ):
            with patch.object(t,"preflight"),patch.object(t,"cli",return_value=json.dumps({"task":obj})):
                with self.assertRaises(t.TaskError): t.handoff("t_12345678")

    def test_handoff_is_manual_and_does_not_mutate(self):
        task={"id":"t_12345678","assignee":"alex","status":"blocked","body":t.body(self.data(employee="alex"))}
        with patch.object(t,"preflight"),patch.object(t,"cli",return_value=json.dumps({"task":task})) as run:
            prompt=t.handoff("t_12345678")
        self.assertIn("NOT SENT",prompt)
        self.assertIn("NOT an automatic Hermes/ChatGPT delegation",prompt)
        self.assertEqual(run.call_args.args[0][0],"show")
        self.assertEqual(run.call_count,1)


    def test_idempotency_collision_denied(self):
        data=self.data()
        with patch.object(t,"preflight"),patch.object(t,"cli",side_effect=[
            json.dumps({"id":"t_12345678"}),
            json.dumps({"task":{"id":"t_12345678","assignee":"subagjo",
                                "status":"blocked","title":"Wrong title","body":"Wrong body"}})
        ]):
            with self.assertRaises(t.TaskError): t.create(data)

    def test_hermes_worker_cannot_use_owner_intake(self):
        with patch.dict("os.environ", {"HERMES_KANBAN_TASK":"t_12345678"}),patch("taskctl.subprocess.run") as runner:
            with self.assertRaises(t.TaskError): t.cli(["list","--json"])
            runner.assert_not_called()


if __name__=="__main__": main()
