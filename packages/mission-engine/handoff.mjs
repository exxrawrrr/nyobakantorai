import { PORTABLE_EMPLOYEE_BY_ID } from "../../lib/workforce.mjs";

export const HANDOFF_ENVELOPE_SCHEMA = 1;
export const HANDOFF_RESULT_SCHEMA = 1;

const RISK_CLASSES = new Set(["READ_ONLY","LOCAL_WRITE","EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);
const RETURN_STATES = new Set(["SUCCEEDED","FAILED","PARTIAL","BLOCKED","CANCELLED"]);
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
  assert(value && typeof value === "object" && !Array.isArray(value), "Handoff budget must be an object.");
  const amount = value.hard_limit_amount == null ? null : Number(value.hard_limit_amount);
  const currency = value.currency == null ? null : clean(value.currency, 3).toUpperCase();
  if (amount == null) {
    assert(currency == null, "Handoff budget currency must be null without hard_limit_amount.");
  } else {
    assert(Number.isFinite(amount) && amount >= 0, "Handoff budget amount must be non-negative or null.");
    assert(/^[A-Z]{3}$/.test(currency || ""), "Handoff budget requires a 3-letter currency.");
  }
  return Object.freeze({ hard_limit_amount:amount, currency });
}

function normalizeSource(value = {}) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Handoff source must be an object.");
  const taskIds = unique(value.task_ids, 160);
  const employeeIds = unique(value.employee_ids, 40).map((id) => id.toLowerCase());
  for (const id of employeeIds) assert(PORTABLE_EMPLOYEE_BY_ID[id], "Handoff source references unknown employee.");
  return Object.freeze({
    kind:"MISSION_ORCHESTRATOR",
    task_ids:Object.freeze(taskIds),
    employee_ids:Object.freeze(employeeIds),
  });
}

export function normalizeHandoffEnvelope(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Handoff envelope input must be an object.");
  assert(input.schema === HANDOFF_ENVELOPE_SCHEMA, "Handoff envelope schema must be 1.");

  const handoffId = clean(input.handoff_id, 160);
  const missionId = clean(input.mission_id, 160);
  const taskId = clean(input.task_id, 160);
  const destination = clean(input.destination_employee_id, 40).toLowerCase();
  const objective = clean(input.objective, 4000);
  const riskClass = clean(input.risk_class, 40).toUpperCase();
  const createdAt = clean(input.created_at, 80);
  const timeoutMs = Number(input.timeout_ms);

  assert(handoffId, "Handoff handoff_id is required.");
  assert(missionId, "Handoff mission_id is required.");
  assert(taskId, "Handoff task_id is required.");
  assert(PORTABLE_EMPLOYEE_BY_ID[destination], "Handoff destination employee is unknown.");
  assert(objective, "Handoff objective is required.");
  assert(RISK_CLASSES.has(riskClass), "Handoff risk_class is invalid.");
  assert(validTimestamp(createdAt), "Handoff created_at must be a valid timestamp.");
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 45_000, "Handoff timeout_ms must be 1..45000.");

  const source = normalizeSource(input.source);
  assert(!source.employee_ids.includes(destination), "Handoff destination cannot be listed as its own upstream source employee.");

  return Object.freeze({
    schema:HANDOFF_ENVELOPE_SCHEMA,
    handoff_id:handoffId,
    mission_id:missionId,
    task_id:taskId,
    source,
    destination_employee_id:destination,
    objective,
    constraints:unique(input.constraints),
    required_evidence:unique(input.required_evidence),
    input_artifact_refs:unique(input.input_artifact_refs),
    budget:normalizeBudget(input.budget || { hard_limit_amount:null, currency:null }),
    risk_class:riskClass,
    allowed_capabilities:unique(input.allowed_capabilities, 80),
    required_skills:unique(input.required_skills, 160),
    timeout_ms:timeoutMs,
    created_at:new Date(createdAt).toISOString(),
  });
}

export function validateHandoffEnvelope(input) {
  normalizeHandoffEnvelope(input);
  return true;
}

export function normalizeHandoffResult(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Handoff result input must be an object.");
  assert(input.schema === HANDOFF_RESULT_SCHEMA, "Handoff result schema must be 1.");

  const handoffId = clean(input.handoff_id, 160);
  const missionId = clean(input.mission_id, 160);
  const taskId = clean(input.task_id, 160);
  const employeeId = clean(input.employee_id, 40).toLowerCase();
  const state = clean(input.state, 40).toUpperCase();
  const finishedAt = clean(input.finished_at, 80);
  const receiptRef = input.receipt_ref == null ? null : clean(input.receipt_ref, 1000);

  assert(handoffId, "Handoff result handoff_id is required.");
  assert(missionId, "Handoff result mission_id is required.");
  assert(taskId, "Handoff result task_id is required.");
  assert(PORTABLE_EMPLOYEE_BY_ID[employeeId], "Handoff result employee is unknown.");
  assert(RETURN_STATES.has(state), "Handoff result state is invalid.");
  assert(validTimestamp(finishedAt), "Handoff result finished_at must be a valid timestamp.");
  if (receiptRef != null) assert(RECEIPT_REF.test(receiptRef), "Handoff result receipt_ref must use receipt:sha256.");

  const errorCategory = input.error_category == null ? null : clean(input.error_category, 120).toUpperCase();
  if (["FAILED","PARTIAL","BLOCKED"].includes(state)) assert(errorCategory, `${state} handoff result requires error_category.`);
  if (state === "SUCCEEDED") assert(errorCategory == null, "SUCCEEDED handoff result cannot carry error_category.");

  return Object.freeze({
    schema:HANDOFF_RESULT_SCHEMA,
    handoff_id:handoffId,
    mission_id:missionId,
    task_id:taskId,
    employee_id:employeeId,
    state,
    artifact_refs:unique(input.artifact_refs),
    evidence_refs:unique(input.evidence_refs),
    unknowns:unique(input.unknowns),
    residual_risks:unique(input.residual_risks),
    receipt_ref:receiptRef,
    error_category:errorCategory,
    finished_at:new Date(finishedAt).toISOString(),
  });
}

export function validateHandoffResult(input) {
  normalizeHandoffResult(input);
  return true;
}

export function buildHandoffEnvelope({
  handoff_id,
  mission,
  task,
  node_meta,
  source_task_ids = [],
  source_employee_ids = [],
  input_artifact_refs = [],
  allowed_capabilities = [],
  timeout_ms,
  created_at,
} = {}) {
  assert(mission?.mission_id === task?.mission_id, "Handoff Mission/TaskNode identity mismatch.");
  assert(node_meta?.task_id === task?.task_id, "Handoff node metadata TaskNode mismatch.");

  return normalizeHandoffEnvelope({
    schema:HANDOFF_ENVELOPE_SCHEMA,
    handoff_id,
    mission_id:mission.mission_id,
    task_id:task.task_id,
    source:{
      task_ids:source_task_ids,
      employee_ids:source_employee_ids,
    },
    destination_employee_id:task.employee_id,
    objective:task.objective,
    constraints:node_meta.constraints,
    required_evidence:node_meta.required_evidence,
    input_artifact_refs,
    budget:node_meta.budget_policy,
    risk_class:task.risk_class,
    allowed_capabilities,
    required_skills:node_meta.required_skills,
    timeout_ms,
    created_at,
  });
}

export function resultFromAttempt(envelopeInput, attemptInput, {
  unknowns = [],
  residual_risks = [],
} = {}) {
  const envelope = normalizeHandoffEnvelope(envelopeInput);
  assert(attemptInput?.task_id === envelope.task_id, "Handoff Attempt/TaskNode identity mismatch.");
  assert(attemptInput?.state, "Handoff Attempt state is required.");
  return normalizeHandoffResult({
    schema:HANDOFF_RESULT_SCHEMA,
    handoff_id:envelope.handoff_id,
    mission_id:envelope.mission_id,
    task_id:envelope.task_id,
    employee_id:envelope.destination_employee_id,
    state:attemptInput.state,
    artifact_refs:attemptInput.artifact_refs || [],
    evidence_refs:attemptInput.evidence_refs || [],
    unknowns,
    residual_risks,
    receipt_ref:attemptInput.receipt_ref || null,
    error_category:attemptInput.error_category || null,
    finished_at:attemptInput.finished_at || new Date().toISOString(),
  });
}

export function renderManualHandoffCompatibilityDraft(input) {
  const envelope = normalizeHandoffEnvelope(input);
  const body = {
    protocol:"NYOBAKANTORAI_MISSION_HANDOFF_V1",
    status:"DRAFT_NOT_SENT",
    execution:"NOT_EXECUTED",
    verification:"NOT_VERIFIED",
    mission_id:envelope.mission_id,
    task_id:envelope.task_id,
    destination_employee_id:envelope.destination_employee_id,
    objective:envelope.objective,
    constraints:envelope.constraints,
    required_evidence:envelope.required_evidence,
    input_artifact_refs:envelope.input_artifact_refs,
    allowed_capabilities:envelope.allowed_capabilities,
    required_skills:envelope.required_skills,
    risk_class:envelope.risk_class,
    timeout_ms:envelope.timeout_ms,
  };

  return [
    "MISSION HANDOFF COMPATIBILITY DRAFT — NOT SENT",
    "This projection is for owner/manual compatibility only.",
    "It is not an operations/handoff Hermes packet, not runtime evidence, and not a delivery receipt.",
    JSON.stringify(body, null, 2),
  ].join("\n");
}
