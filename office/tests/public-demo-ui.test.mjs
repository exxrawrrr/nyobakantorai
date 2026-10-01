import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPublicExperienceViewModel } from "../src/public-demo-ui.mjs";

const employees = {
  praroro:{ name:"Praroro", role:"Coordinator" },
  siti:{ name:"Siti", role:"Verifier" },
};

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
        { ...plan.task_nodes[0], truth_label:"LIVE_RUNTIME" },
        { ...plan.task_nodes[1], truth_label:"LIVE_PLANNED" },
      ],
      graph:plan.graph,
      executed_task_id:"task-1",
    },
  }, employees);

  assert.equal(view.mode_label,"LIVE RUNTIME");
  assert.equal(view.is_live,true);
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
  assert.match(html,/SYNTHETIC ≠ LIVE|SYNTHETIC.*LIVE/s);
  assert.match(app,/attachPublicDemo/);
  assert.match(build,/public-demo-ui\.mjs/);
  assert.match(styles,/\.public-experience-grid/);
  assert.match(styles,/@media\(max-width:680px\)[\s\S]*\.public-experience-actions/);
});
