import {
  createEmptyRegistry,
  createTask,
  updateTask,
  validateRegistry,
} from "../packages/task-registry/registry.mjs";

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 8, 28, 10, 0, tick++)).toISOString();
let seq = 0;
const ids = (prefix) => `${prefix}-demo-${++seq}`;

let registry = createEmptyRegistry(clock);

const plan = [
  ["praroro", "Coordinate launch", "Turn the human goal into scoped work and measurable handoffs."],
  ["alex", "Research audience", "Produce a source-backed audience hypothesis and risks."],
  ["sumiati", "Draft launch copy", "Create messaging using only approved claims."],
  ["subagjo", "Build local prototype", "Implement a reversible local prototype with tests."],
  ["paijo", "Define success metrics", "Define KPI formulas, denominators, and measurement windows."],
];

for (const [assignee, title, detail] of plan) {
  registry = createTask(registry, {
    title,
    detail,
    assignee_id: assignee,
    requester: "human-demo",
    priority: "MEDIUM",
    source: "examples/demo-workflow.mjs",
  }, clock, ids);
}

for (const task of [...registry.tasks]) {
  registry = updateTask(registry, task.id, {
    lifecycle_status: "REQUESTED",
    actor: "owner",
    source: "demo approval",
  }, clock, ids);
  registry = updateTask(registry, task.id, {
    lifecycle_status: "IN_PROGRESS",
    actor: task.assignee_id,
    source: "demo worker",
  }, clock, ids);
  registry = updateTask(registry, task.id, {
    lifecycle_status: "COMPLETED",
    actor: task.assignee_id,
    output_ref: `demo://output/${task.id}`,
    evidence_ref: `demo://evidence/${task.id}`,
    source: "synthetic demo only",
  }, clock, ids);
}

for (const task of [...registry.tasks]) {
  registry = updateTask(registry, task.id, {
    lifecycle_status: "VERIFIED",
    actor: "siti",
    evidence_ref: `demo://qa/${task.id}`,
    source: "independent synthetic QA demo",
  }, clock, ids);
}

validateRegistry(registry);

const summary = {
  demo: "nyobakantorai human-governed launch flow",
  synthetic_only: true,
  tasks: registry.tasks.map(({ id, title, assignee_id, lifecycle_status, evidence_ref }) => ({
    id, title, assignee_id, lifecycle_status, evidence_ref,
  })),
  events: registry.events.length,
  verified: registry.tasks.filter(({ lifecycle_status }) => lifecycle_status === "VERIFIED").length,
};

console.log(JSON.stringify(summary, null, 2));
