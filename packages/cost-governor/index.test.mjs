import test from "node:test";
import assert from "node:assert/strict";
import {
  assessCostAdmission,
  createCostGovernor,
  reconcileCostLedger,
} from "./index.mjs";

const policy={
  schema:1,
  currency:"USD",
  thresholds:{warning_ratio:0.70,reroute_ratio:0.85,approval_ratio:0.95},
  daily_limit_amount:10,
  project_limits:{alpha:5},
  mission_limits:{"mission-1":2},
  employee_limits:{alex:1},
};

const context={
  at:"2026-10-02T03:00:00.000Z",
  project_id:"alpha",
  mission_id:"mission-1",
  employee_id:"alex",
  mission_budget:{hard_limit_amount:1.5,currency:"USD"},
};

function entry(overrides={}){
  return {
    schema:1,
    cost_id:"cost-1",
    occurred_at:"2026-10-02T02:00:00.000Z",
    project_id:"alpha",
    mission_id:"mission-1",
    task_id:"task-1",
    employee_id:"alex",
    cost_type:"MODEL",
    provider_id:"provider-a",
    model_id:"model-a",
    tool_id:null,
    cost:{status:"KNOWN",amount:0.4,currency:"USD"},
    evidence_refs:["evidence:cost-1"],
    ...overrides,
  };
}

test("cost governor applies day/project/mission/employee scopes and mission budget chooses the stricter mission limit",()=>{
  const result=assessCostAdmission({
    policy,
    ledger:[entry()],
    context,
    estimate:{status:"KNOWN",amount:0.1,currency:"USD"},
  });
  assert.equal(result.action,"ALLOW");
  const scopes=Object.fromEntries(result.scopes.map((s)=>[s.kind,s]));
  assert.equal(scopes.DAY.limit,10);
  assert.equal(scopes.PROJECT.limit,5);
  assert.equal(scopes.MISSION.limit,1.5);
  assert.equal(scopes.EMPLOYEE.limit,1);
  assert.equal(scopes.MISSION.spent_amount,0.4);
  assert.equal(scopes.MISSION.projected_amount,0.5);
});

test("warning threshold is visible before hard budget exhaustion",()=>{
  const result=assessCostAdmission({
    policy,
    ledger:[entry({cost:{status:"KNOWN",amount:0.65,currency:"USD"}})],
    context,
    estimate:{status:"KNOWN",amount:0.08,currency:"USD"},
  });
  assert.equal(result.action,"WARN");
  assert.ok(result.reason_codes.includes("COST_WARNING_THRESHOLD_REACHED"));
});

test("reroute threshold recommends a cheaper alternative",()=>{
  const result=assessCostAdmission({
    policy,
    ledger:[entry({cost:{status:"KNOWN",amount:0.75,currency:"USD"}})],
    context,
    estimate:{status:"KNOWN",amount:0.12,currency:"USD"},
    alternatives:[
      {id:"fallback-expensive",cost:{status:"KNOWN",amount:0.11,currency:"USD"}},
      {id:"fallback-cheap",cost:{status:"KNOWN",amount:0.03,currency:"USD"}},
    ],
  });
  assert.equal(result.action,"REROUTE");
  assert.equal(result.recommended_alternative.id,"fallback-cheap");
  assert.ok(result.reason_codes.includes("COST_REROUTE_THRESHOLD_REACHED"));
});

test("approval threshold requires approval and an approval ref only authorizes spend below the hard stop",()=>{
  const withoutApproval=assessCostAdmission({
    policy,
    ledger:[entry({cost:{status:"KNOWN",amount:0.90,currency:"USD"}})],
    context,
    estimate:{status:"KNOWN",amount:0.06,currency:"USD"},
  });
  assert.equal(withoutApproval.action,"APPROVAL_REQUIRED");

  const approved=assessCostAdmission({
    policy,
    ledger:[entry({cost:{status:"KNOWN",amount:0.90,currency:"USD"}})],
    context,
    estimate:{status:"KNOWN",amount:0.06,currency:"USD"},
    approval_ref:"approval:owner:cost-1",
  });
  assert.equal(approved.action,"WARN");
  assert.ok(approved.reason_codes.includes("COST_OVERAGE_APPROVED_BELOW_HARD_LIMIT"));

  const hardStop=assessCostAdmission({
    policy,
    ledger:[entry({cost:{status:"KNOWN",amount:0.95,currency:"USD"}})],
    context,
    estimate:{status:"KNOWN",amount:0.10,currency:"USD"},
    approval_ref:"approval:owner:cost-2",
  });
  assert.equal(hardStop.action,"STOP");
  assert.ok(hardStop.reason_codes.includes("HARD_BUDGET_LIMIT_REACHED"));
});

test("unknown projected cost or unresolved unknown ledger entry stops bounded spend instead of treating unknown as zero",()=>{
  const unknownEstimate=assessCostAdmission({
    policy,
    ledger:[],
    context,
    estimate:{status:"UNKNOWN",amount:null,currency:null},
  });
  assert.equal(unknownEstimate.action,"STOP");
  assert.ok(unknownEstimate.reason_codes.includes("PROJECTED_COST_UNKNOWN"));

  const unresolved=assessCostAdmission({
    policy,
    ledger:[entry({cost:{status:"UNKNOWN",amount:null,currency:null}})],
    context,
    estimate:{status:"KNOWN",amount:0.01,currency:"USD"},
  });
  assert.equal(unresolved.action,"STOP");
  assert.ok(unresolved.reason_codes.includes("UNRECONCILED_UNKNOWN_COST"));
});

test("ledger reconciles provider/model/tool dimensions without double-counting entries",()=>{
  const ledger=[
    entry({cost_id:"model-1",cost_type:"MODEL",provider_id:"p1",model_id:"m1",tool_id:null,cost:{status:"KNOWN",amount:0.2,currency:"USD"}}),
    entry({cost_id:"tool-1",cost_type:"TOOL",provider_id:"p1",model_id:null,tool_id:"search",cost:{status:"KNOWN",amount:0.1,currency:"USD"}}),
    entry({cost_id:"provider-unknown",cost_type:"PROVIDER",provider_id:"p2",model_id:null,tool_id:null,cost:{status:"UNKNOWN",amount:null,currency:null}}),
  ];
  const result=reconcileCostLedger({policy,ledger});
  assert.equal(result.totals.known_amount,0.3);
  assert.equal(result.totals.unknown_entries,1);
  assert.deepEqual(result.by_provider.map((x)=>[x.id,x.known_amount,x.unknown_entries]),[
    ["p1",0.3,0],
    ["p2",0,1],
  ]);
  assert.deepEqual(result.by_model.map((x)=>x.id),["m1"]);
  assert.deepEqual(result.by_tool.map((x)=>x.id),["search"]);
});

test("stateful governor records actual cost and future admissions use reconciled spend",()=>{
  const governor=createCostGovernor({policy,clock:()=>"2026-10-02T03:00:00.000Z"});
  const first=governor.admit({
    context,
    estimate:{status:"KNOWN",amount:0.4,currency:"USD"},
  });
  assert.equal(first.action,"ALLOW");

  governor.record({
    cost_id:"actual-1",
    project_id:"alpha",
    mission_id:"mission-1",
    task_id:"task-1",
    employee_id:"alex",
    cost_type:"MODEL",
    provider_id:"p1",
    model_id:"m1",
    cost:{status:"KNOWN",amount:0.8,currency:"USD"},
    evidence_refs:["receipt:actual-1"],
  });

  const second=governor.admit({
    context:{...context,mission_id:"mission-2",mission_budget:{hard_limit_amount:3,currency:"USD"}},
    estimate:{status:"KNOWN",amount:0.1,currency:"USD"},
  });
  assert.equal(second.action,"REROUTE");
  assert.equal(governor.snapshot().ledger.totals.known_amount,0.8);
});
