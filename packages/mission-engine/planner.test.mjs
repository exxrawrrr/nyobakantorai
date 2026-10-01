import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MISSION_PLAN_SCHEMA,
  PLANNER_STRATEGIES,
  normalizeMissionPlan,
  planMission,
  readyTaskIds,
  validateMissionPlan,
  validateTaskGraph,
} from "./planner.mjs";

const root = new URL("../../", import.meta.url);
const schema = JSON.parse(await readFile(new URL("schemas/mission-plan.schema.json", root), "utf8"));

const fixedClock = () => "2026-10-01T06:30:00.000Z";
const stableIds = (kind, index, label) => `${kind}-fixture-${String(index + 1).padStart(2, "0")}-${String(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

function seoRequest(overrides = {}) {
  return {
    objective:"Audit SEO landing page performance, compare competitors, and produce an evidence-backed brief.",
    constraints:["read-only planning","do not change production website"],
    required_evidence:["source URLs"],
    risk_class:"READ_ONLY",
    budget:{ hard_limit_amount:5, currency:"USD" },
    autonomy:{ mode:"GUARDED", delegated_capabilities:[] },
    assumptions:["The target landing page will be supplied before execution."],
    unknowns:["Current analytics access is not yet known."],
    ...overrides,
  };
}

test("Mission Plan schema exposes the exact planner strategies", () => {
  assert.equal(MISSION_PLAN_SCHEMA, 1);
  assert.deepEqual(schema.properties.strategy.enum, PLANNER_STRATEGIES);
  assert.equal(schema.additionalProperties, false);
});

test("rule-based planner creates a deterministic four-node DAG with a parallel first layer", () => {
  const plan = planMission(seoRequest(), { clock:fixedClock, idFactory:stableIds });
  assert.equal(plan.strategy, "RULE_BASED_V1");
  assert.equal(plan.task_nodes.length, 4);
  assert.deepEqual(plan.task_nodes.map((task) => task.employee_id), ["alex","ratri","praroro","siti"]);
  assert.deepEqual(plan.graph.topological_layers, [
    ["task-fixture-01-evidence","task-fixture-02-domain"],
    ["task-fixture-03-synthesis"],
    ["task-fixture-04-verify"],
  ]);
  assert.deepEqual(plan.graph.parallel_groups, [
    ["task-fixture-01-evidence","task-fixture-02-domain"],
  ]);
  assert.deepEqual(plan.graph.roots, ["task-fixture-01-evidence","task-fixture-02-domain"]);
  assert.deepEqual(plan.graph.leaves, ["task-fixture-04-verify"]);
  assert.equal(validateMissionPlan(plan), true);
});

test("constraints, evidence requirements and mission-shared budget propagate to each planned node", () => {
  const plan = planMission(seoRequest(), { clock:fixedClock, idFactory:stableIds });
  for (const meta of plan.node_meta) {
    assert.ok(meta.constraints.includes("read-only planning"));
    assert.ok(meta.constraints.includes("do not change production website"));
    assert.ok(meta.required_evidence.includes("source URLs"));
    assert.deepEqual(meta.budget_policy, {
      source:"MISSION_SHARED",
      hard_limit_amount:5,
      currency:"USD",
    });
    assert.equal(meta.route.employee, plan.task_nodes.find((task) => task.task_id === meta.task_id).employee_id);
  }
  assert.ok(plan.assumptions.includes("The target landing page will be supplied before execution."));
  assert.ok(plan.unknowns.includes("Current analytics access is not yet known."));
  assert.ok(plan.unknowns.some((item) => /runtime\/model\/tool choices/i.test(item)));
});

test("unknown objective falls back to one coordinator task instead of inventing a complex plan", () => {
  const plan = planMission({
    objective:"Handle xyzzy frobnicator.",
    constraints:["stay bounded"],
  }, { clock:fixedClock, idFactory:stableIds });

  assert.equal(plan.strategy, "COORDINATOR_FALLBACK");
  assert.equal(plan.task_nodes.length, 1);
  assert.equal(plan.task_nodes[0].employee_id, "praroro");
  assert.deepEqual(plan.graph.edges, []);
  assert.deepEqual(plan.graph.topological_layers, [["task-fixture-01-coordinate"]]);
  assert.ok(plan.unknowns.some((item) => /decomposed/i.test(item)));
});

test("explicit work items preserve human assignment and dependency intent", () => {
  const plan = planMission({
    objective:"Prepare a bounded campaign review.",
    risk_class:"READ_ONLY",
    work_items:[
      {
        key:"metrics",
        title:"Analyze campaign metrics",
        objective:"Analyze KPI, CPL and ROAS.",
        assigned_id:"paijo",
        required_skills:["nyoba-kpi-analysis"],
        depends_on:[],
      },
      {
        key:"qa",
        title:"Verify campaign analysis",
        objective:"Verify evidence and calculations.",
        assigned_id:"siti",
        required_skills:["nyoba-independent-qa"],
        depends_on:["metrics"],
      },
    ],
  }, { clock:fixedClock, idFactory:stableIds });

  assert.equal(plan.strategy, "EXPLICIT_WORK_ITEMS");
  assert.deepEqual(plan.task_nodes.map((task) => task.employee_id), ["paijo","siti"]);
  assert.deepEqual(plan.node_meta.map((meta) => meta.route.source), ["HUMAN_ASSIGNMENT","HUMAN_ASSIGNMENT"]);
  assert.deepEqual(plan.graph.edges, [
    { from:"task-fixture-01-metrics", to:"task-fixture-02-qa" },
  ]);
});

test("high-impact planning marks task approval pending but does not pretend approval already happened", () => {
  const plan = planMission({
    objective:"Review Meta campaign budget before any paid action.",
    risk_class:"PAID_ACTION",
    work_items:[{
      key:"budget",
      title:"Review paid media budget",
      objective:"Review Meta campaign budget without executing changes.",
      assigned_id:"maya",
      depends_on:[],
    }],
  }, { clock:fixedClock, idFactory:stableIds });

  assert.equal(plan.task_nodes[0].state, "PLANNED");
  assert.deepEqual(plan.task_nodes[0].approval, {
    required:true,
    status:"PENDING",
    approval_ref:null,
  });
});

test("task graph rejects unknown nodes, self-dependencies, duplicate edges and cycles", () => {
  const ids = ["a","b","c"];
  assert.throws(
    () => validateTaskGraph(ids, [{ from:"missing", to:"a" }]),
    /unknown dependency node/,
  );
  assert.throws(
    () => validateTaskGraph(ids, [{ from:"a", to:"a" }]),
    /self dependency/,
  );
  assert.throws(
    () => validateTaskGraph(ids, [{ from:"a", to:"b" }, { from:"a", to:"b" }]),
    /Duplicate task graph edge/,
  );
  assert.throws(
    () => validateTaskGraph(ids, [
      { from:"a", to:"b" },
      { from:"b", to:"c" },
      { from:"c", to:"a" },
    ]),
    /contains a cycle/,
  );
});

test("explicit planner work item cycle fails closed", () => {
  assert.throws(
    () => planMission({
      objective:"Cycle fixture.",
      work_items:[
        { key:"a", title:"A", objective:"A", depends_on:["b"] },
        { key:"b", title:"B", objective:"B", depends_on:["a"] },
      ],
    }, { clock:fixedClock, idFactory:stableIds }),
    /contains a cycle/,
  );
});

test("readyTaskIds derives runnable frontier only from completed dependencies", () => {
  const plan = planMission(seoRequest(), { clock:fixedClock, idFactory:stableIds });
  assert.deepEqual(readyTaskIds(plan), [
    "task-fixture-01-evidence",
    "task-fixture-02-domain",
  ]);
  assert.deepEqual(readyTaskIds(plan, [
    "task-fixture-01-evidence",
    "task-fixture-02-domain",
  ]), ["task-fixture-03-synthesis"]);
  assert.deepEqual(readyTaskIds(plan, [
    "task-fixture-01-evidence",
    "task-fixture-02-domain",
    "task-fixture-03-synthesis",
  ]), ["task-fixture-04-verify"]);
  assert.throws(() => readyTaskIds(plan, ["task-does-not-exist"]), /not in plan/);
});

test("same request, clock and ID factory produce the same plan", () => {
  const a = planMission(seoRequest(), { clock:fixedClock, idFactory:stableIds });
  const b = planMission(seoRequest(), { clock:fixedClock, idFactory:stableIds });
  assert.deepEqual(a, b);
});

test("plan normalization rejects Mission/TaskNode and dependency metadata drift", () => {
  const plan = planMission(seoRequest(), { clock:fixedClock, idFactory:stableIds });

  assert.throws(
    () => normalizeMissionPlan({
      ...plan,
      task_nodes:plan.task_nodes.map((task, index) => index === 0 ? { ...task, mission_id:"mission-other" } : task),
    }),
    /must reference the Mission/,
  );

  assert.throws(
    () => normalizeMissionPlan({
      ...plan,
      node_meta:plan.node_meta.map((meta, index) => index === 2 ? { ...meta, depends_on:[] } : meta),
    }),
    /dependency metadata drift/,
  );
});
