import test from "node:test";
import assert from "node:assert/strict";
import { attachRuntimeTask, createEmptyRegistry, createTask, importRegistry, recordApproval, updateTask, validateRegistry } from "./registry.mjs";

const clock = (() => {
  let n = 0;
  return () => `2026-09-19T13:00:${String(n++).padStart(2, "0")}.000Z`;
})();
const ids = (() => {
  let n = 0;
  return (prefix) => `${prefix}-${++n}`;
})();

function oneTask() {
  return createTask(createEmptyRegistry(clock), {
    title: "Dummy task",
    assignee_id: "subagjo",
    requester: "the owner",
  }, clock, ids);
}

test("creates a valid task and append-only creation event", () => {
  const registry = oneTask();
  assert.equal(registry.tasks.length, 1);
  assert.equal(registry.tasks[0].lifecycle_status, "PLANNED");
  assert.equal(registry.events[0].action, "TASK_CREATED");
  assert.equal(validateRegistry(registry), true);
});

test("enforces lifecycle order", () => {
  const registry = oneTask();
  assert.throws(() => updateTask(registry, registry.tasks[0].id, {
    lifecycle_status: "COMPLETED",
    actor: "subagjo",
  }, clock, ids), /tidak diizinkan/);
});

test("VERIFIED requires Siti and evidence", () => {
  let registry = oneTask();
  const id = registry.tasks[0].id;
  registry = updateTask(registry, id, { lifecycle_status: "REQUESTED", actor: "owner" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status: "IN_PROGRESS", actor: "subagjo" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status: "COMPLETED", actor: "subagjo" }, clock, ids);
  assert.throws(() => updateTask(registry, id, { lifecycle_status: "VERIFIED", actor: "subagjo", evidence_ref: "test.txt" }, clock, ids), /hanya dapat dicatat oleh Siti/);
  assert.throws(() => updateTask(registry, id, { lifecycle_status: "VERIFIED", actor: "siti" }, clock, ids), /membutuhkan evidence/);
  registry = updateTask(registry, id, { lifecycle_status: "VERIFIED", actor: "siti", evidence_ref: "tests/pass.txt" }, clock, ids);
  assert.equal(registry.tasks[0].lifecycle_status, "VERIFIED");
  assert.equal(registry.events.at(-1).evidence_ref, "tests/pass.txt");
});

test("Hermes staging records a real runtime reference and blocks manual verification", () => {
  let registry = oneTask();
  const id = registry.tasks[0].id;
  registry = attachRuntimeTask(registry, id, { task_id: "t_123abc", assignee: "subagjo", state: "BLOCKED" }, clock, ids);
  assert.equal(registry.tasks[0].execution_mode, "HERMES");
  assert.equal(registry.tasks[0].runtime_ref, "hermes-kanban:t_123abc");
  assert.equal(registry.tasks[0].lifecycle_status, "BLOCKED");
  assert.throws(() => updateTask(registry, id, {
    lifecycle_status: "IN_PROGRESS",
    actor: "siti",
    evidence_ref: "claimed.txt",
    source: "hermes:siti",
    runtime_event_id: "forged-event",
  }, clock, ids), /divalidasi server/);
});


test("Hermes staging supports all six public agent roles", () => {
  const employees = ["praroro", "paijo", "subagjo", "alex", "sumiati", "siti"];
  for (const employee of employees) {
    let registry = createTask(createEmptyRegistry(clock), {
      title: "Runtime staging " + employee,
      assignee_id: employee,
      requester: "the owner",
    }, clock, ids);
    const id = registry.tasks[0].id;
    registry = attachRuntimeTask(registry, id, { task_id: "t_" + employee, assignee: employee, state: "BLOCKED" }, clock, ids);
    assert.equal(registry.tasks[0].execution_mode, "HERMES", employee);
    assert.equal(registry.tasks[0].lifecycle_status, "BLOCKED", employee);
  }
});

test("Hermes staging rejects mismatched or non-blocked runtime claims", () => {
  const registry = oneTask();
  const id = registry.tasks[0].id;
  assert.throws(() => attachRuntimeTask(registry, id, { task_id: "t_bad", assignee: "siti", state: "BLOCKED" }, clock, ids), /tidak cocok/);
  assert.throws(() => attachRuntimeTask(registry, id, { task_id: "t_bad", assignee: "subagjo", state: "RUNNING" }, clock, ids), /wajib di-stage sebagai BLOCKED/);
});

test("import rejects a forged Hermes task without its adapter event", () => {
  const registry = oneTask();
  const forged = structuredClone(registry);
  Object.assign(forged.tasks[0], { execution_mode: "HERMES", runtime_ref: "hermes-kanban:t_forged", runtime_state: "BLOCKED", lifecycle_status: "BLOCKED" });
  assert.throws(() => importRegistry(JSON.stringify(forged)), /event staging yang valid/);
});

test("imports a serialized registry and rejects unknown assignee", () => {
  const registry = oneTask();
  assert.deepEqual(importRegistry(JSON.stringify(registry)), registry);
  const bad = structuredClone(registry);
  bad.tasks[0].assignee_id = "atlas";
  assert.throws(() => importRegistry(JSON.stringify(bad)), /assignee tidak dikenal/);
});


test("high-impact tasks require owner approval before execution", () => {
  let registry = createTask(createEmptyRegistry(clock), {
    title: "Publish external change",
    assignee_id: "subagjo",
    requester: "the owner",
    risk_class: "EXTERNAL_WRITE",
  }, clock, ids);
  const id = registry.tasks[0].id;
  assert.equal(registry.tasks[0].approval_required, true);
  assert.equal(registry.tasks[0].approval_status, "PENDING");
  registry = updateTask(registry, id, { lifecycle_status: "REQUESTED", actor: "owner" }, clock, ids);
  assert.throws(() => updateTask(registry, id, { lifecycle_status: "IN_PROGRESS", actor: "subagjo" }, clock, ids), /Owner approval required/);
  assert.throws(() => recordApproval(registry, id, { status: "APPROVED", actor: "subagjo" }, clock, ids), /Only the owner/);
  registry = recordApproval(registry, id, { status: "APPROVED", actor: "owner", evidence_ref: "approval://demo" }, clock, ids);
  assert.equal(registry.tasks[0].approval_status, "APPROVED");
  registry = updateTask(registry, id, { lifecycle_status: "IN_PROGRESS", actor: "subagjo" }, clock, ids);
  assert.equal(registry.tasks[0].lifecycle_status, "IN_PROGRESS");
});

test("owner may reject and later re-approve a high-impact task", () => {
  let registry = createTask(createEmptyRegistry(clock), {
    title: "Paid external action",
    assignee_id: "paijo",
    requester: "the owner",
    risk_class: "PAID_ACTION",
  }, clock, ids);
  const id = registry.tasks[0].id;
  registry = recordApproval(registry, id, { status: "REJECTED", actor: "owner", evidence_ref: "approval://rejected" }, clock, ids);
  assert.equal(registry.tasks[0].approval_status, "REJECTED");
  registry = updateTask(registry, id, { lifecycle_status: "REQUESTED", actor: "owner" }, clock, ids);
  assert.throws(() => updateTask(registry, id, { lifecycle_status: "IN_PROGRESS", actor: "paijo" }, clock, ids), /Owner approval required/);
  registry = recordApproval(registry, id, { status: "APPROVED", actor: "owner", evidence_ref: "approval://approved" }, clock, ids);
  assert.equal(registry.tasks[0].approval_status, "APPROVED");
});
