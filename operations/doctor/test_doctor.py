"""All tests use temporary files/mock gateways; none invoke models, accounts, or real tasks."""
from pathlib import Path
from contextlib import closing
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import doctor


class DoctorTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        for name,opt in doctor.EXPECTED.items():
            folder=self.root if name=="default" else self.root/"profiles"/name
            folder.mkdir(parents=True,exist_ok=True)
            (folder/"memories").mkdir(exist_ok=True)
            tools=["clarify","memory","session_search","todo","skills"]
            if opt["kanban"]: tools.append("kanban")
            if opt["web"]: tools.append("web")
            lines=["platform_toolsets:","  cli:"]+["    - "+tool for tool in tools]
            lines+=["kanban:","  dispatch_in_gateway: false","  review_dispatch: false",
                    "approvals:","  mode: manual","  cron_mode: deny",
                    "  single_query_mode: deny","  unattended_mode: deny",
                    "  mcp_reload_confirm: true","  destructive_slash_confirm: true"]
            (folder/"config.yaml").write_text("\n".join(lines)+"\n",encoding="utf8")
            if name!="default":
                (folder/"SOUL.md").write_text("# "+name+"\n",encoding="utf8")
            for n in doctor.COMMON:
                skill=folder/"skills"/n/"SKILL.md"
                skill.parent.mkdir(parents=True,exist_ok=True)
                skill.write_text("---\nname: "+n+"\n---\n",encoding="utf8")
            if name!="default":
                for n in (*doctor.ADDITIONAL_EMPLOYEE,"nyoba-"+name+"-special-a","nyoba-"+name+"-special-b"):
                    skill=folder/"skills"/n/"SKILL.md"
                    skill.parent.mkdir(parents=True,exist_ok=True)
                    skill.write_text("---\nname: "+n+"\n---\n",encoding="utf8")
        self.board=self.root/"kanban.db"
        with closing(sqlite3.connect(self.board)) as db:
            db.execute("CREATE TABLE tasks (id TEXT PRIMARY KEY,status TEXT NOT NULL)")
            db.executemany("INSERT INTO tasks VALUES (?,?)",
                           [("t_00000001","blocked"),("t_00000002","blocked")])
            db.commit()


    def test_all_seven_safe_profile_scopes(self):
        for name in doctor.EXPECTED:
            self.assertEqual(doctor.check_profile(name,self.root)["status"],"PASS",name)

    def test_missing_required_added_employee_skill_rejected(self):
        extra=doctor.ADDITIONAL_EMPLOYEE[0]
        (self.root/"profiles"/"siti"/"skills"/extra/"SKILL.md").unlink()
        self.assertEqual(doctor.check_profile("siti",self.root)["status"],"FAIL")

    def test_unapproved_extra_employee_skill_rejected(self):
        extra=self.root/"profiles"/"alex"/"skills"/"nyoba-surprise-tool"/"SKILL.md"
        extra.parent.mkdir(parents=True,exist_ok=True)
        extra.write_text("---\nname: nyoba-surprise-tool\n---\n",encoding="utf8")
        self.assertEqual(doctor.check_profile("alex",self.root)["status"],"FAIL")

    def test_missing_profile_memory_is_rejected(self):
        (self.root/"profiles"/"siti"/"memories").rmdir()
        self.assertEqual(doctor.check_profile("siti",self.root)["status"],"FAIL")

    def test_missing_default_skill_rejected(self):
        (self.root/"skills"/doctor.COMMON[0]/"SKILL.md").unlink()
        self.assertEqual(doctor.check_profile("default",self.root)["status"],"FAIL")

    def test_gateway_dispatch_true_rejected(self):
        path=self.root/"profiles"/"praroro"/"config.yaml"
        path.write_text(path.read_text().replace("dispatch_in_gateway: false",
                                                    "dispatch_in_gateway: true"),encoding="utf8")
        self.assertEqual(doctor.check_profile("praroro",self.root)["status"],"FAIL")

    def test_review_dispatch_true_rejected(self):
        path=self.root/"profiles"/"siti"/"config.yaml"
        path.write_text(path.read_text().replace("review_dispatch: false",
                                                    "review_dispatch: true"),encoding="utf8")
        self.assertEqual(doctor.check_profile("siti",self.root)["status"],"FAIL")

    def test_privileged_toolset_rejected(self):
        path=self.root/"profiles"/"subagjo"/"config.yaml"
        path.write_text(path.read_text().replace("    - skills","    - skills\n    - terminal"),encoding="utf8")
        self.assertEqual(doctor.check_profile("subagjo",self.root)["status"],"FAIL")

    def test_unsafe_approval_mode_rejected(self):
        path=self.root/"profiles"/"alex"/"config.yaml"
        path.write_text(path.read_text().replace("  unattended_mode: deny",
                                                    "  unattended_mode: approve"),encoding="utf8")
        self.assertEqual(doctor.check_profile("alex",self.root)["status"],"FAIL")

    def test_duplicate_cli_tool_rejected(self):
        path=self.root/"profiles"/"paijo"/"config.yaml"
        path.write_text(path.read_text().replace("    - skills","    - skills\n    - skills"),encoding="utf8")
        self.assertEqual(doctor.check_profile("paijo",self.root)["status"],"FAIL")

    def test_official_board_readonly_integrity(self):
        r=doctor.inspect_official_board(self.board)
        self.assertEqual(r["status"],"PASS",r["summary"])
        self.assertIn("blocked=2",r["summary"])

    def test_nonblocked_task_fails_closed(self):
        with closing(sqlite3.connect(self.board)) as db:
            db.execute("UPDATE tasks SET status='running' WHERE id='t_00000001'")
            db.commit()
        self.assertEqual(doctor.inspect_official_board(self.board)["status"],"FAIL")

    def test_empty_or_missing_official_board_fails(self):
        self.assertEqual(doctor.inspect_official_board(self.root/"missing.db")["status"],"FAIL")
        with closing(sqlite3.connect(self.board)) as db:
            db.execute("DELETE FROM tasks")
            db.commit()
        self.assertEqual(doctor.inspect_official_board(self.board)["status"],"FAIL")

    def test_gateway_official_cli_stopped(self):
        fake=self.root/"hermes.exe"
        fake.write_text("placeholder",encoding="utf8")
        done=type("Result",(),{"returncode":0,
             "stdout":"Gateways:\n"+"\n".join(
                 "profile "+n+" — not running" for n in ("default",*doctor.NAMES))})()
        with patch("doctor.subprocess.run",return_value=done) as run:
            res=doctor.check_gateway(fake,self.root)
        self.assertEqual(res["status"],"PASS")
        self.assertEqual(run.call_args.args[0][-2:],["gateway","list"])

    def test_gateway_running_detected(self):
        fake=self.root/"hermes.exe"
        fake.write_text("placeholder",encoding="utf8")
        done=type("Result",(),{"returncode":0,"stdout":"default running\nsiti — not running"})()
        with patch("doctor.subprocess.run",return_value=done):
            self.assertEqual(doctor.check_gateway(fake,self.root)["status"],"FAIL")

    def test_office_fails_closed_when_board_snapshot_is_stale(self):
        import io
        import json
        snapshot={
            "hermes":{"board":doctor.BOARD,"task_count":7},
            "employees":{name:{} for name in doctor.NAMES},
            "dispatch":{"enabled":False},
        }
        payload=json.dumps(snapshot).encode("utf8")
        with patch("doctor.urllib.request.urlopen",return_value=io.BytesIO(payload)):
            result=doctor.check_office(expected_task_count=8)
        self.assertEqual(result["status"],"FAIL")
        self.assertIn("STALE",result["summary"])

    def test_office_accepts_matching_board_snapshot(self):
        import io
        import json
        snapshot={
            "hermes":{"board":doctor.BOARD,"task_count":8},
            "employees":{name:{} for name in doctor.NAMES},
            "dispatch":{"enabled":False},
        }
        payload=json.dumps(snapshot).encode("utf8")
        with patch("doctor.urllib.request.urlopen",return_value=io.BytesIO(payload)):
            self.assertEqual(doctor.check_office(expected_task_count=8)["status"],"PASS")

    def test_gateway_absent_fails(self):
        self.assertEqual(doctor.check_gateway(self.root/"missing.exe",self.root)["status"],"FAIL")


if __name__=="__main__":
    unittest.main()
