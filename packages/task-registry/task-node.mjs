import { APPROVAL_STATUSES, RISK_CLASSES } from "./registry.mjs";
import { PORTABLE_WORKFORCE as WORKFORCE } from "../../lib/workforce.mjs";

export const TASK_NODE_SCHEMA = 1;

export const TASK_NODE_STATES = Object.freeze([
  "PLANNED",
  "READY",
  "RUNNING",
  "WAITING_APPROVAL",
  "BLOCKED",
  "PARTIAL",
  "FAILED",
  "RETRYING",
  "RECOVERED",
  "SUCCEEDED",
  "VERIFIED",
  "CANCELLED",
]);

export const TASK_NODE_BLOCK_KINDS = Object.freeze([
  "APPROVAL",
  "USER_INPUT",
  "DEPENDENCY",
  "POLICY",
  "RUNTIME",
  "OTHER",
]);

export const TASK_NODE_TRANSITIONS = Object.freeze({
  PLANNED:Object.freeze(["READY","WAITING_APPROVAL","BLOCKED","CANCELLED"]),
  READY:Object.freeze(["RUNNING","WAITING_APPROVAL","BLOCKED","CANCELLED"]),
  RUNNING:Object.freeze(["WAITING_APPROVAL","BLOCKED","PARTIAL","FAILED","SUCCEEDED","CANCELLED"]),
  WAITING_APPROVAL:Object.freeze(["READY","BLOCKED","CANCELLED"]),
  BLOCKED:Object.freeze(["PLANNED","READY","RUNNING","WAITING_APPROVAL","FAILED","CANCELLED"]),
  PARTIAL:Object.freeze(["RETRYING","CANCELLED"]),
  FAILED:Object.freeze(["RETRYING","CANCELLED"]),
  RETRYING:Object.freeze(["RECOVERED","RUNNING","BLOCKED","FAILED","CANCELLED"]),
  RECOVERED:Object.freeze(["RUNNING","SUCCEEDED","PARTIAL","FAILED","BLOCKED","CANCELLED"]),
  SUCCEEDED:Object.freeze(["VERIFIED","RUNNING"]),
  VERIFIED:Object.freeze(["RUNNING"]),
  CANCELLED:Object.freeze([]),
});

const EMPLOYEE_BY_ID = new Map(WORKFORCE.map((employee) => [employee.id, employee]));
const RISK_SET = new Set(RISK_CLASSES);
const APPROVAL_SET = new Set(APPROVAL_STATUSES);
const STATE_SET = new Set(TASK_NODE_STATES);
const BLOCK_KIND_SET = new Set(TASK_NODE_BLOCK_KINDS);
const RECEIPT_REF = /^receipt:sha256:[a-f0-9]{64}$/;

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const unique = (values, max = 1000) => Object.freeze([...new Set((Array.isArray(values) ? values : [])
  .map((value) => clean(value, max))
  .filter(Boolean))]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validTimestamp(value) {
  return typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value));
}

function normalizeApproval(value = {}) {
  const required = value.required === true;
  const status = clean(value.status || (required ? "PENDING" : "NOT_REQUIRED"), 20).toUpperCase();
  assert(APPROVAL_SET.has(status), "TaskNode approval status is invalid.");
  if (!required) assert(status === "NOT_REQUIRED", "TaskNode without required approval must use NOT_REQUIRED.");
  if (required) assert(status !== "NOT_REQUIRED", "TaskNode requiring approval cannot use NOT_REQUIRED.");
  const approvalRef = value.approval_ref == null ? null : clean(value.approval_ref, 1000);
  return Object.freeze({ required, status, approval_ref:approvalRef || null });
}

function normalizeBlocking(value) {
  if (value == null) return null;
  assert(value && typeof value === "object" && !Array.isArray(value), "TaskNode blocking must be null or an object.");
  const kind = clean(value.kind, 40).toUpperCase();
  const reason = clean(value.reason, 1000);
  assert(BLOCK_KIND_SET.has(kind), "TaskNode blocking kind is invalid.");
  assert(reason, "TaskNode blocking reason is required.");
  return Object.freeze({ kind, reason });
}

function normalizeLegacy(value) {
  if (value == null) return null;
  assert(value && typeof value === "object" && !Array.isArray(value), "TaskNode legacy metadata must be null or an object.");
  const source = clean(value.source, 80);
  const lifecycleStatus = clean(value.lifecycle_status, 40).toUpperCase();
  assert(source, "TaskNode legacy source is required.");
  assert(lifecycleStatus, "TaskNode legacy lifecycle_status is required.");
  return Object.freeze({ source, lifecycle_status:lifecycleStatus });
}

function mayVerify(employeeId, verifierId) {
  const employee = EMPLOYEE_BY_ID.get(employeeId);
  const verifier = clean(verifierId, 40).toLowerCase();
  return Boolean(
    employee
    && verifier
    && verifier !== employeeId
    && employee.verification_policy?.independent_required === true
    && employee.verification_policy?.self_verify === false
    && Array.isArray(employee.verification_policy?.reviewer_candidates)
    && employee.verification_policy.reviewer_candidates.includes(verifier)
  );
}

export function normalizeTaskNode(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "TaskNode input must be an object.");
  assert(input.schema === TASK_NODE_SCHEMA, "TaskNode schema must be 1.");

  const taskId = clean(input.task_id, 160);
  const missionId = input.mission_id == null ? null : clean(input.mission_id, 160);
  const title = clean(input.title, 160);
  const objective = clean(input.objective, 4000);
  const employeeId = clean(input.employee_id, 40).toLowerCase();
  const riskClass = clean(input.risk_class, 40).toUpperCase();
  const state = clean(input.state, 40).toUpperCase();
  const createdAt = clean(input.created_at, 80);
  const updatedAt = clean(input.updated_at, 80);

  assert(taskId, "TaskNode task_id is required.");
  if (input.mission_id != null) assert(missionId, "TaskNode mission_id must be null or non-empty.");
  assert(title, "TaskNode title is required.");
  assert(objective, "TaskNode objective is required.");
  assert(EMPLOYEE_BY_ID.has(employeeId), "TaskNode employee_id is unknown.");
  assert(RISK_SET.has(riskClass), "TaskNode risk_class is invalid.");
  assert(STATE_SET.has(state), "TaskNode state is invalid.");
  assert(validTimestamp(createdAt), "TaskNode created_at must be a valid timestamp.");
  assert(validTimestamp(updatedAt), "TaskNode updated_at must be a valid timestamp.");
  assert(Date.parse(updatedAt) >= Date.parse(createdAt), "TaskNode updated_at cannot precede created_at.");

  const approval = normalizeApproval(input.approval);
  const attemptIds = unique(input.attempt_ids, 160);
  const evidenceRefs = unique(input.evidence_refs);
  const receiptRefs = unique(input.receipt_refs);
  for (const ref of receiptRefs) assert(RECEIPT_REF.test(ref), "TaskNode receipt_refs must use receipt:sha256 references.");

  const blocking = normalizeBlocking(input.blocking);
  if (state === "WAITING_APPROVAL") {
    assert(approval.required, "WAITING_APPROVAL requires approval.required=true.");
    assert(approval.status !== "APPROVED", "WAITING_APPROVAL cannot already be approved.");
    assert(blocking?.kind === "APPROVAL", "WAITING_APPROVAL requires APPROVAL blocking metadata.");
  }
  if (state === "BLOCKED") assert(blocking, "BLOCKED TaskNode requires blocking metadata.");
  if (!["WAITING_APPROVAL","BLOCKED"].includes(state)) {
    assert(blocking == null, "Only WAITING_APPROVAL or BLOCKED TaskNode may carry blocking metadata.");
  }
  if (state === "VERIFIED") assert(evidenceRefs.length > 0, "VERIFIED TaskNode requires evidence_refs.");

  return Object.freeze({
    schema:TASK_NODE_SCHEMA,
    task_id:taskId,
    mission_id:missionId,
    title,
    objective,
    employee_id:employeeId,
    risk_class:riskClass,
    state,
    approval,
    attempt_ids:attemptIds,
    evidence_refs:evidenceRefs,
    receipt_refs:receiptRefs,
    blocking,
    legacy:normalizeLegacy(input.legacy),
    created_at:new Date(createdAt).toISOString(),
    updated_at:new Date(updatedAt).toISOString(),
  });
}

export function validateTaskNode(input) {
  normalizeTaskNode(input);
  return true;
}

export function assertTaskNodeTransition(nodeInput, nextStateInput, {
  actor_id = "",
  verifier_id = "",
  evidence_refs = [],
  reopen = false,
  approval = null,
} = {}) {
  const node = normalizeTaskNode(nodeInput);
  const nextState = clean(nextStateInput, 40).toUpperCase();
  assert(STATE_SET.has(nextState), "TaskNode next state is invalid.");
  assert(nextState !== node.state, "TaskNode transition must change state.");
  assert(TASK_NODE_TRANSITIONS[node.state].includes(nextState), `TaskNode transition ${node.state} -> ${nextState} is not allowed.`);

  if (approval != null) {
    assert(node.state === "WAITING_APPROVAL" && nextState === "READY", "Approval mutation is only allowed atomically with WAITING_APPROVAL -> READY.");
  }
  const effectiveApproval = approval == null ? node.approval : normalizeApproval(approval);

  if (nextState === "RUNNING" && effectiveApproval.required) {
    assert(effectiveApproval.status === "APPROVED", "TaskNode cannot RUN without APPROVED required approval.");
    assert(effectiveApproval.approval_ref, "TaskNode cannot RUN without approval_ref for required approval.");
  }

  if (nextState === "WAITING_APPROVAL") {
    assert(effectiveApproval.required, "WAITING_APPROVAL requires approval.required=true.");
    assert(effectiveApproval.status !== "APPROVED", "Approved TaskNode cannot enter WAITING_APPROVAL.");
  }

  if (node.state === "WAITING_APPROVAL" && nextState === "READY") {
    assert(effectiveApproval.status === "APPROVED", "WAITING_APPROVAL TaskNode requires APPROVED status before READY.");
    assert(effectiveApproval.approval_ref, "WAITING_APPROVAL TaskNode requires approval_ref before READY.");
  }

  if (nextState === "VERIFIED") {
    const refs = unique([...node.evidence_refs, ...(Array.isArray(evidence_refs) ? evidence_refs : [])]);
    assert(node.state === "SUCCEEDED", "Only SUCCEEDED TaskNode may become VERIFIED.");
    assert(refs.length > 0, "VERIFIED transition requires evidence.");
    assert(mayVerify(node.employee_id, verifier_id), "VERIFIED transition requires an independent registry-approved reviewer.");
  }

  if (node.state === "VERIFIED" && nextState === "RUNNING") {
    assert(reopen === true, "VERIFIED TaskNode requires explicit reopen=true before rework.");
    assert(clean(actor_id, 40).toLowerCase() === "owner", "Only owner may reopen VERIFIED TaskNode.");
  }

  if (node.state === "SUCCEEDED" && nextState === "RUNNING") {
    assert(reopen === true, "SUCCEEDED TaskNode requires explicit reopen=true before rework.");
  }

  return true;
}

export function transitionTaskNode(nodeInput, nextState, {
  clock = () => new Date().toISOString(),
  evidence_refs = [],
  approval = null,
  ...context
} = {}) {
  const node = normalizeTaskNode(nodeInput);
  assertTaskNodeTransition(node, nextState, { ...context, evidence_refs, approval });
  const normalizedState = clean(nextState, 40).toUpperCase();
  const refs = unique([...node.evidence_refs, ...(Array.isArray(evidence_refs) ? evidence_refs : [])]);
  let blocking = null;
  if (normalizedState === "WAITING_APPROVAL") {
    blocking = Object.freeze({ kind:"APPROVAL", reason:"Task requires owner approval before execution." });
  } else if (normalizedState === "BLOCKED") {
    const requested = context.blocking;
    blocking = normalizeBlocking(requested || { kind:"OTHER", reason:"Task execution is blocked." });
  }

  return normalizeTaskNode({
    ...node,
    state:normalizedState,
    approval:approval == null ? node.approval : approval,
    evidence_refs:refs,
    blocking,
    updated_at:clock(),
  });
}

function legacySource(registryVersion, task) {
  if (registryVersion === 1 || task?.execution_receipt_ref !== undefined || task?.requester !== undefined) return "PACKAGE_REGISTRY_V1";
  if (registryVersion === 3 || task?.comments !== undefined || task?.provenance !== undefined) return "OFFICE_REGISTRY_V3";
  return "LEGACY_TASK";
}

function legacyState(task) {
  const status = clean(task?.lifecycle_status, 40).toUpperCase();
  const approvalRequired = task?.approval_required === true;
  const approvalStatus = clean(task?.approval_status || (approvalRequired ? "PENDING" : "NOT_REQUIRED"), 20).toUpperCase();

  if (status === "PLANNED") return "PLANNED";
  if (status === "REQUESTED") return approvalRequired && approvalStatus !== "APPROVED" ? "WAITING_APPROVAL" : "READY";
  if (status === "IN_PROGRESS") return "RUNNING";
  if (status === "WAITING_FOR_USER") return approvalRequired && approvalStatus === "PENDING" ? "WAITING_APPROVAL" : "BLOCKED";
  if (status === "COMPLETED") return "SUCCEEDED";
  if (status === "VERIFIED") return "VERIFIED";
  if (status === "BLOCKED") return "BLOCKED";
  throw new Error(`Unsupported legacy task lifecycle_status: ${status || "(empty)"}`);
}

export function migrateLegacyTaskToTaskNode(task = {}, {
  registryVersion = null,
  missionId = null,
} = {}) {
  assert(task && typeof task === "object" && !Array.isArray(task), "Legacy task must be an object.");

  const taskId = clean(task.id, 160);
  const state = legacyState(task);
  const approvalRequired = task.approval_required === true;
  const approvalStatus = clean(task.approval_status || (approvalRequired ? "PENDING" : "NOT_REQUIRED"), 20).toUpperCase();
  const approvalRef = clean(task.approval_evidence_ref, 1000) || null;
  const evidenceRefs = unique([
    ...(Array.isArray(task.evidence_refs) ? task.evidence_refs : []),
    task.evidence_ref,
  ]);
  const receiptRefs = unique([task.execution_receipt_ref]).filter(Boolean);

  let blocking = null;
  if (state === "WAITING_APPROVAL") {
    blocking = { kind:"APPROVAL", reason:"Legacy task is waiting for owner approval." };
  } else if (state === "BLOCKED") {
    const status = clean(task.lifecycle_status, 40).toUpperCase();
    blocking = {
      kind:status === "WAITING_FOR_USER" ? "USER_INPUT" : "OTHER",
      reason:status === "WAITING_FOR_USER"
        ? "Legacy WAITING_FOR_USER state preserved as a generic user-input block."
        : "Legacy task is blocked; specific block reason was not canonicalized.",
    };
  }

  return normalizeTaskNode({
    schema:TASK_NODE_SCHEMA,
    task_id:taskId,
    mission_id:missionId,
    title:clean(task.title, 160),
    objective:clean(task.detail, 4000) || clean(task.title, 160),
    employee_id:clean(task.assignee_id, 40).toLowerCase(),
    risk_class:clean(task.risk_class || "READ_ONLY", 40).toUpperCase(),
    state,
    approval:{
      required:approvalRequired,
      status:approvalStatus,
      approval_ref:approvalRef,
    },
    attempt_ids:[],
    evidence_refs:evidenceRefs,
    receipt_refs:receiptRefs,
    blocking,
    legacy:{
      source:legacySource(registryVersion, task),
      lifecycle_status:clean(task.lifecycle_status, 40).toUpperCase(),
    },
    created_at:task.created_at,
    updated_at:task.updated_at || task.created_at,
  });
}
