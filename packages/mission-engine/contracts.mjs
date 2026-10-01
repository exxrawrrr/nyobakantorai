import { RISK_CLASSES } from "../task-registry/registry.mjs";

export const MISSION_SCHEMA = 1;
export const EXECUTION_ATTEMPT_SCHEMA = 1;

export const MISSION_STATES = Object.freeze([
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

export const MISSION_TRANSITIONS = Object.freeze({
  PLANNED:Object.freeze(["READY","BLOCKED","CANCELLED"]),
  READY:Object.freeze(["RUNNING","WAITING_APPROVAL","BLOCKED","CANCELLED"]),
  RUNNING:Object.freeze(["WAITING_APPROVAL","BLOCKED","PARTIAL","FAILED","SUCCEEDED","CANCELLED"]),
  WAITING_APPROVAL:Object.freeze(["READY","BLOCKED","CANCELLED"]),
  BLOCKED:Object.freeze(["READY","RUNNING","WAITING_APPROVAL","FAILED","CANCELLED"]),
  PARTIAL:Object.freeze(["RETRYING","CANCELLED"]),
  FAILED:Object.freeze(["RETRYING","CANCELLED"]),
  RETRYING:Object.freeze(["RECOVERED","RUNNING","BLOCKED","FAILED","CANCELLED"]),
  RECOVERED:Object.freeze(["RUNNING","SUCCEEDED","PARTIAL","FAILED","BLOCKED","CANCELLED"]),
  SUCCEEDED:Object.freeze(["VERIFIED","RUNNING"]),
  VERIFIED:Object.freeze(["RUNNING"]),
  CANCELLED:Object.freeze([]),
});

export const ATTEMPT_STATES = Object.freeze([
  "PLANNED",
  "RUNNING",
  "BLOCKED",
  "PARTIAL",
  "FAILED",
  "SUCCEEDED",
  "CANCELLED",
]);

export const ATTEMPT_TRANSITIONS = Object.freeze({
  PLANNED:Object.freeze(["RUNNING","BLOCKED","CANCELLED"]),
  RUNNING:Object.freeze(["BLOCKED","PARTIAL","FAILED","SUCCEEDED","CANCELLED"]),
  BLOCKED:Object.freeze([]),
  PARTIAL:Object.freeze([]),
  FAILED:Object.freeze([]),
  SUCCEEDED:Object.freeze([]),
  CANCELLED:Object.freeze([]),
});

const MISSION_STATE_SET = new Set(MISSION_STATES);
const ATTEMPT_STATE_SET = new Set(ATTEMPT_STATES);
const RISK_SET = new Set(RISK_CLASSES);
const AUTONOMY_MODES = new Set(["OBSERVE","GUARDED","DELEGATED"]);
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

function normalizeBudget(value = {}) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Mission budget must be an object.");
  const amount = value.hard_limit_amount == null ? null : Number(value.hard_limit_amount);
  const currency = value.currency == null ? null : clean(value.currency, 3).toUpperCase();
  if (amount == null) {
    assert(currency == null, "Mission budget currency must be null when hard_limit_amount is null.");
  } else {
    assert(Number.isFinite(amount) && amount >= 0, "Mission hard_limit_amount must be a non-negative finite number or null.");
    assert(/^[A-Z]{3}$/.test(currency || ""), "Mission budget with a hard limit requires a 3-letter currency.");
  }
  return Object.freeze({ hard_limit_amount:amount, currency });
}

function normalizeAutonomy(value = {}) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Mission autonomy must be an object.");
  const mode = clean(value.mode || "GUARDED", 40).toUpperCase();
  assert(AUTONOMY_MODES.has(mode), "Mission autonomy mode is invalid.");
  const delegatedCapabilities = unique(value.delegated_capabilities, 160);
  if (mode !== "DELEGATED") {
    assert(delegatedCapabilities.length === 0, "Only DELEGATED autonomy may carry delegated_capabilities.");
  }
  return Object.freeze({ mode, delegated_capabilities:delegatedCapabilities });
}

export function normalizeMission(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Mission input must be an object.");
  assert(input.schema === MISSION_SCHEMA, "Mission schema must be 1.");

  const missionId = clean(input.mission_id, 160);
  const objective = clean(input.objective, 4000);
  const state = clean(input.state, 40).toUpperCase();
  const riskClass = clean(input.risk_class || "READ_ONLY", 40).toUpperCase();
  const createdAt = clean(input.created_at, 80);
  const updatedAt = clean(input.updated_at, 80);

  assert(missionId, "Mission mission_id is required.");
  assert(objective, "Mission objective is required.");
  assert(MISSION_STATE_SET.has(state), "Mission state is invalid.");
  assert(RISK_SET.has(riskClass), "Mission risk_class is invalid.");
  assert(validTimestamp(createdAt), "Mission created_at must be a valid timestamp.");
  assert(validTimestamp(updatedAt), "Mission updated_at must be a valid timestamp.");
  assert(Date.parse(updatedAt) >= Date.parse(createdAt), "Mission updated_at cannot precede created_at.");

  const taskIds = unique(input.task_ids, 160);
  const constraints = unique(input.constraints, 1000);
  const artifactRefs = unique(input.artifact_refs);
  const evidenceRefs = unique(input.evidence_refs);
  const approvalRefs = unique(input.approval_refs);

  if (state === "VERIFIED") {
    assert(taskIds.length > 0, "VERIFIED Mission requires at least one TaskNode.");
    assert(evidenceRefs.length > 0, "VERIFIED Mission requires evidence_refs.");
  }

  return Object.freeze({
    schema:MISSION_SCHEMA,
    mission_id:missionId,
    objective,
    constraints,
    risk_class:riskClass,
    budget:normalizeBudget(input.budget || { hard_limit_amount:null, currency:null }),
    autonomy:normalizeAutonomy(input.autonomy || { mode:"GUARDED", delegated_capabilities:[] }),
    task_ids:taskIds,
    artifact_refs:artifactRefs,
    evidence_refs:evidenceRefs,
    approval_refs:approvalRefs,
    state,
    created_at:new Date(createdAt).toISOString(),
    updated_at:new Date(updatedAt).toISOString(),
  });
}

export function validateMission(input) {
  normalizeMission(input);
  return true;
}

export function assertMissionTransition(missionInput, nextStateInput, {
  actor_id = "",
  reopen = false,
  verification_satisfied = false,
  evidence_refs = [],
  approvals_satisfied = false,
} = {}) {
  const mission = normalizeMission(missionInput);
  const nextState = clean(nextStateInput, 40).toUpperCase();
  assert(MISSION_STATE_SET.has(nextState), "Mission next state is invalid.");
  assert(nextState !== mission.state, "Mission transition must change state.");
  assert(MISSION_TRANSITIONS[mission.state].includes(nextState), `Mission transition ${mission.state} -> ${nextState} is not allowed.`);

  if (mission.state === "WAITING_APPROVAL" && nextState === "READY") {
    assert(approvals_satisfied === true, "WAITING_APPROVAL Mission requires approvals_satisfied=true before READY.");
  }

  if (nextState === "VERIFIED") {
    const refs = unique([...mission.evidence_refs, ...(Array.isArray(evidence_refs) ? evidence_refs : [])]);
    assert(mission.state === "SUCCEEDED", "Only SUCCEEDED Mission may become VERIFIED.");
    assert(verification_satisfied === true, "Mission VERIFIED transition requires verified required-task evidence.");
    assert(refs.length > 0, "Mission VERIFIED transition requires evidence_refs.");
  }

  if (["SUCCEEDED","VERIFIED"].includes(mission.state) && nextState === "RUNNING") {
    assert(reopen === true, `${mission.state} Mission requires explicit reopen=true before rework.`);
    if (mission.state === "VERIFIED") {
      assert(clean(actor_id, 40).toLowerCase() === "owner", "Only owner may reopen VERIFIED Mission.");
    }
  }

  return true;
}

export function transitionMission(missionInput, nextState, {
  clock = () => new Date().toISOString(),
  evidence_refs = [],
  ...context
} = {}) {
  const mission = normalizeMission(missionInput);
  assertMissionTransition(mission, nextState, { ...context, evidence_refs });
  return normalizeMission({
    ...mission,
    state:clean(nextState, 40).toUpperCase(),
    evidence_refs:unique([...mission.evidence_refs, ...(Array.isArray(evidence_refs) ? evidence_refs : [])]),
    updated_at:clock(),
  });
}

function normalizeRuntime(value = {}) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Attempt runtime must be an object.");
  const provider = clean(value.provider, 120).toLowerCase();
  const runtimeRef = clean(value.runtime_ref, 512);
  assert(provider, "Attempt runtime.provider is required.");
  assert(runtimeRef, "Attempt runtime.runtime_ref is required.");
  return Object.freeze({
    provider,
    runtime_ref:runtimeRef,
    provider_version:value.provider_version == null ? null : clean(value.provider_version, 120) || null,
  });
}

function normalizeCleanup(value = {}) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Attempt cleanup must be an object.");
  const attempted = value.attempted === true;
  const ok = value.ok == null ? null : value.ok === true;
  if (!attempted) assert(ok == null, "Attempt cleanup.ok must be null when cleanup was not attempted.");
  return Object.freeze({ attempted, ok });
}

export function normalizeExecutionAttempt(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Execution Attempt input must be an object.");
  assert(input.schema === EXECUTION_ATTEMPT_SCHEMA, "Execution Attempt schema must be 1.");

  const attemptId = clean(input.attempt_id, 160);
  const taskId = clean(input.task_id, 160);
  const ordinal = Number(input.ordinal);
  const state = clean(input.state, 40).toUpperCase();
  const startedAt = input.started_at == null ? null : clean(input.started_at, 80);
  const finishedAt = input.finished_at == null ? null : clean(input.finished_at, 80);
  const receiptRef = input.receipt_ref == null ? null : clean(input.receipt_ref, 1000);
  const previousAttemptId = input.previous_attempt_id == null ? null : clean(input.previous_attempt_id, 160);
  const recoveryCheckpointRef = input.recovery_checkpoint_ref == null ? null : clean(input.recovery_checkpoint_ref, 1000);

  assert(attemptId, "Execution Attempt attempt_id is required.");
  assert(taskId, "Execution Attempt task_id is required.");
  assert(Number.isInteger(ordinal) && ordinal >= 1, "Execution Attempt ordinal must be an integer >= 1.");
  assert(ATTEMPT_STATE_SET.has(state), "Execution Attempt state is invalid.");
  if (startedAt != null) assert(validTimestamp(startedAt), "Execution Attempt started_at must be null or a valid timestamp.");
  if (finishedAt != null) assert(validTimestamp(finishedAt), "Execution Attempt finished_at must be null or a valid timestamp.");
  if (startedAt && finishedAt) assert(Date.parse(finishedAt) >= Date.parse(startedAt), "Execution Attempt finished_at cannot precede started_at.");
  if (state === "PLANNED") {
    assert(startedAt == null && finishedAt == null, "PLANNED Attempt cannot claim start/finish timestamps.");
  } else if (state === "RUNNING") {
    assert(startedAt != null && finishedAt == null, "RUNNING Attempt requires started_at and no finished_at.");
  } else if (state === "CANCELLED") {
    assert(finishedAt != null, "CANCELLED Attempt requires finished_at.");
  } else {
    assert(startedAt != null && finishedAt != null, "Terminal Attempt requires started_at and finished_at.");
  }
  if (receiptRef != null) assert(RECEIPT_REF.test(receiptRef), "Execution Attempt receipt_ref must use receipt:sha256.");
  if (previousAttemptId != null) {
    assert(previousAttemptId && previousAttemptId !== attemptId, "Execution Attempt previous_attempt_id must reference a different attempt.");
    assert(ordinal > 1, "Execution Attempt with previous_attempt_id must have ordinal > 1.");
  }
  if (ordinal === 1) assert(previousAttemptId == null, "First Execution Attempt cannot have previous_attempt_id.");

  const errorCategory = input.error_category == null ? null : clean(input.error_category, 120).toUpperCase();
  if (["FAILED","PARTIAL","BLOCKED"].includes(state)) assert(errorCategory, `${state} Attempt requires error_category.`);
  if (state === "SUCCEEDED") assert(errorCategory == null, "SUCCEEDED Attempt cannot carry error_category.");

  const cleanup = normalizeCleanup(input.cleanup || { attempted:false, ok:null });
  if (state === "SUCCEEDED") {
    assert(cleanup.attempted === true && cleanup.ok === true, "SUCCEEDED Attempt requires successful cleanup.");
  }

  return Object.freeze({
    schema:EXECUTION_ATTEMPT_SCHEMA,
    attempt_id:attemptId,
    task_id:taskId,
    ordinal,
    state,
    runtime:normalizeRuntime(input.runtime),
    model_route_ref:input.model_route_ref == null ? null : clean(input.model_route_ref, 1000) || null,
    capability_route_refs:unique(input.capability_route_refs),
    started_at:startedAt == null ? null : new Date(startedAt).toISOString(),
    finished_at:finishedAt == null ? null : new Date(finishedAt).toISOString(),
    error_category:errorCategory,
    cleanup,
    receipt_ref:receiptRef,
    evidence_refs:unique(input.evidence_refs),
    artifact_refs:unique(input.artifact_refs),
    previous_attempt_id:previousAttemptId,
    recovery_checkpoint_ref:recoveryCheckpointRef,
  });
}

export function validateExecutionAttempt(input) {
  normalizeExecutionAttempt(input);
  return true;
}

export function assertAttemptTransition(attemptInput, nextStateInput) {
  const attempt = normalizeExecutionAttempt(attemptInput);
  const nextState = clean(nextStateInput, 40).toUpperCase();
  assert(ATTEMPT_STATE_SET.has(nextState), "Execution Attempt next state is invalid.");
  assert(nextState !== attempt.state, "Execution Attempt transition must change state.");
  assert(ATTEMPT_TRANSITIONS[attempt.state].includes(nextState), `Execution Attempt transition ${attempt.state} -> ${nextState} is not allowed.`);
  return true;
}

export function attemptFromRuntimeOutcome(outcome = {}, {
  attempt_id,
  task_id,
  ordinal = 1,
  model_route_ref = null,
  capability_route_refs = [],
  receipt_ref = null,
  previous_attempt_id = null,
  recovery_checkpoint_ref = null,
} = {}) {
  assert(outcome && typeof outcome === "object" && !Array.isArray(outcome), "Runtime outcome is required.");
  const state = clean(outcome.state, 40).toUpperCase();
  assert(["SUCCEEDED","FAILED","PARTIAL","BLOCKED"].includes(state), "Runtime outcome state cannot map to an Execution Attempt.");

  const normalized = outcome.normalized_result || {};
  const evidence = outcome.evidence || {};
  const evidenceRefs = unique([
    ...(Array.isArray(normalized.evidence_refs) ? normalized.evidence_refs : []),
    ...(Array.isArray(evidence.evidence_refs) ? evidence.evidence_refs : []),
    evidence.raw_result_ref,
    evidence.normalized_result_ref,
  ]);
  const artifactRefs = unique([
    ...(Array.isArray(normalized.artifact_refs) ? normalized.artifact_refs : []),
    ...(Array.isArray(evidence.artifact_refs) ? evidence.artifact_refs : []),
  ]);

  return normalizeExecutionAttempt({
    schema:EXECUTION_ATTEMPT_SCHEMA,
    attempt_id,
    task_id,
    ordinal,
    state,
    runtime:outcome.runtime,
    model_route_ref,
    capability_route_refs,
    started_at:outcome.started_at,
    finished_at:outcome.finished_at,
    error_category:outcome.error_category,
    cleanup:outcome.cleanup,
    receipt_ref,
    evidence_refs:evidenceRefs,
    artifact_refs:artifactRefs,
    previous_attempt_id,
    recovery_checkpoint_ref,
  });
}
