import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createRecurringSchedule,
  assessScheduleTrigger,
  materializeScheduledMission,
  createApprovalRequest,
  decideApprovalRequest,
  authorizeWithApproval,
  morningBriefingFixture,
} from "./index.mjs";
import { normalizeMissionPlan } from "../mission-engine/planner.mjs";

const costPolicy=JSON.parse(readFileSync(new URL("../../config/cost-governor-policy.json",import.meta.url),"utf8"));

function fixture(overrides={}){
  const base=morningBriefingFixture();
  return createRecurringSchedule({...base,...overrides});
}

test("morning briefing fixture is timezone-bound, budgeted, read-only, and evidence-aware",()=>{
  const s=morningBriefingFixture();
  assert.equal(s.schedule_id,"morning-briefing");
  assert.equal(s.time_window.timezone,"Asia/Jakarta");
  assert.deepEqual(s.time_window,{start:"07:00",end:"09:00",timezone:"Asia/Jakarta"});
  assert.deepEqual(s.budget,{hard_limit_amount:1.5,currency:"USD"});
  assert.equal(s.risk_class,"READ_ONLY");
  assert.ok(s.required_evidence.includes("briefing-source-evidence"));
  assert.match(s.schedule_ref,/^schedule:sha256:[a-f0-9]{64}$/);
});

test("07:30 Asia/Jakarta is due while 06:59 and 09:00 are outside window",()=>{
  const s=morningBriefingFixture();
  assert.equal(assessScheduleTrigger(s,{at:"2026-10-02T00:30:00.000Z"}).due,true);
  assert.equal(assessScheduleTrigger(s,{at:"2026-10-01T23:59:00.000Z"}).reason,"OUTSIDE_TIME_WINDOW");
  assert.equal(assessScheduleTrigger(s,{at:"2026-10-02T02:00:00.000Z"}).reason,"OUTSIDE_TIME_WINDOW");
});

test("daily interval and duplicate-day trigger suppression are enforced in schedule timezone",()=>{
  const s=fixture({
    cadence:{frequency:"DAILY",interval:2,days_of_week:[]},
    starts_at:"2026-10-02T00:00:00.000Z",
  });
  assert.equal(assessScheduleTrigger(s,{at:"2026-10-03T00:30:00.000Z"}).reason,"CADENCE_INTERVAL_MISMATCH");
  assert.equal(assessScheduleTrigger(s,{at:"2026-10-04T00:30:00.000Z"}).due,true);
  assert.equal(assessScheduleTrigger(s,{
    at:"2026-10-04T01:00:00.000Z",
    previousRuns:[{triggered_at:"2026-10-04T00:30:00.000Z"}],
  }).reason,"ALREADY_TRIGGERED_THIS_DAY");
});

test("paused, expired, and max-run schedules cannot dispatch",()=>{
  const base=morningBriefingFixture();
  assert.equal(assessScheduleTrigger({...base,state:"PAUSED"},{at:"2026-10-02T00:30:00.000Z"}).reason,"SCHEDULE_PAUSED");
  assert.equal(assessScheduleTrigger({...base,expires_at:"2026-10-02T00:15:00.000Z"},{at:"2026-10-02T00:30:00.000Z"}).reason,"SCHEDULE_EXPIRED");
  assert.equal(assessScheduleTrigger({...base,max_runs:1},{at:"2026-10-02T00:30:00.000Z",previousRuns:[{triggered_at:"2026-10-01T00:30:00.000Z"}]}).reason,"SCHEDULE_MAX_RUNS_REACHED");
});

test("scheduled work materializes through normal Mission Engine contracts",()=>{
  const result=materializeScheduledMission({
    schedule:morningBriefingFixture(),
    at:"2026-10-02T00:30:00.000Z",
    costPolicy,
    estimatedCost:{status:"KNOWN",amount:0.5,currency:"USD"},
    projectId:"project-office",
    idFactory:(kind,index,label)=>kind+"-"+String(index+1).padStart(3,"0")+"-"+String(label).replace(/[^a-z0-9]+/gi,"-").toLowerCase(),
  });
  assert.equal(result.dispatched,true);
  assert.equal(result.reason,"NORMAL_MISSION_ENGINE");
  assert.equal(result.cost_decision.action,"ALLOW");
  assert.equal(normalizeMissionPlan(result.mission_plan).mission.mission_id,result.run.mission_id);
  assert.equal(result.mission_plan.mission.state,"PLANNED");
  assert.equal(result.mission_plan.mission.autonomy.mode,"GUARDED");
  assert.equal(result.mission_plan.mission.budget.hard_limit_amount,1.5);
  assert.ok(result.mission_plan.mission.constraints.some(x=>x.startsWith("scheduled_from:schedule:sha256:")));
  assert.ok(result.mission_plan.task_nodes.length>=1);
  assert.match(result.run.run_ref,/^schedule-run:sha256:[a-f0-9]{64}$/);
});

test("cost reroute, approval-required, unknown, and hard-stop states block scheduled mission creation",()=>{
  const s=morningBriefingFixture();
  const common={schedule:s,at:"2026-10-02T00:30:00.000Z",costPolicy,projectId:"project-office"};

  const reroute=materializeScheduledMission({...common,estimatedCost:{status:"KNOWN",amount:1.3,currency:"USD"}});
  assert.equal(reroute.dispatched,false);
  assert.equal(reroute.reason,"COST_REROUTE");

  const approval=materializeScheduledMission({...common,estimatedCost:{status:"KNOWN",amount:1.45,currency:"USD"}});
  assert.equal(approval.dispatched,false);
  assert.equal(approval.reason,"COST_APPROVAL_REQUIRED");

  const approved=materializeScheduledMission({...common,estimatedCost:{status:"KNOWN",amount:1.45,currency:"USD"},approvalRef:"approval:cost:001"});
  assert.equal(approved.dispatched,true);
  assert.equal(approved.cost_decision.action,"WARN");

  const unknown=materializeScheduledMission({...common,estimatedCost:{status:"UNKNOWN",amount:null,currency:null}});
  assert.equal(unknown.dispatched,false);
  assert.equal(unknown.reason,"COST_STOP");

  const hardStop=materializeScheduledMission({...common,estimatedCost:{status:"KNOWN",amount:2,currency:"USD"},approvalRef:"approval:cost:001"});
  assert.equal(hardStop.dispatched,false);
  assert.equal(hardStop.reason,"COST_STOP");
});

function approvalRequest(){
  return createApprovalRequest({
    schema:1,
    approval_id:"approval-001",
    target:{type:"BROWSER_ACTION",id:"plan-001"},
    risk_class:"EXTERNAL_WRITE",
    budget:{hard_limit_amount:5,currency:"USD"},
    reason:"Publish reviewed change to the user-owned site.",
    evidence_refs:["artifact:preview/001","browser-action-plan:001"],
    preview:"Change CTA copy from A to B on /landing.",
    scope:{actions:["click","type","submit"],resources:["https://owned.example.com","https://owned.example.com/landing"]},
    requested_at:"2026-10-02T06:00:00.000Z",
    expires_at:"2026-10-02T08:00:00.000Z",
  });
}

test("Approval Center 2.0 request contains target risk budget reason evidence preview scope and expiry",()=>{
  const request=approvalRequest();
  assert.deepEqual(request.target,{type:"BROWSER_ACTION",id:"plan-001"});
  assert.equal(request.risk_class,"EXTERNAL_WRITE");
  assert.deepEqual(request.budget,{hard_limit_amount:5,currency:"USD"});
  assert.match(request.reason,/user-owned/);
  assert.equal(request.evidence_refs.length,2);
  assert.match(request.preview,/CTA copy/);
  assert.deepEqual(request.scope.actions,["click","submit","type"]);
  assert.equal(request.status,"PENDING");
  assert.match(request.approval_ref,/^approval-request:sha256:[a-f0-9]{64}$/);
});

test("owner can approve, edit to narrower scope, or reject with bounded expiry",()=>{
  const request=approvalRequest();
  const approved=decideApprovalRequest(request,{
    actor:"owner",decision:"APPROVED",decided_at:"2026-10-02T06:15:00.000Z",
    evidence_ref:"human-review:approval/001",
  });
  assert.equal(approved.decision,"APPROVED");
  assert.equal(approved.expires_at,request.expires_at);

  const edited=decideApprovalRequest(request,{
    actor:"owner",decision:"EDITED",decided_at:"2026-10-02T06:15:00.000Z",
    expires_at:"2026-10-02T07:00:00.000Z",
    scope:{actions:["type","submit"],resources:["https://owned.example.com/landing"]},
    edited_preview:"Only update and submit /landing.",
    evidence_ref:"human-review:approval/002",
  });
  assert.equal(edited.decision,"EDITED");
  assert.deepEqual(edited.scope.actions,["submit","type"]);
  assert.deepEqual(edited.scope.resources,["https://owned.example.com/landing"]);
  assert.equal(edited.expires_at,"2026-10-02T07:00:00.000Z");

  const rejected=decideApprovalRequest(request,{
    actor:"owner",decision:"REJECTED",decided_at:"2026-10-02T06:15:00.000Z",
    evidence_ref:"human-review:approval/003",
  });
  assert.equal(rejected.decision,"REJECTED");
});

test("edited approval cannot expand action/resource scope or outlive original request",()=>{
  const request=approvalRequest();
  assert.throws(()=>decideApprovalRequest(request,{
    actor:"owner",decision:"EDITED",decided_at:"2026-10-02T06:15:00.000Z",
    scope:{actions:["delete"],resources:["https://owned.example.com/landing"]},
    edited_preview:"delete",evidence_ref:"human-review:bad/001",
  }),/cannot expand action scope/);
  assert.throws(()=>decideApprovalRequest(request,{
    actor:"owner",decision:"EDITED",decided_at:"2026-10-02T06:15:00.000Z",
    scope:{actions:["type"],resources:["https://evil.example.net"]},
    edited_preview:"bad",evidence_ref:"human-review:bad/002",
  }),/cannot expand resource scope/);
  assert.throws(()=>decideApprovalRequest(request,{
    actor:"owner",decision:"APPROVED",decided_at:"2026-10-02T06:15:00.000Z",
    expires_at:"2026-10-02T09:00:00.000Z",evidence_ref:"human-review:bad/003",
  }),/cannot exceed request expiry/);
});

test("approval authorization enforces decision scope and expiry at point of use",()=>{
  const request=approvalRequest();
  const decision={
    actor:"owner",decision:"EDITED",decided_at:"2026-10-02T06:15:00.000Z",
    expires_at:"2026-10-02T07:00:00.000Z",
    scope:{actions:["type","submit"],resources:["https://owned.example.com/landing"]},
    edited_preview:"Only landing update.",evidence_ref:"human-review:approval/004",
  };
  assert.equal(authorizeWithApproval(request,decision,{action:"type",resource:"https://owned.example.com/landing",at:"2026-10-02T06:30:00.000Z"}).allowed,true);
  assert.equal(authorizeWithApproval(request,decision,{action:"click",resource:"https://owned.example.com/landing",at:"2026-10-02T06:30:00.000Z"}).reason,"APPROVAL_SCOPE_MISMATCH");
  assert.equal(authorizeWithApproval(request,decision,{action:"type",resource:"https://owned.example.com/landing",at:"2026-10-02T07:00:00.000Z"}).reason,"APPROVAL_EXPIRED");

  const rejected={actor:"owner",decision:"REJECTED",decided_at:"2026-10-02T06:15:00.000Z",evidence_ref:"human-review:approval/005"};
  assert.equal(authorizeWithApproval(request,rejected,{action:"type",resource:"https://owned.example.com/landing",at:"2026-10-02T06:30:00.000Z"}).reason,"APPROVAL_REJECTED");
});

test("non-owner cannot approve and wildcard resource scope is rejected",()=>{
  const request=approvalRequest();
  assert.throws(()=>decideApprovalRequest(request,{
    actor:"siti",decision:"APPROVED",decided_at:"2026-10-02T06:15:00.000Z",evidence_ref:"human-review:x",
  }),/Only owner/);
  assert.throws(()=>createApprovalRequest({
    ...request,approval_id:"approval-wild",scope:{actions:["submit"],resources:["*"]},
  }),/wildcard/);
});
