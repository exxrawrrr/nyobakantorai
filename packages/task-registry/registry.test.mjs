import test from "node:test";
import assert from "node:assert/strict";
import { EMPLOYEES, attachExecutionReceipt, attachRuntimeTask, createEmptyRegistry, createTask, importRegistry, recordApproval, updateTask, validateRegistry } from "./registry.mjs";
import { WORKFORCE } from "../../lib/workforce.mjs";

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

test("VERIFIED requires an independent registry-approved reviewer and evidence", () => {
  let registry = oneTask();
  const id = registry.tasks[0].id;
  const subagjo = WORKFORCE.find((employee) => employee.id === "subagjo");
  const reviewer = subagjo.verification_policy.reviewer_candidates[0];
  assert.ok(reviewer && reviewer !== "subagjo");

  registry = updateTask(registry, id, { lifecycle_status: "REQUESTED", actor: "owner" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status: "IN_PROGRESS", actor: "subagjo" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status: "COMPLETED", actor: "subagjo" }, clock, ids);

  assert.throws(
    () => updateTask(registry, id, { lifecycle_status: "VERIFIED", actor: "subagjo", evidence_ref: "test.txt" }, clock, ids),
    /cannot independently verify its own work/
  );
  assert.throws(
    () => updateTask(registry, id, { lifecycle_status: "VERIFIED", actor: reviewer }, clock, ids),
    /membutuhkan evidence/
  );

  registry = updateTask(registry, id, { lifecycle_status: "VERIFIED", actor: reviewer, evidence_ref: "tests/pass.txt" }, clock, ids);
  assert.equal(registry.tasks[0].lifecycle_status, "VERIFIED");
  assert.equal(registry.events.at(-1).actor, reviewer);
  assert.equal(registry.events.at(-1).evidence_ref, "tests/pass.txt");
  assert.equal(validateRegistry(registry), true);
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


test("Hermes staging supports every canonical employee", () => {
  assert.ok(EMPLOYEES.length >= 16);
  const employeeIds = EMPLOYEES.map((employee) => employee.id);
  for (const employee of employeeIds) {
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
  for (const expected of ["maya","gugun","ratri","bimo","nara","dina","bambang","fikri","tari","caca"]) {
    assert.ok(employeeIds.includes(expected), expected);
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


test("Siti cannot verify Siti's own task in package registry", () => {
  let registry = createTask(createEmptyRegistry(clock), {
    title: "Siti independent review boundary",
    assignee_id: "siti",
    requester: "the owner",
  }, clock, ids);
  const id = registry.tasks[0].id;
  const siti = WORKFORCE.find((employee) => employee.id === "siti");
  const reviewer = siti.verification_policy.reviewer_candidates.find((candidate) => candidate !== "siti");
  assert.ok(reviewer, "Siti must have at least one independent reviewer candidate");

  registry = updateTask(registry, id, { lifecycle_status: "REQUESTED", actor: "owner" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status: "IN_PROGRESS", actor: "siti" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status: "COMPLETED", actor: "siti" }, clock, ids);

  assert.throws(
    () => updateTask(registry, id, { lifecycle_status: "VERIFIED", actor: "siti", evidence_ref: "evidence/self.log" }, clock, ids),
    /cannot independently verify its own work/
  );

  registry = updateTask(registry, id, { lifecycle_status: "VERIFIED", actor: reviewer, evidence_ref: "evidence/independent.log" }, clock, ids);
  assert.equal(registry.tasks[0].lifecycle_status, "VERIFIED");
  assert.equal(registry.events.at(-1).actor, reviewer);
  assert.equal(validateRegistry(registry), true);
});


test("signed execution receipt reference is append-only tracked", () => {
  let registry = oneTask();
  const id = registry.tasks[0].id;
  const ref = "receipt:sha256:" + "a".repeat(64);
  registry = attachExecutionReceipt(registry, id, {
    receipt_ref:ref,
    actor:"subagjo",
    source:"runtime:test",
  }, clock, ids);

  assert.equal(registry.tasks[0].execution_receipt_ref, ref);
  assert.equal(registry.events.at(-1).action, "EXECUTION_RECEIPT_ATTACHED");
  assert.equal(registry.events.at(-1).evidence_ref, ref);
  assert.equal(validateRegistry(registry), true);
});

test("execution receipt attachment rejects malformed refs and unauthorized actor", () => {
  const registry = oneTask();
  const id = registry.tasks[0].id;
  assert.throws(
    () => attachExecutionReceipt(registry, id, { receipt_ref:"receipt://unsigned", actor:"subagjo" }, clock, ids),
    /reference tidak valid/
  );
  assert.throws(
    () => attachExecutionReceipt(registry, id, {
      receipt_ref:"receipt:sha256:" + "b".repeat(64),
      actor:"maya",
    }, clock, ids),
    /assignee atau runtime adapter/
  );
});

test("import rejects forged execution receipt ref without attachment event", () => {
  const registry = oneTask();
  const forged = structuredClone(registry);
  forged.tasks[0].execution_receipt_ref = "receipt:sha256:" + "c".repeat(64);
  assert.throws(
    () => importRegistry(JSON.stringify(forged)),
    /append-only attachment event/
  );
});

test("execution receipt cannot be attached after verification without reopening", () => {
  let registry = oneTask();
  const id = registry.tasks[0].id;
  const subagjo = WORKFORCE.find((employee) => employee.id === "subagjo");
  const reviewer = subagjo.verification_policy.reviewer_candidates[0];
  registry = updateTask(registry, id, { lifecycle_status:"REQUESTED", actor:"owner" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status:"IN_PROGRESS", actor:"subagjo" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status:"COMPLETED", actor:"subagjo" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status:"VERIFIED", actor:reviewer, evidence_ref:"test://verified" }, clock, ids);

  assert.throws(
    () => attachExecutionReceipt(registry, id, {
      receipt_ref:"receipt:sha256:" + "d".repeat(64),
      actor:"subagjo",
    }, clock, ids),
    /setelah task VERIFIED/
  );
});
