import { normalizeExecutionAttempt } from "./contracts.mjs";
import { normalizeHandoffResult } from "./handoff.mjs";
import { normalizeTaskNode } from "../task-registry/task-node.mjs";
import { validateSandboxAdmission, validateSandboxRecord } from "../live-sandbox/index.mjs";

export const EXECUTION_TELEMETRY_API = 1;
const TERMINAL_ATTEMPT_STATES = new Set(["BLOCKED","PARTIAL","FAILED","SUCCEEDED","CANCELLED"]);

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const unique = (values) => Object.freeze([...new Set((Array.isArray(values) ? values : []).map((value) => clean(value)).filter(Boolean))]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function frozenCost(value) {
  if (!value || value.status !== "KNOWN") return Object.freeze({ status:"UNKNOWN", amount_usd:null });
  return Object.freeze({ status:"KNOWN", amount_usd:Number(value.amount_usd) });
}

function durationMs(attempt) {
  if (!attempt.started_at || !attempt.finished_at) return null;
  return Math.max(0, Date.parse(attempt.finished_at) - Date.parse(attempt.started_at));
}

function normalizeSidecars({ task, attempt, sandbox_admission, sandbox_record, handoff_result }) {
  let admission = null;
  let record = null;
  let handoff = null;

  if (sandbox_admission != null) {
    validateSandboxAdmission(sandbox_admission);
    admission = sandbox_admission;
    assert(admission.task_id === task.task_id, "Sandbox admission TaskNode identity mismatch.");
    assert(admission.mission_id === task.mission_id, "Sandbox admission Mission identity mismatch.");
    assert(admission.provider_id === attempt.runtime.provider, "Sandbox admission runtime provider mismatch.");
    if (attempt.model_route_ref != null) {
      assert(admission.model_route_ref === attempt.model_route_ref, "Sandbox admission model route mismatch.");
    }
  }

  if (sandbox_record != null) {
    validateSandboxRecord(sandbox_record);
    record = sandbox_record;
    assert(record.task_id === task.task_id, "Sandbox record TaskNode identity mismatch.");
    assert(record.mission_id === task.mission_id, "Sandbox record Mission identity mismatch.");
    assert(record.provider_id === attempt.runtime.provider, "Sandbox record runtime provider mismatch.");
    assert(record.runtime?.provider === attempt.runtime.provider, "Sandbox record runtime identity mismatch.");
    assert(record.runtime?.runtime_ref === attempt.runtime.runtime_ref, "Sandbox record runtime_ref mismatch.");
    if (admission) {
      assert(record.sandbox_admission_ref === admission.sandbox_admission_ref, "Sandbox record/admission identity mismatch.");
    }
  }

  if (handoff_result != null) {
    handoff = normalizeHandoffResult(handoff_result);
    assert(handoff.task_id === task.task_id, "Handoff result TaskNode identity mismatch.");
    assert(handoff.mission_id === task.mission_id, "Handoff result Mission identity mismatch.");
    assert(handoff.employee_id === task.employee_id, "Handoff result employee identity mismatch.");
    assert(handoff.state === attempt.state, "Handoff result Attempt state mismatch.");
  }

  return { admission, record, handoff };
}

export function buildExecutionTelemetry({
  task_node,
  attempt:attemptInput,
  sandbox_admission = null,
  sandbox_record = null,
  handoff_result = null,
} = {}) {
  const task = normalizeTaskNode(task_node);
  const attempt = normalizeExecutionAttempt(attemptInput);

  assert(attempt.task_id === task.task_id, "Execution Attempt/TaskNode identity mismatch.");
  assert(task.attempt_ids.includes(attempt.attempt_id), "TaskNode does not reference this Execution Attempt.");

  const { admission, record, handoff } = normalizeSidecars({
    task,
    attempt,
    sandbox_admission,
    sandbox_record,
    handoff_result,
  });

  const terminal = TERMINAL_ATTEMPT_STATES.has(attempt.state);
  const timing = Object.freeze({
    started_at:attempt.started_at,
    finished_at:attempt.finished_at,
    duration_ms:durationMs(attempt),
  });

  const modelStatus = record?.model_identity?.status === "KNOWN" ? "KNOWN" : "UNKNOWN";
  const model = Object.freeze({
    status:modelStatus,
    provider_id:record?.provider_id || attempt.runtime.provider,
    model_id:modelStatus === "KNOWN" ? clean(record.model_identity.model_id, 240) : null,
    model_route_ref:attempt.model_route_ref,
    source:record ? "SANDBOX_RECORD_V1" : "EXECUTION_ATTEMPT_RUNTIME_V1",
  });

  const tools = Object.freeze({
    status:admission ? "KNOWN" : "UNKNOWN",
    tool_ids:Object.freeze(admission ? [...admission.tool_ids] : []),
    capability_route_refs:Object.freeze([...attempt.capability_route_refs]),
    source:admission ? "SANDBOX_ADMISSION_V1" : "UNKNOWN",
  });

  const actual = record?.actual_usage || null;
  const inputTokens = actual?.input_tokens ?? null;
  const outputTokens = actual?.output_tokens ?? null;
  const usage = Object.freeze({
    source:record ? "SANDBOX_RECORD_V1" : "UNKNOWN",
    duration_ms:actual?.duration_ms ?? null,
    tool_calls:actual?.tool_calls ?? null,
    input_tokens:inputTokens,
    output_tokens:outputTokens,
    total_tokens:inputTokens == null || outputTokens == null ? null : inputTokens + outputTokens,
    cost:frozenCost(actual?.cost),
  });

  const unknowns = [];
  if (model.status === "UNKNOWN") unknowns.push("MODEL_IDENTITY");
  if (tools.status === "UNKNOWN") unknowns.push("TOOL_IDS");
  if (!record) {
    unknowns.push("USAGE");
  } else {
    for (const dimension of record.unverified_dimensions || []) unknowns.push(clean(dimension, 120));
    if (usage.tool_calls == null) unknowns.push("TOOL_CALLS");
    if (usage.input_tokens == null) unknowns.push("INPUT_TOKENS");
    if (usage.output_tokens == null) unknowns.push("OUTPUT_TOKENS");
    if (usage.total_tokens == null) unknowns.push("TOTAL_TOKENS");
    if (usage.cost.status === "UNKNOWN") unknowns.push("COST");
  }
  if (handoff) unknowns.push(...handoff.unknowns);

  const blockers = [];
  if (attempt.error_category) {
    blockers.push(Object.freeze({
      source:"EXECUTION_ATTEMPT_V1",
      code:attempt.error_category,
      detail:null,
    }));
  }
  if (task.blocking) {
    blockers.push(Object.freeze({
      source:"TASK_NODE_V1",
      code:task.blocking.kind,
      detail:task.blocking.reason,
    }));
  }
  for (const reason of record?.reason_codes || []) {
    blockers.push(Object.freeze({
      source:"SANDBOX_RECORD_V1",
      code:clean(reason, 120),
      detail:null,
    }));
  }

  return Object.freeze({
    api:EXECUTION_TELEMETRY_API,
    employee:Object.freeze({ employee_id:task.employee_id }),
    execution:Object.freeze({
      attempt_id:attempt.attempt_id,
      ordinal:attempt.ordinal,
      state:attempt.state,
      terminal,
      state_source:"EXECUTION_ATTEMPT_V1",
    }),
    timing,
    model,
    runtime:Object.freeze({ ...attempt.runtime }),
    tools,
    usage,
    artifact_refs:Object.freeze([...attempt.artifact_refs]),
    evidence_refs:Object.freeze([...attempt.evidence_refs]),
    receipt_ref:attempt.receipt_ref,
    unknowns:unique(unknowns),
    blockers:Object.freeze(blockers),
    residual_risks:Object.freeze(handoff ? [...handoff.residual_risks] : []),
    traceability:Object.freeze({
      terminal_state_ref:"attempt:"+attempt.attempt_id,
      sandbox_admission_ref:admission?.sandbox_admission_ref || null,
      sandbox_record_ref:record?.sandbox_record_ref || null,
      previous_attempt_id:attempt.previous_attempt_id,
      recovery_checkpoint_ref:attempt.recovery_checkpoint_ref,
    }),
  });
}

export function buildMissionTelemetry({
  task_nodes = [],
  attempts = [],
  sandbox_admissions = [],
  sandbox_records = [],
  handoff_results = [],
} = {}) {
  assert(Array.isArray(task_nodes), "task_nodes must be an array.");
  assert(Array.isArray(attempts), "attempts must be an array.");
  const tasks = new Map(task_nodes.map((node) => {
    const normalized = normalizeTaskNode(node);
    return [normalized.task_id, normalized];
  }));
  const normalizedAttempts = attempts.map((item) => normalizeExecutionAttempt(item));
  const attemptsPerTask = new Map();
  for (const item of normalizedAttempts) {
    attemptsPerTask.set(item.task_id, (attemptsPerTask.get(item.task_id) || 0) + 1);
  }

  return Object.freeze(normalizedAttempts.map((attempt) => {
    const task = tasks.get(attempt.task_id);
    assert(task, "Execution Attempt references missing TaskNode: "+attempt.task_id);
    const uniqueAttempt = attemptsPerTask.get(attempt.task_id) === 1;
    const admission = uniqueAttempt ? sandbox_admissions.find((item) => item?.task_id === attempt.task_id) || null : null;
    const record = uniqueAttempt ? sandbox_records.find((item) => item?.task_id === attempt.task_id) || null : null;
    const handoff = uniqueAttempt ? handoff_results.find((item) => item?.task_id === attempt.task_id) || null : null;
    return buildExecutionTelemetry({
      task_node:task,
      attempt,
      sandbox_admission:admission,
      sandbox_record:record,
      handoff_result:handoff,
    });
  }));
}
