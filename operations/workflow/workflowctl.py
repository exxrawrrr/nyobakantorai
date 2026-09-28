"""Owner-only deterministic workflow for existing official Hermes BLOCKED tasks.

No LLM, scheduler, messaging, employee dispatch, new task store, or QA verdict.
"""
import argparse
import json
from pathlib import Path
import sys

OPS = Path(__file__).resolve().parents[1]
HANDOFF_DIR = OPS / "handoff"
if str(HANDOFF_DIR) not in sys.path:
    sys.path.insert(0, str(HANDOFF_DIR))
import packetctl
import receiptctl

ROUTES = {
    "coordination": ("praroro", "Coordinate owner-approved, bounded cross-team planning"),
    "metrics": ("paijo", "Analyze sourced figures and assumptions without changing accounts"),
    "engineering": ("subagjo", "Review source and propose a reversible engineering change"),
    "strategy": ("alex", "Produce a bounded strategy or research experiment"),
    "creative": ("sumiati", "Draft copy, visual brief or creative material without publishing"),
    "quality": ("siti", "Review a separately produced result with independent evidence"),
}
ALLOWED_PRIVACY = ("PUBLIC", "INTERNAL")
ALLOWED_ACTIONS = ("DRAFT_ONLY", "APPROVED_READ_ONLY")
TOOL_DESIGN = {
    "praroro": ("skills", "kanban"),
    "paijo": ("skills", "web"),
    "subagjo": ("skills", "web", "kanban"),
    "alex": ("skills", "web"),
    "sumiati": ("skills",),
    "siti": ("skills", "web", "kanban"),
}


class WorkflowError(Exception):
    pass
def plan(category, privacy, action):
    if not isinstance(category, str) or category not in ROUTES:
        raise WorkflowError("Unknown work category: no implicit AI assignment")
    if privacy not in ALLOWED_PRIVACY:
        raise WorkflowError("Confidential/secret input requires separate approval")
    if action not in ALLOWED_ACTIONS:
        raise WorkflowError("External writes, paid calls and account changes are outside this workflow")
    role, description = ROUTES[category]
    return {
        "category": category, "suggested_employee": role, "role_scope": description,
        "privacy_class": privacy, "requested_action": action,
        "tool_configuration_reference_only": list(TOOL_DESIGN[role]),
        "tool_access_authorized": False, "tool_runtime_verified": False,
        "actual_employee_run": False, "official_task_id": None,
        "next_step": "Owner review; create or select an official blocked task separately",
        "status": "ROUTING_PREVIEW_ONLY",
    }


def official(task_id, category, *, exporter=False):
    route = plan(category, "INTERNAL", "DRAFT_ONLY")
    if not isinstance(task_id, str) or not packetctl.TASK_ID.fullmatch(task_id):
        raise WorkflowError("Invalid official task ID")
    employee, _ = packetctl.read_canonical_handoff(task_id)
    if employee != route["suggested_employee"]:
        raise WorkflowError("Existing official assignee does not match selected work category")
    result = {
        "task_id": task_id, "official_assignee": employee,
        "board": "nyobakantorai", "official_state": "BLOCKED",
        "route": category, "delivery": "NOT_SENT", "inference": "NOT_PERFORMED",
        "independent_qa": "NOT_VERIFIED", "automatic_chatgpt_bridge": False,
        "tool_use": "NONE_BY_WORKFLOW", "status": "OWNER_MANUAL_HANDOFF_ELIGIBLE",
    }
    if exporter:
        record = packetctl.export_packet(task_id)
        result.update({"packet_path": record["packet_path"],
                       "packet_sha256": record["sha256"],
                       "status": "MANUAL_PACKET_PREPARED_NOT_SENT"})
    return result
def handoff_preview(task_id, from_employee, category):
    if not isinstance(from_employee, str) or from_employee not in packetctl.ROLES:
        raise WorkflowError("Handoff origin must be a named employee")
    record = official(task_id, category)
    if from_employee == record["official_assignee"]:
        raise WorkflowError("Source and destination employee must differ")
    record.update({
        "claimed_origin": from_employee,
        "origin_authenticated": False,
        "destination": record["official_assignee"],
        "manual_owner_transfer_required": True,
        "handoff_status": "DRAFT_NOT_DELIVERED",
        "next_step": "Owner manually transfers the existing official task packet; receipt needed",
    })
    return record


def reviewer_request(receipt_path):
    path = receiptctl.local_file(receipt_path, receiptctl.RECEIPTS, 12000)
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise WorkflowError("Malformed owner-submitted receipt") from exc
    if not isinstance(record, dict):
        raise WorkflowError("Owner-submitted receipt is not a valid record")
    data = receiptctl.validate_submission(record.get("owner_submission"))
    if data["surface"] == "SYNTHETIC_FIXTURE":
        raise WorkflowError("Synthetic fixtures cannot enter operational QA request flow")
    if data["employee"] == "siti":
        raise WorkflowError("Siti cannot independently review her own work")
    output = receiptctl.qa_handoff(path)
    return {
        "task_id": data["task_id"], "author": data["employee"],
        "requested_reviewer": "siti", "qa_packet_path": output["qa_packet_path"],
        "qa_status": "AWAITING_INDEPENDENT_REVIEW", "delivery": "NOT_SENT",
        "official_task_state": "BLOCKED", "independent_qa_executed": False,
    }


def main(argv=None):
    cli = argparse.ArgumentParser(description="Owner-only deterministic workflow, no auto-dispatch")
    sub = cli.add_subparsers(dest="command", required=True)
    p = sub.add_parser("route")
    p.add_argument("--category", required=True)
    p.add_argument("--privacy", default="INTERNAL")
    p.add_argument("--action", default="DRAFT_ONLY")
    for name in ("inspect", "prepare"):
        s = sub.add_parser(name)
        s.add_argument("--task-id", required=True)
        s.add_argument("--category", required=True)
    h = sub.add_parser("handoff-preview")
    h.add_argument("--task-id", required=True)
    h.add_argument("--from-employee", required=True)
    h.add_argument("--category", required=True)
    q = sub.add_parser("review-request")
    q.add_argument("--receipt", required=True)
    args = cli.parse_args(argv)
    try:
        if args.command == "route":
            out = plan(args.category, args.privacy, args.action)
        elif args.command in ("inspect", "prepare"):
            out = official(args.task_id, args.category, exporter=args.command == "prepare")
        elif args.command == "handoff-preview":
            out = handoff_preview(args.task_id, args.from_employee, args.category)
        else:
            out = reviewer_request(args.receipt)
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0
    except (WorkflowError, packetctl.PacketError, receiptctl.ReceiptError,
            OSError, TimeoutError, UnicodeError, ValueError) as exc:
        print(f"BLOCKED: {type(exc).__name__}; official task and dispatch unchanged", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
