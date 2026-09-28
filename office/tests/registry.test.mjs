import test from "node:test";
import assert from "node:assert/strict";
import { createTask, emptyRegistry, importRegistry, recordApproval, updateTask, validateRegistry } from "../registry.mjs";

const make = () => createTask(emptyRegistry(), { title: "Safe dummy", assignee_id: "subagjo", priority: "LOW" }, () => "task_1", () => "2026-09-19T00:00:00.000Z");

test("local task lifecycle and Siti evidence gate", () => {
  let registry = make();
  registry = updateTask(registry, "task_1", { lifecycle_status: "IN_PROGRESS", actor: "subagjo" }, () => "2026-09-19T00:01:00.000Z");
  registry = updateTask(registry, "task_1", { lifecycle_status: "COMPLETED", actor: "subagjo" }, () => "2026-09-19T00:02:00.000Z");
  assert.throws(() => updateTask(registry, "task_1", { lifecycle_status: "VERIFIED", actor: "subagjo", evidence_ref: "test.log" }), /Only Siti/);
  assert.throws(() => updateTask(registry, "task_1", { lifecycle_status: "VERIFIED", actor: "siti" }), /requires evidence/);
  registry = updateTask(registry, "task_1", { lifecycle_status: "VERIFIED", actor: "siti", evidence_ref: "evidence/test.log" }, () => "2026-09-19T00:03:00.000Z");
  assert.equal(registry.tasks[0].lifecycle_status, "VERIFIED");
  assert.equal(validateRegistry(registry), true);
});

test("Hermes imports are quarantined until server reconciliation", () => {
  const raw = JSON.stringify({ schema: 3, tasks: [{ ...make().tasks[0], execution_mode: "HERMES", runtime_ref: "t_fake", runtime_state: "blocked" }], events: [] });
  const registry = importRegistry(raw);
  assert.equal(registry.tasks[0].provenance, "LOCAL_CLAIM");
  assert.equal(registry.tasks[0].quarantined, true);
});


test("office registry blocks high-impact execution until owner approval", () => {
  let registry = createTask(emptyRegistry(), {
    title: "External publish",
    assignee_id: "sumiati",
    priority: "HIGH",
    risk_class: "EXTERNAL_WRITE",
  }, () => "task_external", () => "2026-09-19T01:00:00.000Z");
  assert.equal(registry.tasks[0].approval_status, "PENDING");
  assert.throws(() => updateTask(registry, "task_external", { lifecycle_status: "IN_PROGRESS", actor: "sumiati" }), /Owner approval required/);
  assert.throws(() => recordApproval(registry, "task_external", { status: "APPROVED", actor: "sumiati" }), /Only the owner/);
  registry = recordApproval(registry, "task_external", { status: "APPROVED", actor: "owner", evidence_ref: "approval://owner" }, () => "2026-09-19T01:01:00.000Z");
  registry = updateTask(registry, "task_external", { lifecycle_status: "IN_PROGRESS", actor: "sumiati" }, () => "2026-09-19T01:02:00.000Z");
  assert.equal(registry.tasks[0].lifecycle_status, "IN_PROGRESS");
  assert.equal(validateRegistry(registry), true);
});
