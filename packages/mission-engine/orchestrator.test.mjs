import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { planMission } from "./planner.mjs";
import { executeMissionPlan } from "./orchestrator.mjs";
import { createCostGovernor } from "../cost-governor/index.mjs";

const root = new URL("../../", import.meta.url);
const policy = JSON.parse(await readFile(new URL("config/runtime-execution-policy.json", root), "utf8"));

const fixedClock = () => "2026-10-01T06:50:00.000Z";
const ids = (kind, index, label) => `${kind === "task" ? "tnode" : kind}-orch-${index + 1}-${String(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

function missionPlan(overrides = {}) {
  return planMission({
    objective:"Research a bounded topic, analyze it, synthesize the result, and verify the evidence.",
    constraints:["read-only execution","no external writes"],
    required_evidence:["source provenance"],
    risk_class:"READ_ONLY",
    work_items:[
      { key:"research", title:"Research sources", objective:"Research bounded public sources.", assigned_id:"alex", depends_on:[] },
      { key:"analysis", title:"Analyze findings", objective:"Analyze the bounded evidence.", assigned_id:"nara", depends_on:[] },
      { key:"synthesis", title:"Synthesize result", objective:"Synthesize research and analysis.", assigned_id:"praroro", depends_on:["research","analysis"] },
      { key:"verify", title:"Verify result", objective:"Independently verify the result evidence.", assigned_id:"siti", depends_on:["synthesis"] },
    ],
    ...overrides,
  }, { clock:fixedClock, idFactory:ids });
}

function makeAdapter(taskId, {
  terminalState = "SUCCEEDED",
  delayMs = 0,
  onEnter = () => {},
  onExit = () => {},
} = {}) {
  return defineRuntimeExecutionAdapter({
    id:"fixture-orchestrator",
    version:"1.0.0",
    runtime:{ provider:"fixture-runtime", runtime_ref:`fixture:${taskId}`, provider_version:"1.0" },
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare() {
      return {
        workspace:{ kind:"TEMPORARY", ref:`tmp://${taskId}`, isolated:true, production_repo:false },
        session_ref:`session:${taskId}`,
      };
    },
    async executeBoundedTask() {
      onEnter(taskId);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      onExit(taskId);
      return { text:`bounded raw result for ${taskId}` };
    },
    async normalizeResult() {
      return {
        schema:1,
        state:terminalState,
        summary:`Fixture ${terminalState.toLowerCase()} for ${taskId}`,
        output:{ task_id:taskId, status:terminalState },
        artifact_refs:[`artifact:${taskId}:normalized`],
        evidence_refs:[`evidence:${taskId}:normalized`],
      };
    },
    async collectEvidence() {
      return {
        schema:1,
        raw_result_ref:`artifact:${taskId}:raw`,
        normalized_result_ref:`artifact:${taskId}:normalized`,
        capabilities_used:["model_inference","temporary_workspace","evidence_collection"],
        workspace_mutation_check:{ temporary_workspace_only:true, production_repo_changed:false },
        prohibited_action_check:{ passed:true, observed:[] },
        runtime_actions:{ install:false, login:false, account_mutation:false, external_write:false },
        evidence_refs:[`evidence:${taskId}:runtime`],
        artifact_refs:[`artifact:${taskId}:raw`,`artifact:${taskId}:normalized`],
      };
    },
    async cleanup() {
      return { ok:true };
    },
  });
}

function runtimeResolver(factory = (taskId) => makeAdapter(taskId)) {
  return async ({ task }) => ({
    adapter:factory(task.task_id),
    policy,
    required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
    capability_route_refs:[`capability-route:${task.task_id}`],
    model_route_ref:null,
    unknowns:["Synthetic fixture runtime only."],
    residual_risks:["No external correctness claim."],
  });
}

test("4-node synthetic mission executes validated DAG with real bounded parallelism", async () => {
  const plan = missionPlan();
  let active = 0;
  let maxActive = 0;
  const started = [];
  const finished = [];

  const result = await executeMissionPlan(plan, {
    resolveRuntime:runtimeResolver((taskId) => makeAdapter(taskId, {
      delayMs:15,
      onEnter(id) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        started.push(id);
      },
      onExit(id) {
        active -= 1;
        finished.push(id);
      },
    })),
    maxConcurrency:2,
    clock:fixedClock,
  });

  assert.equal(result.mission.state, "SUCCEEDED");
  assert.equal(result.cancelled, false);
  assert.equal(result.tasks.length, 4);
  assert.equal(result.attempts.length, 4);
  assert.equal(result.telemetry.length, 4);
  assert.ok(result.telemetry.every((row) => row.execution.state === "SUCCEEDED"));
  assert.ok(result.telemetry.every((row) => row.execution.terminal === true));
  assert.ok(result.telemetry.every((row) => row.execution.state_source === "EXECUTION_ATTEMPT_V1"));
  assert.ok(result.telemetry.every((row) => row.model.status === "UNKNOWN"));
  assert.ok(result.telemetry.every((row) => row.usage.source === "UNKNOWN"));
  assert.equal(result.handoffs.length, 4);
  assert.equal(result.returns.length, 4);
  assert.equal(maxActive, 2);
  assert.equal(new Set(started.slice(0,2)).size, 2);
  assert.equal(finished.length, 4);
  assert.ok(result.tasks.every((task) => task.state === "SUCCEEDED"));
  assert.ok(result.tasks.every((task) => task.attempt_ids.length === 1));
  assert.ok(result.mission.evidence_refs.length > 0);
  assert.ok(result.mission.artifact_refs.length > 0);
  assert.notEqual(result.mission.state, "VERIFIED");
});

test("downstream handoff carries upstream task identities, employees and produced artifacts", async () => {
  const plan = missionPlan();
  const result = await executeMissionPlan(plan, {
    resolveRuntime:runtimeResolver(),
    maxConcurrency:2,
    clock:fixedClock,
  });

  const synthesisTask = plan.task_nodes.find((task) => task.employee_id === "praroro");
  const synthesis = result.handoffs.find((item) => item.task_id === synthesisTask.task_id);
  assert.equal(synthesis.source.task_ids.length, 2);
  assert.deepEqual([...synthesis.source.employee_ids].sort(), ["alex","nara"]);
  for (const upstream of synthesis.source.task_ids) {
    assert.ok(synthesis.input_artifact_refs.includes(`artifact:${upstream}:raw`));
    assert.ok(synthesis.input_artifact_refs.includes(`artifact:${upstream}:normalized`));
  }

  const verifyTask = plan.task_nodes.find((task) => task.employee_id === "siti");
  const verify = result.handoffs.find((item) => item.task_id === verifyTask.task_id);
  assert.deepEqual(verify.source.task_ids, [synthesisTask.task_id]);
  assert.deepEqual(verify.source.employee_ids, ["praroro"]);
});

test("upstream failure executes once, blocks all descendants and settles Mission truthfully", async () => {
  const plan = planMission({
    objective:"Run a synthetic failure propagation fixture.",
    risk_class:"READ_ONLY",
    work_items:[
      { key:"root", title:"Root task", objective:"Fail in fixture runtime.", assigned_id:"alex", depends_on:[] },
      { key:"middle", title:"Middle task", objective:"Must not execute after failed root.", assigned_id:"nara", depends_on:["root"] },
      { key:"leaf", title:"Leaf task", objective:"Must not execute after blocked middle.", assigned_id:"siti", depends_on:["middle"] },
    ],
  }, { clock:fixedClock, idFactory:ids });

  let resolveCount = 0;
  const result = await executeMissionPlan(plan, {
    resolveRuntime:async ({ task }) => {
      resolveCount += 1;
      return {
        adapter:makeAdapter(task.task_id, { terminalState:"FAILED" }),
        policy,
        required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
      };
    },
    clock:fixedClock,
  });

  assert.equal(resolveCount, 1);
  assert.equal(result.attempts.length, 1);
  assert.deepEqual(result.tasks.map((task) => task.state), ["FAILED","BLOCKED","BLOCKED"]);
  assert.equal(result.mission.state, "FAILED");
  assert.equal(result.events.filter((item) => item.kind === "TASK_BLOCKED_BY_DEPENDENCY").length, 2);
});

test("high-impact root stops at WAITING_APPROVAL and never resolves or calls runtime", async () => {
  const plan = planMission({
    objective:"Prepare one paid action without approving it.",
    risk_class:"PAID_ACTION",
    work_items:[
      { key:"paid", title:"Paid action", objective:"Prepare paid media action.", assigned_id:"maya", depends_on:[] },
    ],
  }, { clock:fixedClock, idFactory:ids });

  let runtimeCalls = 0;
  const result = await executeMissionPlan(plan, {
    resolveRuntime:async () => {
      runtimeCalls += 1;
      throw new Error("must not be reached");
    },
    clock:fixedClock,
  });

  assert.equal(runtimeCalls, 0);
  assert.equal(result.mission.state, "WAITING_APPROVAL");
  assert.equal(result.tasks[0].state, "WAITING_APPROVAL");
  assert.equal(result.attempts.length, 0);
  assert.equal(result.handoffs.length, 0);
});

test("cooperative cancellation after first parallel batch cancels tasks that have not started", async () => {
  const plan = missionPlan();
  const result = await executeMissionPlan(plan, {
    resolveRuntime:runtimeResolver(),
    maxConcurrency:2,
    clock:fixedClock,
    shouldCancel:({ attempts }) => attempts.length >= 2,
  });

  const states = Object.fromEntries(result.tasks.map((task) => [task.employee_id, task.state]));
  assert.equal(result.cancelled, true);
  assert.equal(result.mission.state, "CANCELLED");
  assert.equal(result.attempts.length, 2);
  assert.equal(states.alex, "SUCCEEDED");
  assert.equal(states.nara, "SUCCEEDED");
  assert.equal(states.praroro, "CANCELLED");
  assert.equal(states.siti, "CANCELLED");
});

test("bounded concurrency rejects invalid values before any runtime resolution", async () => {
  const plan = missionPlan();
  let called = false;
  await assert.rejects(
    () => executeMissionPlan(plan, {
      resolveRuntime:async () => { called = true; return {}; },
      maxConcurrency:0,
      clock:fixedClock,
    }),
    /maxConcurrency must be 1\.\.8/,
  );
  assert.equal(called, false);
});

test("runtime contract rejection becomes a BLOCKED Attempt and blocks dependents without claiming execution failure", async () => {
  const plan = planMission({
    objective:"Exercise runtime policy failure truth.",
    risk_class:"READ_ONLY",
    work_items:[
      { key:"root", title:"Root task", objective:"Request undeclared capability.", assigned_id:"alex", depends_on:[] },
      { key:"next", title:"Dependent task", objective:"Must be blocked.", assigned_id:"siti", depends_on:["root"] },
    ],
  }, { clock:fixedClock, idFactory:ids });

  const result = await executeMissionPlan(plan, {
    resolveRuntime:async ({ task }) => ({
      adapter:makeAdapter(task.task_id),
      policy,
      required_capabilities:["bounded_process"],
    }),
    clock:fixedClock,
  });

  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].state, "BLOCKED");
  assert.equal(result.attempts[0].error_category, "CAPABILITY_NOT_DECLARED");
  assert.deepEqual(result.tasks.map((task) => task.state), ["BLOCKED","BLOCKED"]);
  assert.equal(result.tasks[0].blocking.kind, "POLICY");
  assert.equal(result.mission.state, "BLOCKED");
});


function verificationRequestFor({ task, attempt }) {
  const evidenceRef = attempt.artifact_refs[0] || "artifact:verification-fallback";
  const fact = "attempt="+attempt.attempt_id;
  return {
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:{
      expected:{
        required_facts:[fact],
        required_artifacts:[evidenceRef],
        required_completion_items:["runtime-succeeded"],
        required_evidence_refs:[evidenceRef],
      },
      report:{
        text:"Independent review "+fact,
        claimed_executed:false,
      },
      evidence:{
        observed_text:"Observed "+fact,
        refs:[evidenceRef],
        artifacts:[evidenceRef],
        completion_items:["runtime-succeeded"],
        checked_at:fixedClock(),
      },
    },
    research:{
      claims:[{
        claim_id:"attempt-state",
        statement:"Runtime attempt succeeded.",
        source_ref:evidenceRef,
        source_exists:true,
        source_relevant:true,
        source_current:true,
        expected_value:"SUCCEEDED",
        observed_value:attempt.state,
        expected_unit:"state",
        observed_unit:"state",
      }],
    },
  };
}

test("canonical verification request hook can promote independently reviewed tasks and Mission", async () => {
  const plan = planMission({
    objective:"Execute and independently verify a two-step fixture.",
    risk_class:"READ_ONLY",
    work_items:[
      {key:"a",title:"Research",objective:"Produce bounded evidence.",assigned_id:"alex",depends_on:[]},
      {key:"b",title:"Code review",objective:"Produce bounded evidence.",assigned_id:"subagjo",depends_on:["a"]},
    ],
  }, {clock:fixedClock,idFactory:ids});

  const result = await executeMissionPlan(plan,{
    resolveRuntime:runtimeResolver(),
    buildVerificationRequest:verificationRequestFor,
    clock:fixedClock,
  });

  assert.equal(result.verifications.length,2);
  assert.ok(result.verifications.every((review)=>review.review_state==="PASS"));
  assert.ok(result.verifications.every((review)=>review.decision==="VERIFIED"));
  assert.ok(result.tasks.every((task)=>task.state==="VERIFIED"));
  assert.equal(result.mission.state,"VERIFIED");
  assert.ok(result.mission.evidence_refs.some((ref)=>ref.startsWith("verification:sha256:")));
  assert.equal(result.events.filter((item)=>item.kind==="TASK_VERIFICATION_RECORDED").length,2);
});

test("verification contradiction remains visible and prevents Mission VERIFIED", async () => {
  const plan = planMission({
    objective:"Execute and catch a contradicted verification fixture.",
    risk_class:"READ_ONLY",
    work_items:[
      {key:"a",title:"Research",objective:"Produce bounded evidence.",assigned_id:"alex",depends_on:[]},
    ],
  }, {clock:fixedClock,idFactory:ids});

  const result = await executeMissionPlan(plan,{
    resolveRuntime:runtimeResolver(),
    buildVerificationRequest:({task,attempt}) => {
      const request=verificationRequestFor({task,attempt});
      request.decision="VERIFIED";
      request.task_node={...task,state:"VERIFIED"};
      request.research.claims[0].observed_value="FAILED";
      return request;
    },
    clock:fixedClock,
  });

  assert.equal(result.verifications.length,1);
  assert.equal(result.verifications[0].review_state,"FAIL");
  assert.equal(result.verifications[0].decision,"NOT_VERIFIED");
  assert.ok(result.verifications[0].contradictions.some((item)=>item.code==="VALUE_MISMATCH"));
  assert.equal(result.tasks[0].state,"SUCCEEDED");
  assert.equal(result.mission.state,"SUCCEEDED");
  assert.equal(result.events.filter((item)=>item.kind==="TASK_VERIFICATION_RECORDED").length,1);
});

test("orchestrator without verification hook preserves SUCCEEDED truth and emits no verification records", async () => {
  const result = await executeMissionPlan(missionPlan(),{
    resolveRuntime:runtimeResolver(),
    maxConcurrency:2,
    clock:fixedClock,
  });
  assert.deepEqual(result.verifications,[]);
  assert.equal(result.mission.state,"SUCCEEDED");
  assert.ok(result.tasks.every((task)=>task.state==="SUCCEEDED"));
});


function costPolicy(overrides={}) {
  return {
    schema:1,
    currency:"USD",
    thresholds:{warning_ratio:0.70,reroute_ratio:0.85,approval_ratio:0.95},
    daily_limit_amount:null,
    project_limits:{},
    mission_limits:{},
    employee_limits:{},
    ...overrides,
  };
}

function oneCostTaskPlan({budget=1}={}) {
  return planMission({
    objective:"Run one cost-governed bounded task.",
    risk_class:"READ_ONLY",
    budget:{hard_limit_amount:budget,currency:"USD"},
    work_items:[
      {key:"root",title:"Cost governed task",objective:"Execute within governed cost.",assigned_id:"alex",depends_on:[]},
    ],
  },{clock:fixedClock,idFactory:ids});
}

function costResolution(task,{amount,alternatives=[]}={}) {
  return {
    adapter:makeAdapter(task.task_id),
    policy,
    required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
    cost_governance:{
      project_id:"project-cost-tests",
      estimate:amount==null
        ? {status:"UNKNOWN",amount:null,currency:null}
        : {status:"KNOWN",amount,currency:"USD"},
      alternatives,
      provider_id:"fixture-runtime",
      model_id:"fixture-model",
      tool_ids:[],
    },
  };
}

test("cost approval threshold escalates canonical READY task to WAITING_APPROVAL before runtime execution",async()=>{
  const plan=oneCostTaskPlan();
  const governor=createCostGovernor({policy:costPolicy(),clock:fixedClock});
  let runtimeCalls=0;

  const result=await executeMissionPlan(plan,{
    resolveRuntime:async({task})=>{
      runtimeCalls+=1;
      return costResolution(task,{amount:0.96});
    },
    costGovernor:governor,
    clock:fixedClock,
  });

  assert.equal(runtimeCalls,1);
  assert.equal(result.attempts.length,0);
  assert.equal(result.tasks[0].state,"WAITING_APPROVAL");
  assert.equal(result.tasks[0].approval.required,true);
  assert.equal(result.tasks[0].approval.status,"PENDING");
  assert.equal(result.mission.state,"WAITING_APPROVAL");
  assert.equal(result.cost_decisions[0].action,"APPROVAL_REQUIRED");
  assert.ok(result.events.some((item)=>item.kind==="TASK_WAITING_COST_APPROVAL"));
});

test("hard cost budget stops execution even when a task could otherwise run",async()=>{
  const plan=oneCostTaskPlan();
  const governor=createCostGovernor({policy:costPolicy(),clock:fixedClock});
  let entered=0;

  const result=await executeMissionPlan(plan,{
    resolveRuntime:async({task})=>({
      ...costResolution(task,{amount:1.0}),
      adapter:makeAdapter(task.task_id,{onEnter:()=>{entered+=1;}}),
    }),
    costGovernor:governor,
    clock:fixedClock,
  });

  assert.equal(entered,0);
  assert.equal(result.attempts.length,0);
  assert.equal(result.tasks[0].state,"BLOCKED");
  assert.equal(result.tasks[0].blocking.kind,"POLICY");
  assert.equal(result.mission.state,"BLOCKED");
  assert.equal(result.cost_decisions[0].action,"STOP");
  assert.ok(result.cost_decisions[0].reason_codes.includes("HARD_BUDGET_LIMIT_REACHED"));
});

test("reroute threshold can switch to a cheaper runtime resolution before execution",async()=>{
  const plan=oneCostTaskPlan();
  const governor=createCostGovernor({policy:costPolicy(),clock:fixedClock});
  let reroutes=0;

  const result=await executeMissionPlan(plan,{
    resolveRuntime:async({task})=>costResolution(task,{
      amount:0.90,
      alternatives:[{id:"cheap",cost:{status:"KNOWN",amount:0.20,currency:"USD"}}],
    }),
    resolveCostReroute:async({task,recommended_alternative})=>{
      reroutes+=1;
      assert.equal(recommended_alternative.id,"cheap");
      return costResolution(task,{amount:0.20});
    },
    reportActualCost:async()=>({
      cost_type:"MODEL",
      cost:{status:"KNOWN",amount:0.20,currency:"USD"},
      evidence_refs:["evidence:cost-actual"],
    }),
    costGovernor:governor,
    clock:fixedClock,
  });

  assert.equal(reroutes,1);
  assert.equal(result.mission.state,"SUCCEEDED");
  assert.deepEqual(result.cost_decisions.map((item)=>item.action),["REROUTE","ALLOW"]);
  assert.equal(result.cost_entries.length,1);
  assert.equal(result.cost_entries[0].cost.amount,0.20);
  assert.ok(result.events.some((item)=>item.kind==="TASK_COST_REROUTED"));
});

test("missing actual-cost report records UNKNOWN and stops the next budgeted task",async()=>{
  const plan=planMission({
    objective:"Run two sequential cost-governed tasks.",
    risk_class:"READ_ONLY",
    budget:{hard_limit_amount:1,currency:"USD"},
    work_items:[
      {key:"first",title:"First cost task",objective:"Run first bounded task.",assigned_id:"alex",depends_on:[]},
      {key:"second",title:"Second cost task",objective:"Run only if cost is reconciled.",assigned_id:"nara",depends_on:["first"]},
    ],
  },{clock:fixedClock,idFactory:ids});
  const governor=createCostGovernor({policy:costPolicy(),clock:fixedClock});
  let runtimeEntries=0;

  const result=await executeMissionPlan(plan,{
    resolveRuntime:async({task})=>({
      ...costResolution(task,{amount:0.10}),
      adapter:makeAdapter(task.task_id,{onEnter:()=>{runtimeEntries+=1;}}),
    }),
    costGovernor:governor,
    clock:fixedClock,
  });

  assert.equal(runtimeEntries,1);
  assert.equal(result.cost_entries.length,1);
  assert.equal(result.cost_entries[0].cost.status,"UNKNOWN");
  assert.equal(result.cost_decisions.length,2);
  assert.equal(result.cost_decisions[0].action,"ALLOW");
  assert.equal(result.cost_decisions[1].action,"STOP");
  assert.ok(result.cost_decisions[1].reason_codes.includes("UNRECONCILED_UNKNOWN_COST"));
  assert.deepEqual(result.tasks.map((task)=>task.state),["SUCCEEDED","BLOCKED"]);
  assert.equal(result.mission.state,"PARTIAL");
  assert.ok(result.events.some((item)=>item.kind==="COST_RECONCILIATION_REQUIRED"));
});


test("actual cost overrun keeps completed work visible but prevents Mission SUCCEEDED",async()=>{
  const plan=oneCostTaskPlan();
  const governor=createCostGovernor({policy:costPolicy(),clock:fixedClock});

  const result=await executeMissionPlan(plan,{
    resolveRuntime:async({task})=>costResolution(task,{amount:0.20}),
    reportActualCost:async()=>({
      cost_type:"MODEL",
      cost:{status:"KNOWN",amount:1.20,currency:"USD"},
      evidence_refs:["evidence:actual-overrun"],
    }),
    costGovernor:governor,
    clock:fixedClock,
  });

  assert.equal(result.tasks[0].state,"SUCCEEDED");
  assert.equal(result.mission.state,"PARTIAL");
  const missionScope=result.cost_snapshot.budget_state.find((item)=>item.kind==="MISSION");
  assert.equal(missionScope.hard_limit_breached,true);
  assert.ok(result.events.some((item)=>item.kind==="MISSION_COST_RECONCILIATION_REQUIRED"));
});
