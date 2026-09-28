"""Official Hermes Kanban OWNER task intake. No LLM, dispatch, approval or Telegram."""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
import yaml

HOME = Path(os.environ.get("NYOBAKANTORAI_HERMES_HOME", str(Path.home()/".hermes")))
HERMES_NAME = os.environ.get("NYOBAKANTORAI_HERMES_EXE", "hermes")
HERMES = Path(shutil.which(HERMES_NAME) or HERMES_NAME)
BOARD = os.environ.get("NYOBAKANTORAI_BOARD", "nyobakantorai")
EMPLOYEES = ("praroro","paijo","subagjo","alex","sumiati","siti")
KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{5,79}$")
TASK_ID = re.compile(r"^t_[a-f0-9]{8,32}$")
SECRET = re.compile(r"(?i)(?:bearer\s+\S{16,}|(?:api[_ -]?key|token|password|cookie|secret)\s*[:=]\s*\S{8,}|-----BEGIN [A-Z ]+PRIVATE KEY-----|sk-[\w-]{18,}|telegram\.org/bot\d+:)")


class TaskError(Exception):
    pass


def checked(text, label, limit):
    s=text.strip()
    if not s or len(s)>limit or any(ord(c)<32 for c in s) or SECRET.search(s):
        raise TaskError(label + ": must be single-line and nonsecret; size exceeded or invalid")
    return s


def contract(employee, title, goal, request_id, done, privacy):
    if employee not in EMPLOYEES or privacy not in ("PUBLIC","INTERNAL") or not KEY.fullmatch(request_id):
        raise TaskError("Employee, privacy or request id not allowed")
    return dict(
        employee=employee,title=checked(title,"title",100),goal=checked(goal,"goal",320),
        done=checked(done,"done",230),request_id=request_id,privacy=privacy
    )


def body(data):
    return "\n".join((
        "NYOBAKANTORAI_TASK_V1 / OWNER MANUAL TASK / NOT EXECUTED",
        "source_system=OWNER_LOCAL_TASKCTL",
        "source_id="+data["request_id"],
        "privacy_class="+data["privacy"],
        "execution_surface=CHATGPT_REGULAR_MANUAL",
        "goal="+data["goal"],
        "definition_of_done="+data["done"],
        "allowed_actions=DRAFT_ONLY; APPROVED_READ_ONLY",
        "blocked_reason=Employee inference and ChatGPT private-chat bridge not verified",
        "approval=NOT_GRANTED; qa=NOT_VERIFIED; delivery=NOT_SENT"
    ))


def safe_config(home=HOME):
    for name in ("default",*EMPLOYEES):
        p=home/"config.yaml" if name=="default" else home/"profiles"/name/"config.yaml"
        data=yaml.safe_load(p.read_text(encoding="utf8")) or {}
        k=data.get("kanban",{})
        if k.get("dispatch_in_gateway") is not False or k.get("review_dispatch") is not False:
            return False
    return True


def preflight():
    if not safe_config():
        raise TaskError("Safety gate: all seven Hermes gateway dispatch settings must be OFF")
    if not HERMES.is_file() or not (HOME/"kanban/boards"/BOARD/"kanban.db").is_file():
        raise TaskError("Hermes CLI or configured board not installed")


def cli(args):
    env=os.environ.copy()
    env.update({"HERMES_HOME":str(HOME),"NO_COLOR":"1"})
    if any(k.startswith("HERMES_KANBAN_") for k in env):
        raise TaskError("Official owner task controller may not run inside a Hermes worker/subagent")
    for k in tuple(env):
        if k.startswith("HERMES_KANBAN_") or k in ("HERMES_PROFILE","HERMES_TENANT"):
            env.pop(k,None)
    r=subprocess.run([str(HERMES),"kanban","--board",BOARD,*args],env=env,
                     capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=20)
    if r.returncode:
        raise TaskError("Official Hermes board command failed (exit "+str(r.returncode)+"); inspect locally")
    return r.stdout.strip()


def create(data):
    preflight()
    response=json.loads(cli(["create","--initial-status","blocked","--assignee",data["employee"],
        "--body",body(data),"--idempotency-key","nyoba-v1-"+data["request_id"],
        "--created-by","nyobakantorai-owner-taskctl","--max-retries","1","--json",data["title"]]))
    ident=response.get("id",response.get("task_id"))
    if not isinstance(ident,str) or not TASK_ID.fullmatch(ident):
        raise TaskError("Unexpected official board create receipt, manual inspection required")
    actual=json.loads(cli(["show",ident,"--json"]))["task"]
    if (actual.get("id"),actual.get("assignee"),actual.get("status"))!=(ident,data["employee"],"blocked"):
        raise TaskError("Official task was not created in BLOCKED with correct assignee")
    if actual.get("title")!=data["title"] or actual.get("body")!=body(data):
        raise TaskError("Idempotency collision: same request id already names a different task")
    return dict(id=ident,assignee=data["employee"],status="blocked",request_id=data["request_id"],
                execution="NOT_PERFORMED",qa="NOT_VERIFIED",delivery="NOT_SENT")


def list_safe():
    preflight()
    tasks=json.loads(cli(["list","--json"]))
    if not isinstance(tasks,list):
        raise TaskError("Hermes board list format changed")
    return [dict(id=t.get("id"),title=t.get("title"),assignee=t.get("assignee"),
                 status=t.get("status")) for t in tasks]


def handoff(task_id):
    preflight()
    if not TASK_ID.fullmatch(task_id):
        raise TaskError("Invalid official task ID")
    t=json.loads(cli(["show",task_id,"--json"]))["task"]
    if t.get("id")!=task_id or t.get("status")!="blocked" or t.get("assignee") not in EMPLOYEES:
        raise TaskError("Only a blocked canonical employee task may produce manual handoff")
    message=t.get("body","")
    if not isinstance(message,str) or not message.startswith("NYOBAKANTORAI_TASK_V1 / OWNER MANUAL TASK") or SECRET.search(message):
        raise TaskError("Task not from this intake or contains private data")
    return ("MANUAL HANDOFF DRAFT — NOT SENT\nHermes official task ID: "+task_id+
            "\nEmployee chat to OPEN MANUALLY: "+t["assignee"]+
            "\nThis is NOT an automatic Hermes/ChatGPT delegation.\n"+
            message+"\nWork only with tools actually present in your ChatGPT chat; report real results, "
            "evidence and limitations. Never claim independent Siti QA or external action without receipts.")


def main():
    parser=argparse.ArgumentParser(description="OFFICIAL Hermes Kanban: owner-only blocked manual intake")
    sub=parser.add_subparsers(dest="command",required=True)
    sub.add_parser("doctor");sub.add_parser("list")
    create_cmd=sub.add_parser("create-blocked")
    for flag in ("title","goal","request-id","done"):
        create_cmd.add_argument("--"+flag,required=True)
    create_cmd.add_argument("--employee",choices=EMPLOYEES,required=True)
    create_cmd.add_argument("--privacy",choices=("PUBLIC","INTERNAL"),default="INTERNAL")
    handoff_cmd=sub.add_parser("handoff");handoff_cmd.add_argument("task_id")
    args=parser.parse_args()
    try:
        if args.command=="doctor":
            preflight()
            result={"board":BOARD,"task_count":len(list_safe()),"auto_dispatch":False,
                    "mode":"OWNER_MANUAL_BLOCKED_ONLY","model_or_gateway_started":False}
        elif args.command=="list": result=list_safe()
        elif args.command=="create-blocked":
            result=create(contract(args.employee,args.title,args.goal,args.request_id,args.done,args.privacy))
        else: result=handoff(args.task_id)
        print(result if isinstance(result,str) else json.dumps(result,indent=2,ensure_ascii=False))
    except (TaskError,ValueError,KeyError,TimeoutError,subprocess.TimeoutExpired,OSError) as exc:
        print("BLOCKED: "+type(exc).__name__+" (check official board and input locally)",file=sys.stderr)
        raise SystemExit(2)


if __name__=="__main__": main()
