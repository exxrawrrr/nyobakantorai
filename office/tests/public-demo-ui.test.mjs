import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPublicExperienceViewModel } from "../src/public-demo-ui.mjs";

const employees = {
  praroro:{ name:"Praroro", role:"Coordinator" },
  siti:{ name:"Siti", role:"Verifier" },
  alex:{ name:"Alex", role:"Strategy / Research" },
};

function telemetryPayload() {
  return {
    api:1,
    employee:{employee_id:"alex"},
    execution:{attempt_id:"attempt-live-1",ordinal:1,state:"SUCCEEDED",terminal:true,state_source:"EXECUTION_ATTEMPT_V1"},
    timing:{started_at:"2026-10-01T12:00:00.000Z",finished_at:"2026-10-01T12:00:01.000Z",duration_ms:1000},
    model:{status:"KNOWN",provider_id:"fixture-runtime",model_id:"fixture-model",model_route_ref:"model-route:sha256:abc",source:"SANDBOX_RECORD_V1"},
    runtime:{provider:"fixture-runtime",runtime_ref:"fixture:run",provider_version:"1"},
    tools:{status:"KNOWN",tool_ids:["browser.structured"],capability_route_refs:["capability-route:sha256:def"],source:"SANDBOX_ADMISSION_V1"},
    usage:{source:"SANDBOX_RECORD_V1",duration_ms:1000,tool_calls:1,input_tokens:100,output_tokens:50,total_tokens:150,cost:{status:"KNOWN",amount_usd:0.01}},
    artifact_refs:["artifact:report"],
    evidence_refs:["evidence:fixture"],
    receipt_ref:"receipt:sha256:abc",
    unknowns:[],
    blockers:[],
    residual_risks:[],
    traceability:{terminal_state_ref:"attempt:attempt-live-1",sandbox_admission_ref:"sandbox-admission:sha256:abc",sandbox_record_ref:"sandbox-record:sha256:def",previous_attempt_id:null,recovery_checkpoint_ref:null},
  };
}

function planPayload() {
  return {
    mission:{ mission_id:"mission-demo", objective:"Audit SEO", state:"PLANNED" },
    task_nodes:[
      { task_id:"task-1", title:"Coordinate", employee_id:"praroro", state:"PLANNED" },
      { task_id:"task-2", title:"Verify", employee_id:"siti", state:"PLANNED" },
    ],
    graph:{
      topological_layers:[["task-1"],["task-2"]],
      edges:[{ from:"task-1", to:"task-2" }],
    },
  };
}

test("synthetic demo view model never presents work as live", () => {
  const plan = planPayload();
  const view = buildPublicExperienceViewModel({
    experience:"DEMO",
    truth_label:"SYNTHETIC",
    live:false,
    state:"DEMO_COMPLETE",
    plan,
    presentation:{
      task_nodes:plan.task_nodes.map((task) => ({ ...task, truth_label:"SYNTHETIC" })),
      graph:plan.graph,
      executed_task_id:null,
    },
  }, employees);

  assert.equal(view.mode_label,"SYNTHETIC DEMO");
  assert.equal(view.is_live,false);
  assert.equal(view.can_fallback_demo,false);
  assert.equal(view.telemetry,null);
  assert.ok(view.layers.flat().every((node) => node.truth_label === "SYNTHETIC"));
  assert.deepEqual(view.layers.map((layer) => layer.map((node) => node.employee_name)), [["Praroro"],["Siti"]]);
});

test("live unavailable view model is explicit and offers demo fallback", () => {
  const view = buildPublicExperienceViewModel({
    experience:"LIVE",
    truth_label:"NOT_LIVE",
    live:false,
    state:"LIVE_UNAVAILABLE",
    message:"Live runtime capacity is unavailable.",
    fallback:{ experience:"DEMO", endpoint:"/api/public/demo" },
  }, employees);

  assert.equal(view.mode_label,"LIVE UNAVAILABLE");
  assert.equal(view.is_live,false);
  assert.equal(view.can_fallback_demo,true);
  assert.deepEqual(view.layers,[]);
});

test("only verified live payload gets LIVE RUNTIME label", () => {
  const plan = planPayload();
  const view = buildPublicExperienceViewModel({
    experience:"LIVE",
    truth_label:"LIVE_RUNTIME",
    live:true,
    state:"LIVE_COMPLETE",
    plan,
    presentation:{
      task_nodes:[
        { ...plan.task_nodes[0], employee_id:"alex", truth_label:"LIVE_RUNTIME" },
        { ...plan.task_nodes[1], truth_label:"LIVE_PLANNED" },
      ],
      graph:plan.graph,
      executed_task_id:"task-1",
    },
    telemetry:telemetryPayload(),
  }, employees);

  assert.equal(view.mode_label,"LIVE RUNTIME");
  assert.equal(view.is_live,true);
  assert.equal(view.telemetry.employee_name,"Alex");
  assert.equal(view.telemetry.execution.state,"SUCCEEDED");
  assert.equal(view.telemetry.execution.terminal,true);
  assert.equal(view.telemetry.model.model_id,"fixture-model");
  assert.deepEqual(view.telemetry.tools.tool_ids,["browser.structured"]);
  assert.equal(view.telemetry.usage.total_tokens,150);
  assert.equal(view.telemetry.usage.cost.amount_usd,0.01);
  assert.deepEqual(view.telemetry.evidence_refs,["evidence:fixture"]);
  assert.equal(view.telemetry.traceability.terminal_state_ref,"attempt:attempt-live-1");
  assert.deepEqual(view.layers[0].map((node) => node.truth_label),["LIVE_RUNTIME"]);
  assert.deepEqual(view.layers[1].map((node) => node.truth_label),["LIVE_PLANNED"]);
});

test("public UI exposes distinct demo/live CTAs, mission input, graph, and ships its module", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const build = await readFile(new URL("../build.mjs", import.meta.url), "utf8");

  assert.match(html,/id="view-try"/);
  assert.match(html,/id="public-mission-objective"/);
  assert.match(html,/id="try-demo"[^>]*>\s*TRY DEMO\s*</);
  assert.match(html,/id="try-live"[^>]*>\s*TRY LIVE AI\s*</);
  assert.match(html,/id="public-task-graph"/);
  assert.match(html,/id="public-execution-evidence"/);
  assert.match(html,/EXECUTION EVIDENCE/);
  assert.match(html,/SYNTHETIC ≠ LIVE|SYNTHETIC.*LIVE/s);
  assert.match(app,/attachPublicDemo/);
  assert.match(build,/public-demo-ui\.mjs/);
  assert.match(styles,/\.public-experience-grid/);
  assert.match(styles,/\.public-telemetry-grid/);
  assert.match(styles,/@media\(max-width:680px\)[\s\S]*\.public-experience-actions/);
});


test("unknown counters stay null instead of being invented as zero", () => {
  const telemetry = telemetryPayload();
  telemetry.model = {...telemetry.model,status:"UNKNOWN",model_id:null};
  telemetry.tools = {...telemetry.tools,status:"UNKNOWN",tool_ids:[]};
  telemetry.usage = {
    ...telemetry.usage,
    duration_ms:null,
    tool_calls:null,
    input_tokens:null,
    output_tokens:null,
    total_tokens:null,
    cost:{status:"UNKNOWN",amount_usd:null},
  };
  const view = buildPublicExperienceViewModel({
    experience:"LIVE",
    truth_label:"LIVE_RUNTIME",
    live:true,
    state:"LIVE_COMPLETE",
    telemetry,
  }, employees);
  assert.equal(view.telemetry.usage.duration_ms,null);
  assert.equal(view.telemetry.usage.tool_calls,null);
  assert.equal(view.telemetry.usage.input_tokens,null);
  assert.equal(view.telemetry.usage.output_tokens,null);
  assert.equal(view.telemetry.usage.total_tokens,null);
  assert.deepEqual(view.telemetry.usage.cost,{status:"UNKNOWN",amount_usd:null});
  assert.equal(view.telemetry.model.model_id,null);
});


test("synthetic payload cannot surface injected live telemetry", () => {
  const view = buildPublicExperienceViewModel({
    experience:"DEMO",
    truth_label:"SYNTHETIC",
    live:false,
    state:"DEMO_COMPLETE",
    telemetry:telemetryPayload(),
  }, employees);
  assert.equal(view.is_live,false);
  assert.equal(view.telemetry,null);
});
