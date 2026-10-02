import test from "node:test";
import assert from "node:assert/strict";
import { admitLiveSandboxDispatch, defineLiveSandboxPolicy, settleLiveSandbox } from "../live-sandbox/index.mjs";
import { buildExecutionTelemetry, buildMissionTelemetry, EXECUTION_TELEMETRY_API } from "./telemetry.mjs";

const startedAt = "2026-10-01T12:00:00.000Z";
const finishedAt = "2026-10-01T12:00:01.000Z";
const receipt = "receipt:sha256:"+"1".repeat(64);
const modelRoute = "model-route:sha256:"+"2".repeat(64);
const capabilityRoute = "capability-route:sha256:"+"3".repeat(64);

function task(overrides={}) {
  return {
    schema:1,
    task_id:"task-telemetry-001",
    mission_id:"mission-telemetry-001",
    title:"Inspect execution telemetry",
    objective:"Inspect only canonical execution facts.",
    employee_id:"alex",
    risk_class:"READ_ONLY",
    state:"SUCCEEDED",
    approval:{required:false,status:"NOT_REQUIRED",approval_ref:null},
    attempt_ids:["attempt-telemetry-001"],
    evidence_refs:["evidence:task"],
    receipt_refs:[receipt],
    blocking:null,
    legacy:null,
    created_at:"2026-10-01T11:59:59.000Z",
    updated_at:finishedAt,
    ...overrides,
  };
}

function attempt(overrides={}) {
  return {
    schema:1,
    attempt_id:"attempt-telemetry-001",
    task_id:"task-telemetry-001",
    ordinal:1,
    state:"SUCCEEDED",
    runtime:{provider:"fixture-runtime",runtime_ref:"fixture:telemetry",provider_version:"1"},
    model_route_ref:modelRoute,
    capability_route_refs:[capabilityRoute],
    started_at:startedAt,
    finished_at:finishedAt,
    error_category:null,
    cleanup:{attempted:true,ok:true},
    receipt_ref:receipt,
    evidence_refs:["evidence:attempt"],
    artifact_refs:["artifact:report"],
    previous_attempt_id:null,
    recovery_checkpoint_ref:null,
    ...overrides,
  };
}

function sandboxPair({task_id="task-telemetry-001", modelStatus="KNOWN", modelId="fixture-model"}={}) {
  const policy = defineLiveSandboxPolicy({
    schema:1,
    id:"telemetry-test",
    allowed_risk_classes:["READ_ONLY"],
    max_duration_ms:45000,
    max_tool_calls:2,
    max_input_tokens:12000,
    max_output_tokens:4000,
    max_total_tokens:16000,
    max_cost_usd:0.05,
    allowed_tool_ids:["browser.structured"],
    allowed_network_hosts:[],
    allowed_runtime_providers:["fixture-runtime"],
    allow_fallback:false,
    require_temporary_workspace:true,
    forbid_external_write:true,
    forbid_credentials_exposure:true,
  });
  const admission = admitLiveSandboxDispatch(policy, {
    schema:1,
    mission_id:"mission-telemetry-001",
    task_id,
    risk_class:"READ_ONLY",
    provider_id:"fixture-runtime",
    model_identity:{status:modelStatus,model_id:modelStatus==="KNOWN"?modelId:null},
    model_route_ref:modelRoute,
    capability_route_refs:[capabilityRoute],
    tool_ids:["browser.structured"],
    network_hosts:[],
    fallback_models:[],
    credentials_exposed_to_task:false,
    projected_usage:{
      duration_ms:1000,
      tool_calls:1,
      input_tokens:100,
      output_tokens:50,
      cost:{status:"KNOWN",amount_usd:0.01},
    },
  });
  const outcome = {
    schema:1,
    ok:true,
    state:"SUCCEEDED",
    error_category:null,
    runtime:{provider:"fixture-runtime",runtime_ref:"fixture:telemetry",provider_version:"1"},
    evidence:{
      workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
      prohibited_action_check:{passed:true,observed:[]},
      runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},
      evidence_refs:["evidence:attempt"],
      artifact_refs:["artifact:report"],
    },
    cleanup:{attempted:true,ok:true},
    started_at:startedAt,
    finished_at:finishedAt,
  };
  const record = settleLiveSandbox(admission, outcome, {
    duration_ms:1000,
    tool_calls:1,
    input_tokens:100,
    output_tokens:50,
    cost:{status:"KNOWN",amount_usd:0.01},
  });
  return { admission, record };
}

test("execution telemetry projects only canonical terminal facts", () => {
  const { admission, record } = sandboxPair();
  const result = buildExecutionTelemetry({
    task_node:task(),
    attempt:attempt(),
    sandbox_admission:admission,
    sandbox_record:record,
    handoff_result:{
      schema:1,
      handoff_id:"handoff-001",
      mission_id:"mission-telemetry-001",
      task_id:"task-telemetry-001",
      employee_id:"alex",
      state:"SUCCEEDED",
      artifact_refs:["artifact:report"],
      evidence_refs:["evidence:attempt"],
      unknowns:[],
      residual_risks:[],
      receipt_ref:receipt,
      error_category:null,
      finished_at:finishedAt,
    },
  });

  assert.equal(result.api,EXECUTION_TELEMETRY_API);
  assert.deepEqual(result.employee,{employee_id:"alex"});
  assert.deepEqual(result.execution,{
    attempt_id:"attempt-telemetry-001",
    ordinal:1,
    state:"SUCCEEDED",
    terminal:true,
    state_source:"EXECUTION_ATTEMPT_V1",
  });
  assert.deepEqual(result.timing,{started_at:startedAt,finished_at:finishedAt,duration_ms:1000});
  assert.deepEqual(result.model,{
    status:"KNOWN",
    provider_id:"fixture-runtime",
    model_id:"fixture-model",
    model_route_ref:modelRoute,
    source:"SANDBOX_RECORD_V1",
  });
  assert.deepEqual(result.runtime,{
    provider:"fixture-runtime",
    runtime_ref:"fixture:telemetry",
    provider_version:"1",
  });
  assert.deepEqual(result.tools,{
    status:"KNOWN",
    tool_ids:["browser.structured"],
    capability_route_refs:[capabilityRoute],
    source:"SANDBOX_ADMISSION_V1",
  });
  assert.deepEqual(result.usage,{
    source:"SANDBOX_RECORD_V1",
    duration_ms:1000,
    tool_calls:1,
    input_tokens:100,
    output_tokens:50,
    total_tokens:150,
    cost:{status:"KNOWN",amount_usd:0.01},
  });
  assert.deepEqual(result.artifact_refs,["artifact:report"]);
  assert.deepEqual(result.evidence_refs,["evidence:attempt"]);
  assert.equal(result.receipt_ref,receipt);
  assert.deepEqual(result.unknowns,[]);
  assert.deepEqual(result.blockers,[]);
  assert.deepEqual(result.residual_risks,[]);
  assert.equal(result.traceability.terminal_state_ref,"attempt:attempt-telemetry-001");
  assert.equal(result.traceability.sandbox_record_ref,record.sandbox_record_ref);
  assert.equal(result.traceability.sandbox_admission_ref,admission.sandbox_admission_ref);
});

test("missing provider telemetry remains UNKNOWN instead of becoming zero or invented progress", () => {
  const result = buildExecutionTelemetry({
    task_node:task({state:"RUNNING",attempt_ids:["attempt-running"],updated_at:startedAt}),
    attempt:attempt({
      attempt_id:"attempt-running",
      state:"RUNNING",
      started_at:startedAt,
      finished_at:null,
      cleanup:{attempted:false,ok:null},
      receipt_ref:null,
      evidence_refs:[],
      artifact_refs:[],
    }),
  });

  assert.equal(result.execution.state,"RUNNING");
  assert.equal(result.execution.terminal,false);
  assert.deepEqual(result.timing,{started_at:startedAt,finished_at:null,duration_ms:null});
  assert.equal(result.model.status,"UNKNOWN");
  assert.equal(result.model.model_id,null);
  assert.equal(result.tools.status,"UNKNOWN");
  assert.equal(result.usage.source,"UNKNOWN");
  assert.equal(result.usage.duration_ms,null);
  assert.equal(result.usage.tool_calls,null);
  assert.equal(result.usage.input_tokens,null);
  assert.equal(result.usage.output_tokens,null);
  assert.equal(result.usage.total_tokens,null);
  assert.deepEqual(result.usage.cost,{status:"UNKNOWN",amount_usd:null});
  assert.ok(result.unknowns.includes("MODEL_IDENTITY"));
  assert.ok(result.unknowns.includes("TOOL_IDS"));
  assert.ok(result.unknowns.includes("USAGE"));
  assert.deepEqual(result.blockers,[]);
});

test("blocked telemetry exposes only canonical blocker sources", () => {
  const blocked = buildExecutionTelemetry({
    task_node:task({
      state:"BLOCKED",
      attempt_ids:["attempt-blocked"],
      blocking:{kind:"RUNTIME",reason:"Provider reported unavailable."},
    }),
    attempt:attempt({
      attempt_id:"attempt-blocked",
      state:"BLOCKED",
      error_category:"PROVIDER_UNAVAILABLE",
      cleanup:{attempted:false,ok:null},
      receipt_ref:null,
    }),
    handoff_result:{
      schema:1,
      handoff_id:"handoff-blocked",
      mission_id:"mission-telemetry-001",
      task_id:"task-telemetry-001",
      employee_id:"alex",
      state:"BLOCKED",
      artifact_refs:[],
      evidence_refs:[],
      unknowns:["Provider retry time is unknown."],
      residual_risks:["Runtime availability may remain unstable."],
      receipt_ref:null,
      error_category:"PROVIDER_UNAVAILABLE",
      finished_at:finishedAt,
    },
  });

  assert.deepEqual(blocked.blockers,[
    {source:"EXECUTION_ATTEMPT_V1",code:"PROVIDER_UNAVAILABLE",detail:null},
    {source:"TASK_NODE_V1",code:"RUNTIME",detail:"Provider reported unavailable."},
  ]);
  assert.deepEqual(blocked.unknowns,["MODEL_IDENTITY","TOOL_IDS","USAGE","Provider retry time is unknown."]);
  assert.deepEqual(blocked.residual_risks,["Runtime availability may remain unstable."]);
});

test("sandbox identity mismatch and tampering fail closed", () => {
  const pair = sandboxPair({task_id:"task-other"});
  assert.throws(() => buildExecutionTelemetry({
    task_node:task(),
    attempt:attempt(),
    sandbox_admission:pair.admission,
    sandbox_record:pair.record,
  }),/task|identity/i);

  const valid = sandboxPair();
  assert.throws(() => buildExecutionTelemetry({
    task_node:task(),
    attempt:attempt(),
    sandbox_admission:valid.admission,
    sandbox_record:{...valid.record,quota_status:"FAIL"},
  }),/sandbox record|content|ref/i);
});

test("mission telemetry binds each Attempt to its canonical TaskNode", () => {
  const pair = sandboxPair();
  const rows = buildMissionTelemetry({
    task_nodes:[task()],
    attempts:[attempt()],
    sandbox_admissions:[pair.admission],
    sandbox_records:[pair.record],
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].execution.attempt_id,"attempt-telemetry-001");
  assert.equal(rows[0].employee.employee_id,"alex");

  assert.throws(() => buildMissionTelemetry({
    task_nodes:[],
    attempts:[attempt()],
  }),/TaskNode|task/i);
});
