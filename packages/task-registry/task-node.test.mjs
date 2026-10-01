import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PORTABLE_WORKFORCE as WORKFORCE } from "../../lib/workforce.mjs";
import {
  createEmptyRegistry,
  createTask,
  recordApproval,
  updateTask,
} from "./registry.mjs";
import {
  TASK_NODE_STATES,
  TASK_NODE_TRANSITIONS,
  assertTaskNodeTransition,
  migrateLegacyTaskToTaskNode,
  normalizeTaskNode,
  transitionTaskNode,
  validateTaskNode,
} from "./task-node.mjs";

const root = new URL("../../", import.meta.url);
const schema = JSON.parse(await readFile(new URL("schemas/task-node.schema.json", root), "utf8"));

const stamp = (seconds = 0) => `2026-10-01T05:00:${String(seconds).padStart(2, "0")}.000Z`;

function baseNode(overrides = {}) {
  return {
    schema:1,
    task_id:"task-v06-001",
    mission_id:"mission-v06-001",
    title:"Bounded research task",
    objective:"Collect one bounded result and preserve evidence.",
    employee_id:"subagjo",
    risk_class:"READ_ONLY",
    state:"PLANNED",
    approval:{ required:false, status:"NOT_REQUIRED", approval_ref:null },
    attempt_ids:[],
    evidence_refs:[],
    receipt_refs:[],
    blocking:null,
    legacy:null,
    created_at:stamp(0),
    updated_at:stamp(0),
    ...overrides,
  };
}

test("TaskNode runtime state catalog matches the public schema", () => {
  assert.deepEqual(schema.properties.state.enum, TASK_NODE_STATES);
  assert.equal(schema.additionalProperties, false);
  assert.equal(validateTaskNode(baseNode()), true);
});

test("TaskNode normalizer rejects unknown employee, bad state, bad receipt and invalid timestamps", () => {
  assert.throws(() => normalizeTaskNode(baseNode({ employee_id:"not-a-worker" })), /employee_id is unknown/);
  assert.throws(() => normalizeTaskNode(baseNode({ state:"MAGIC" })), /state is invalid/);
  assert.throws(() => normalizeTaskNode(baseNode({ receipt_refs:["receipt://unsigned"] })), /receipt_refs/);
  assert.throws(() => normalizeTaskNode(baseNode({ updated_at:"not-a-date" })), /valid timestamp/);
  assert.throws(() => normalizeTaskNode(baseNode({ created_at:stamp(9), updated_at:stamp(1) })), /cannot precede/);
});

test("TaskNode state graph rejects skips and accepts the bounded happy path", () => {
  const node = normalizeTaskNode(baseNode());
  assert.throws(() => assertTaskNodeTransition(node, "RUNNING"), /PLANNED -> RUNNING is not allowed/);

  const ready = transitionTaskNode(node, "READY", { clock:() => stamp(1) });
  assert.equal(ready.state, "READY");

  const running = transitionTaskNode(ready, "RUNNING", { clock:() => stamp(2) });
  assert.equal(running.state, "RUNNING");

  const succeeded = transitionTaskNode(running, "SUCCEEDED", { clock:() => stamp(3) });
  assert.equal(succeeded.state, "SUCCEEDED");
});

test("required approval blocks RUNNING until approval status and evidence ref both exist", () => {
  const pending = normalizeTaskNode(baseNode({
    risk_class:"EXTERNAL_WRITE",
    state:"WAITING_APPROVAL",
    approval:{ required:true, status:"PENDING", approval_ref:null },
    blocking:{ kind:"APPROVAL", reason:"Owner approval required." },
  }));

  assert.throws(() => assertTaskNodeTransition(pending, "READY"), /requires APPROVED status/);

  const approved = normalizeTaskNode({
    ...pending,
    approval:{ required:true, status:"APPROVED", approval_ref:"approval:owner:v06" },
  });
  assert.equal(assertTaskNodeTransition(approved, "READY"), true);

  const ready = transitionTaskNode(approved, "READY", { clock:() => stamp(1) });
  assert.equal(ready.blocking, null);
  assert.equal(assertTaskNodeTransition(ready, "RUNNING"), true);

  const missingRef = normalizeTaskNode({
    ...ready,
    approval:{ required:true, status:"APPROVED", approval_ref:null },
  });
  assert.throws(() => assertTaskNodeTransition(missingRef, "RUNNING"), /approval_ref/);
});

test("TaskNode VERIFIED requires approved independent reviewer and evidence", () => {
  const worker = WORKFORCE.find((item) => item.id === "subagjo");
  const reviewer = worker.verification_policy.reviewer_candidates[0];
  assert.ok(reviewer && reviewer !== worker.id);

  const succeeded = normalizeTaskNode(baseNode({
    state:"SUCCEEDED",
    updated_at:stamp(1),
  }));

  assert.throws(
    () => assertTaskNodeTransition(succeeded, "VERIFIED", { verifier_id:"subagjo", evidence_refs:["test:self"] }),
    /independent registry-approved reviewer/,
  );
  assert.throws(
    () => assertTaskNodeTransition(succeeded, "VERIFIED", { verifier_id:reviewer }),
    /requires evidence/,
  );

  const verified = transitionTaskNode(succeeded, "VERIFIED", {
    verifier_id:reviewer,
    evidence_refs:["test:independent"],
    clock:() => stamp(2),
  });
  assert.equal(verified.state, "VERIFIED");
  assert.deepEqual(verified.evidence_refs, ["test:independent"]);
});

test("VERIFIED TaskNode can only reopen explicitly by owner", () => {
  const worker = WORKFORCE.find((item) => item.id === "subagjo");
  const reviewer = worker.verification_policy.reviewer_candidates[0];
  const succeeded = normalizeTaskNode(baseNode({ state:"SUCCEEDED", updated_at:stamp(1) }));
  const verified = transitionTaskNode(succeeded, "VERIFIED", {
    verifier_id:reviewer,
    evidence_refs:["test:qa"],
    clock:() => stamp(2),
  });

  assert.throws(() => assertTaskNodeTransition(verified, "RUNNING"), /reopen=true/);
  assert.throws(
    () => assertTaskNodeTransition(verified, "RUNNING", { reopen:true, actor_id:"subagjo" }),
    /Only owner/,
  );
  assert.equal(assertTaskNodeTransition(verified, "RUNNING", { reopen:true, actor_id:"owner" }), true);
});

test("PARTIAL and FAILED work create retry/recovery states instead of mutating one Attempt", () => {
  const partial = normalizeTaskNode(baseNode({ state:"PARTIAL", updated_at:stamp(1) }));
  assert.equal(assertTaskNodeTransition(partial, "RETRYING"), true);
  assert.throws(() => assertTaskNodeTransition(partial, "SUCCEEDED"), /not allowed/);

  const retrying = normalizeTaskNode(baseNode({ state:"RETRYING", updated_at:stamp(2) }));
  assert.equal(assertTaskNodeTransition(retrying, "RECOVERED"), true);

  const recovered = normalizeTaskNode(baseNode({ state:"RECOVERED", updated_at:stamp(3) }));
  assert.equal(assertTaskNodeTransition(recovered, "RUNNING"), true);
  assert.equal(TASK_NODE_TRANSITIONS.CANCELLED.length, 0);
});

test("legacy package REQUESTED task maps pending high-impact approval to WAITING_APPROVAL", () => {
  let tick = 0;
  const clock = () => stamp(tick++);
  let seq = 0;
  const ids = (prefix) => `${prefix}-legacy-${++seq}`;

  let registry = createTask(createEmptyRegistry(clock), {
    title:"Publish external change",
    detail:"Legacy package task",
    assignee_id:"subagjo",
    requester:"owner",
    risk_class:"EXTERNAL_WRITE",
  }, clock, ids);
  const id = registry.tasks[0].id;
  registry = updateTask(registry, id, {
    lifecycle_status:"REQUESTED",
    actor:"owner",
  }, clock, ids);

  const node = migrateLegacyTaskToTaskNode(registry.tasks[0], {
    registryVersion:1,
    missionId:"mission-migrated",
  });
  assert.equal(node.state, "WAITING_APPROVAL");
  assert.equal(node.blocking.kind, "APPROVAL");
  assert.equal(node.legacy.source, "PACKAGE_REGISTRY_V1");
  assert.equal(node.mission_id, "mission-migrated");
});

test("legacy WAITING_FOR_USER is preserved as generic USER_INPUT block unless approval is explicit", () => {
  let tick = 0;
  const clock = () => stamp(tick++);
  let seq = 0;
  const ids = (prefix) => `${prefix}-wait-${++seq}`;

  let registry = createTask(createEmptyRegistry(clock), {
    title:"Need missing input",
    detail:"Ask owner for a source file.",
    assignee_id:"alex",
    requester:"owner",
  }, clock, ids);
  const id = registry.tasks[0].id;
  registry = updateTask(registry, id, {
    lifecycle_status:"WAITING_FOR_USER",
    actor:"alex",
  }, clock, ids);

  const node = migrateLegacyTaskToTaskNode(registry.tasks[0], { registryVersion:1 });
  assert.equal(node.state, "BLOCKED");
  assert.equal(node.blocking.kind, "USER_INPUT");
  assert.match(node.blocking.reason, /not.*approval|user-input/i);
});

test("legacy approved task keeps approval evidence and COMPLETED maps to SUCCEEDED", () => {
  let tick = 0;
  const clock = () => stamp(tick++);
  let seq = 0;
  const ids = (prefix) => `${prefix}-approved-${++seq}`;

  let registry = createTask(createEmptyRegistry(clock), {
    title:"Approved external task",
    detail:"Legacy completed task",
    assignee_id:"maya",
    requester:"owner",
    risk_class:"EXTERNAL_WRITE",
  }, clock, ids);
  const id = registry.tasks[0].id;
  registry = recordApproval(registry, id, {
    status:"APPROVED",
    actor:"owner",
    evidence_ref:"approval:legacy:1",
  }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status:"REQUESTED", actor:"owner" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status:"IN_PROGRESS", actor:"maya" }, clock, ids);
  registry = updateTask(registry, id, { lifecycle_status:"COMPLETED", actor:"maya", evidence_ref:"test:legacy-result" }, clock, ids);

  const node = migrateLegacyTaskToTaskNode(registry.tasks[0], { registryVersion:1 });
  assert.equal(node.state, "SUCCEEDED");
  assert.equal(node.approval.status, "APPROVED");
  assert.equal(node.approval.approval_ref, "approval:legacy:1");
  assert.deepEqual(node.evidence_refs, ["test:legacy-result"]);
});

test("office schema-3 task migrates without promoting presentation provenance into runtime truth", () => {
  const officeTask = {
    id:"task_office_001",
    title:"Office local task",
    detail:"Local UI-only compatibility record.",
    assignee_id:"siti",
    lifecycle_status:"COMPLETED",
    risk_class:"READ_ONLY",
    approval_required:false,
    approval_status:"NOT_REQUIRED",
    evidence_refs:["file:office-evidence"],
    comments:[{ text:"presentation metadata" }],
    provenance:"DEMO",
    created_at:stamp(0),
    updated_at:stamp(1),
  };

  const node = migrateLegacyTaskToTaskNode(officeTask, { registryVersion:3 });
  assert.equal(node.state, "SUCCEEDED");
  assert.equal(node.legacy.source, "OFFICE_REGISTRY_V3");
  assert.equal("provenance" in node, false);
  assert.deepEqual(node.evidence_refs, ["file:office-evidence"]);
});
