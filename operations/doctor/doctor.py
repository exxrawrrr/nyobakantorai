"""Read-only nyobakantorai diagnostics for installed Hermes v0.21.3.

No model/API calls, provider auth, gateway startup, DB writes, cron, or external URL.
Never prints config/auth/secret contents or task titles/bodies.
"""
from __future__ import annotations
import argparse
from contextlib import closing
from datetime import datetime
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import shutil
import urllib.request
import yaml

HOME = Path(os.environ.get("NYOBAKANTORAI_HERMES_HOME", str(Path.home()/".hermes")))
EXE_NAME = os.environ.get("NYOBAKANTORAI_HERMES_EXE", "hermes")
EXE = Path(shutil.which(EXE_NAME) or EXE_NAME)
BOARD = os.environ.get("NYOBAKANTORAI_BOARD", "nyobakantorai")
NAMES = ("praroro", "paijo", "subagjo", "alex", "sumiati", "siti")
COMMON = ("nyoba-task-truth", "nyoba-manual-chatgpt-handoff", "nyoba-approval-and-evidence")
ADDITIONAL_EMPLOYEE = ("nyoba-safe-tool-use",)
EXPECTED = {
    "default": {"skills":3, "kanban":False, "web":False},
    "praroro":{"skills":6,"kanban":True,"web":False},
    "paijo":{"skills":6,"kanban":False,"web":True},
    "subagjo":{"skills":6,"kanban":True,"web":True},
    "alex":{"skills":6,"kanban":False,"web":True},
    "sumiati":{"skills":6,"kanban":False,"web":False},
    "siti":{"skills":6,"kanban":True,"web":True},
}
DANGEROUS = {"terminal","file","browser","computer_use","code_execution",
             "cronjob","delegation","a2a","image_gen","video_gen","connections"}


def outcome(name:str, ok:bool, detail:str, *, warning:bool=False)->dict:
    return {"component":name,"status":"WARN" if warning else ("PASS" if ok else "FAIL"),
            "summary":detail}


def check_profile(name:str, root:Path=HOME)->dict:
    try:
        profile=root if name=="default" else root/"profiles"/name
        config=profile/"config.yaml"
        if not config.is_file() or profile.is_symlink():
            return outcome("profile_"+name,False,"Required profile config missing or profile is a symlink")
        memory_dir=profile/"memories"
        if not memory_dir.is_dir() or memory_dir.is_symlink():
            return outcome("profile_"+name,False,"Profile memory directory missing or linked elsewhere")
        data=yaml.safe_load(config.read_text(encoding="utf8")) or {}
        t=data.get("platform_toolsets") or {}
        cli=t.get("cli") or []
        if not isinstance(cli,list) or len(cli)!=len(set(cli)):
            return outcome("profile_"+name,False,"CLI toolsets invalid or duplicated")
        if not set(("clarify","memory","session_search","todo","skills")).issubset(set(cli)):
            return outcome("profile_"+name,False,"Safe baseline CLI toolsets missing")
        opt=EXPECTED[name]
        skill_files=list((profile/"skills").glob("nyoba-*/SKILL.md"))
        names={p.parent.name for p in skill_files}
        expected_count=opt["skills"]
        required=set(COMMON) | (set(ADDITIONAL_EMPLOYEE) if name!="default" else set())
        if len(skill_files)!=expected_count or not required.issubset(names):
            return outcome("profile_"+name,False,"Expected safe local skill set missing; count="+str(len(skill_files)))
        if any(p.is_symlink() or p.parent.is_symlink() for p in skill_files):
            return outcome("profile_"+name,False,"Unexpected symlink in skill tree")
        if bool("kanban" in cli)!=opt["kanban"] or bool("web" in cli)!=opt["web"]:
            return outcome("profile_"+name,False,"Toolset scope changed unexpectedly; review before worker use")
        if DANGEROUS.intersection(cli):
            return outcome("profile_"+name,False,"Privileged toolset unexpectedly enabled")
        gate=data.get("kanban") or {}
        if gate.get("dispatch_in_gateway") is not False or gate.get("review_dispatch") is not False:
            return outcome("profile_"+name,False,"Gateway dispatch/review dispatch not explicitly disabled")
        approvals=data.get("approvals") or {}
        expected_approvals={"mode":"manual","cron_mode":"deny","single_query_mode":"deny",
                            "unattended_mode":"deny","mcp_reload_confirm":True,
                            "destructive_slash_confirm":True}
        if not isinstance(approvals,dict) or any(approvals.get(k)!=v for k,v in expected_approvals.items()):
            return outcome("profile_"+name,False,"Explicit gateway and command approval guard missing or relaxed")
        if name!="default":
            if not (profile/"SOUL.md").is_file():
                return outcome("profile_"+name,False,"Employee SOUL missing")
        return outcome("profile_"+name,True,"Canonical config, role skills, CLI scope and no-auto-dispatch verified")
    except (OSError,UnicodeError,ValueError,yaml.YAMLError,TypeError) as error:
        return outcome("profile_"+name,False,"Read/parse failure: "+type(error).__name__)


def inspect_official_board(dbfile:Path)->dict:
    if not dbfile.is_file():
        return outcome("official_kanban",False,"Configured Hermes Kanban SQLite missing")
    try:
        uri="file:"+dbfile.as_posix()+"?mode=ro"
        with closing(sqlite3.connect(uri,uri=True,timeout=3)) as conn:
            conn.execute("PRAGMA query_only=ON")
            integrity=conn.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity!="ok":
                return outcome("official_kanban",False,"SQLite integrity check FAILED")
            rows=conn.execute("SELECT status,COUNT(*) FROM tasks GROUP BY status").fetchall()
            total=sum(n for _,n in rows)
            statuses={str(s):int(n) for s,n in rows}
        if total<2:
            return outcome("official_kanban",False,"Preexisting board tasks missing; count="+str(total))
        if any(k!="blocked" for k in statuses):
            return outcome("official_kanban",False,
                           "Unexpected nonblocked lifecycle status detected; count="+str(total))
        return outcome("official_kanban",True,"Official board integrity=ok; task_count="+str(total)+
                       "; blocked="+str(statuses.get("blocked",0))+"; no task content printed")
    except (sqlite3.Error,OSError) as error:
        return outcome("official_kanban",False,"Read-only board audit failed: "+type(error).__name__)


def check_gateway(exe:Path=EXE,home:Path=HOME)->dict:
    if not exe.is_file():
        return outcome("gateway",False,"Pinned Hermes CLI missing")
    env=os.environ.copy()
    env["HERMES_HOME"]=str(home)
    try:
        response=subprocess.run([str(exe),"gateway","list"],env=env,text=True,
                    encoding="utf8",errors="replace",capture_output=True,timeout=15)
    except (OSError,subprocess.TimeoutExpired) as error:
        return outcome("gateway",False,"Hermes gateway check failed: "+type(error).__name__)
    if response.returncode!=0:
        return outcome("gateway",False,"Hermes gateway list exit="+str(response.returncode))
    stopped=len(re.findall(r"\bnot running\b",response.stdout,re.I))
    if stopped!=7:
        return outcome("gateway",False,"Not all seven gateways confirmed stopped; count="+str(stopped))
    return outcome("gateway",True,"All seven Hermes gateways stopped; no worker launched")


def check_office(expected_task_count:int|None=None)->dict:
    """Optional localhost read-only status. Never changes office, Hermes or browser."""
    try:
        port=int(os.environ.get("NYOBAKANTORAI_PORT", "4322"))
        request=urllib.request.Request(f"http://127.0.0.1:{port}/api/runtime",
                                       headers={"Accept":"application/json"},method="GET")
        with urllib.request.urlopen(request,timeout=19) as response:
            data=json.load(response)
        hermes=data.get("hermes") or {}
        employees=data.get("employees") or {}
        dispatcher=data.get("dispatch") or {}
        if hermes.get("board")!=BOARD or len(employees)!=6 or dispatcher.get("enabled") is not False:
            return outcome("pixel_readonly",False,"office official-board/profile/dispatch contract differs from Hermes")
        count=hermes.get("task_count")
        if not isinstance(count,int) or count<2:
            return outcome("pixel_readonly",False,"office official task count missing")
        if expected_task_count is not None and count!=expected_task_count:
            return outcome("pixel_readonly",False,"STALE office task snapshot: official Hermes count differs from office")
        return outcome("pixel_readonly",True,"Live office official-board="+BOARD+
                       "; task_count="+str(count)+"; six profiles; UI dispatch=false")
    except (OSError,ValueError,TypeError,KeyError,TimeoutError) as error:
        return outcome("pixel_readonly",False,"Optional localhost office audit failed: "+type(error).__name__)


def main(argv=None):
    parser=argparse.ArgumentParser(description="Read-only offline Hermes + nyobakantorai board health audit")
    parser.add_argument("--check-office",action="store_true",
                        help="Also read existing localhost Pixel office adapter; never start or edit it")
    args=parser.parse_args(argv)
    results=[check_profile(n) for n in ("default",*NAMES)]
    results.append(inspect_official_board(HOME/"kanban"/"boards"/BOARD/"kanban.db"))
    results.append(check_gateway())
    if args.check_office:
        official=results[-2]
        found=re.search(r"task_count=(\d+)",official["summary"])
        expected=int(found.group(1)) if official["status"]=="PASS" and found else None
        results.append(check_office(expected_task_count=expected))
    overall="PASS" if all(x["status"]=="PASS" for x in results) else "NEEDS_REVIEW"
    print(json.dumps({"audit":"NYOBAKANTORAI_HERMES_OFFLINE_DOCTOR_V1",
        "timestamp_local":datetime.now().astimezone().isoformat(timespec="seconds"),
        "overall":overall,"checked":len(results),"results":results,
        "provenance":"READ_ONLY_NO_MODEL_NO_TELEGRAM_NO_PROVIDER_AUTH_NO_PRODUCTION_WRITE"},
        indent=2,ensure_ascii=False))
    return 0 if overall=="PASS" else 2


if __name__=="__main__":
    sys.exit(main())
