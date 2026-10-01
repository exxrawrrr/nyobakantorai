import { containsSecretLikeContent } from "../execution-receipt/index.mjs";

export const RUNTIME_EXECUTION_ADAPTER_API = 1;

export const RUNTIME_EXECUTION_CAPABILITIES = Object.freeze([
  "bounded_process",
  "model_inference",
  "temporary_workspace",
  "evidence_collection",
]);

export const RUNTIME_EXECUTION_FORBIDDEN_CAPABILITIES = Object.freeze([
  "external_write",
  "paid_action",
  "account_change",
  "destructive",
  "install",
  "login",
  "production_repo_write",
  "unbounded_shell",
]);

const RISK_CLASSES = new Set(["READ_ONLY","LOCAL_WRITE","EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);
const RESULT_STATES = new Set(["SUCCEEDED","FAILED","PARTIAL","BLOCKED"]);
const SIDE_EFFECT_KEYS = Object.freeze([
  "install",
  "login",
  "account_mutation",
  "production_repo_write",
  "external_write",
  "paid_action",
  "destructive",
]);
const SLUG = /^[a-z][a-z0-9-]{1,63}$/;

const clean = (value, max = 512) => String(value ?? "").trim().slice(0, max);

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertContract(condition, code, message) {
  if (!condition) throw contractError(code, message);
}

function uniqueStrings(value, label, max = 160) {
  assertContract(Array.isArray(value), "CONTRACT_INVALID", `${label} must be an array`);
  const items = value.map((item) => clean(item, max));
  assertContract(items.every(Boolean), "CONTRACT_INVALID", `${label} must not contain empty values`);
  assertContract(new Set(items).size === items.length, "CONTRACT_INVALID", `${label} must not contain duplicates`);
  return Object.freeze(items);
}

function byteLength(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.byteLength(text ?? "", "utf8");
}

function normalizeRuntimeIdentity(value = {}) {
  const provider = clean(value.provider, 64).toLowerCase();
  const runtimeRef = clean(value.runtime_ref, 512);
  assertContract(SLUG.test(provider), "RUNTIME_IDENTITY_INVALID", "runtime.provider must be a lowercase slug");
  assertContract(runtimeRef, "RUNTIME_IDENTITY_INVALID", "runtime.runtime_ref is required");
  return Object.freeze({
    provider,
    runtime_ref:runtimeRef,
    provider_version:value.provider_version == null ? null : clean(value.provider_version, 120),
  });
}

function normalizeSideEffects(value = {}) {
  const out = {};
  for (const key of SIDE_EFFECT_KEYS) {
    out[key] = value[key] === true;
    assertContract(out[key] === false, "FORBIDDEN_SIDE_EFFECT", `execution adapter may not declare ${key}`);
  }
  return Object.freeze(out);
}

export function defineRuntimeExecutionPolicy(spec = {}) {
  assertContract(spec?.schema === 1, "POLICY_INVALID", "runtime execution policy schema must be 1");
  const id = clean(spec.id, 64).toLowerCase();
  assertContract(SLUG.test(id), "POLICY_INVALID", "runtime execution policy id must be a lowercase slug");
  assertContract(spec.contract === "runtime-execution-adapter-v1", "POLICY_INVALID", "unsupported runtime execution contract");

  const allowedRiskClasses = uniqueStrings(spec.allowed_risk_classes || [], "allowed_risk_classes", 40).map((item) => item.toUpperCase());
  assertContract(allowedRiskClasses.length > 0, "POLICY_INVALID", "allowed_risk_classes must not be empty");
  for (const risk of allowedRiskClasses) assertContract(RISK_CLASSES.has(risk), "POLICY_INVALID", `unknown risk class: ${risk}`);

  const allowedCapabilities = uniqueStrings(spec.allowed_capabilities || [], "allowed_capabilities", 80);
  for (const capability of allowedCapabilities) {
    assertContract(RUNTIME_EXECUTION_CAPABILITIES.includes(capability), "POLICY_INVALID", `unknown execution capability: ${capability}`);
  }

  const mandatoryForbidden = new Set(RUNTIME_EXECUTION_FORBIDDEN_CAPABILITIES);
  const forbidden = uniqueStrings(spec.forbidden_capabilities || [], "forbidden_capabilities", 80);
  for (const capability of mandatoryForbidden) {
    assertContract(forbidden.includes(capability), "POLICY_INVALID", `policy must forbid capability: ${capability}`);
  }

  const maxTimeoutMs = Number(spec.max_timeout_ms);
  const defaultTimeoutMs = Number(spec.default_timeout_ms);
  const maxOutputBytes = Number(spec.max_output_bytes);
  const maxEvidenceRefs = Number(spec.max_evidence_refs);
  const maxArtifactRefs = Number(spec.max_artifact_refs);
  assertContract(Number.isInteger(maxTimeoutMs) && maxTimeoutMs >= 1 && maxTimeoutMs <= 45_000, "POLICY_INVALID", "max_timeout_ms must be 1..45000");
  assertContract(Number.isInteger(defaultTimeoutMs) && defaultTimeoutMs >= 1 && defaultTimeoutMs <= maxTimeoutMs, "POLICY_INVALID", "default_timeout_ms must be within max_timeout_ms");
  assertContract(Number.isInteger(maxOutputBytes) && maxOutputBytes >= 1024 && maxOutputBytes <= 1024 * 1024, "POLICY_INVALID", "max_output_bytes must be 1024..1048576");
  assertContract(Number.isInteger(maxEvidenceRefs) && maxEvidenceRefs >= 1 && maxEvidenceRefs <= 64, "POLICY_INVALID", "max_evidence_refs must be 1..64");
  assertContract(Number.isInteger(maxArtifactRefs) && maxArtifactRefs >= 0 && maxArtifactRefs <= 64, "POLICY_INVALID", "max_artifact_refs must be 0..64");

  return Object.freeze({
    schema:1,
    id,
    contract:spec.contract,
    allowed_risk_classes:Object.freeze(allowedRiskClasses),
    allowed_capabilities:Object.freeze(allowedCapabilities),
    forbidden_capabilities:Object.freeze(forbidden),
    max_timeout_ms:maxTimeoutMs,
    default_timeout_ms:defaultTimeoutMs,
    max_output_bytes:maxOutputBytes,
    max_evidence_refs:maxEvidenceRefs,
    max_artifact_refs:maxArtifactRefs,
    require_temporary_workspace:spec.require_temporary_workspace !== false,
  });
}

export function defineRuntimeExecutionAdapter(spec = {}) {
  assertContract(spec && typeof spec === "object" && !Array.isArray(spec), "ADAPTER_INVALID", "execution adapter spec is required");
  const id = clean(spec.id, 64).toLowerCase();
  const version = clean(spec.version, 64);
  assertContract(SLUG.test(id), "ADAPTER_INVALID", "execution adapter id must be a lowercase slug");
  assertContract(version, "ADAPTER_INVALID", "execution adapter version is required");
  const runtime = normalizeRuntimeIdentity(spec.runtime);
  const capabilities = uniqueStrings(spec.capabilities || [], "capabilities", 80);

  for (const capability of capabilities) {
    assertContract(!RUNTIME_EXECUTION_FORBIDDEN_CAPABILITIES.includes(capability), "FORBIDDEN_CAPABILITY", `forbidden execution capability: ${capability}`);
    assertContract(RUNTIME_EXECUTION_CAPABILITIES.includes(capability), "CAPABILITY_INVALID", `unknown execution capability: ${capability}`);
  }

  const sideEffects = normalizeSideEffects(spec.side_effects);
  const processContract = spec.process_contract == null ? null : Object.freeze({
    shell:spec.process_contract.shell === true,
    executable_allowlisted:spec.process_contract.executable_allowlisted === true,
  });
  if (capabilities.includes("bounded_process")) {
    assertContract(processContract?.shell === false, "PROCESS_CONTRACT_INVALID", "bounded_process requires shell:false");
    assertContract(processContract?.executable_allowlisted === true, "PROCESS_CONTRACT_INVALID", "bounded_process requires an allowlisted executable");
  }

  for (const method of ["prepare","executeBoundedTask","normalizeResult","collectEvidence","cleanup"]) {
    assertContract(typeof spec[method] === "function", "ADAPTER_INVALID", `execution adapter ${method}() is required`);
  }

  return Object.freeze({
    api:RUNTIME_EXECUTION_ADAPTER_API,
    id,
    version,
    runtime,
    capabilities,
    side_effects:sideEffects,
    process_contract:processContract,
    prepare:spec.prepare,
    executeBoundedTask:spec.executeBoundedTask,
    normalizeResult:spec.normalizeResult,
    collectEvidence:spec.collectEvidence,
    cleanup:spec.cleanup,
  });
}

export function normalizeRuntimeExecutionTask(input = {}) {
  assertContract(input?.schema === 1, "TASK_INVALID", "execution task schema must be 1");
  const taskId = clean(input.task_id, 160);
  const employeeId = clean(input.employee_id, 40).toLowerCase();
  const objective = clean(input.objective, 4000);
  const riskClass = clean(input.risk_class, 40).toUpperCase();
  assertContract(taskId, "TASK_INVALID", "task_id is required");
  assertContract(/^[a-z][a-z0-9-]{1,39}$/.test(employeeId), "TASK_INVALID", "employee_id is invalid");
  assertContract(objective, "TASK_INVALID", "objective is required");
  assertContract(RISK_CLASSES.has(riskClass), "TASK_INVALID", "risk_class is invalid");

  const requiredCapabilities = uniqueStrings(input.required_capabilities || [], "required_capabilities", 80);
  for (const capability of requiredCapabilities) {
    assertContract(!RUNTIME_EXECUTION_FORBIDDEN_CAPABILITIES.includes(capability), "TASK_CAPABILITY_FORBIDDEN", `task requests forbidden capability: ${capability}`);
    assertContract(RUNTIME_EXECUTION_CAPABILITIES.includes(capability), "TASK_INVALID", `unknown task capability: ${capability}`);
  }

  const requiredSkills = uniqueStrings(input.required_skills || [], "required_skills", 160);
  const prohibitedActions = uniqueStrings(input.prohibited_actions || [], "prohibited_actions", 240);
  assertContract(prohibitedActions.length > 0, "TASK_INVALID", "at least one prohibited action is required");
  const expectedOutput = input.expected_output;
  assertContract(expectedOutput && typeof expectedOutput === "object" && !Array.isArray(expectedOutput), "TASK_INVALID", "expected_output must be an object");

  return Object.freeze({
    schema:1,
    task_id:taskId,
    employee_id:employeeId,
    objective,
    risk_class:riskClass,
    required_capabilities:requiredCapabilities,
    required_skills:requiredSkills,
    prohibited_actions:prohibitedActions,
    expected_output:structuredClone(expectedOutput),
  });
}

function normalizePrepared(value, policy) {
  assertContract(value && typeof value === "object" && !Array.isArray(value), "PREPARE_INVALID", "prepare() must return an object");
  const workspace = value.workspace;
  assertContract(workspace && typeof workspace === "object" && !Array.isArray(workspace), "PREPARE_INVALID", "prepare() must return workspace metadata");
  const kind = clean(workspace.kind, 40).toUpperCase();
  const ref = clean(workspace.ref, 512);
  if (policy.require_temporary_workspace) assertContract(kind === "TEMPORARY", "WORKSPACE_POLICY_VIOLATION", "workspace must be temporary");
  assertContract(ref, "PREPARE_INVALID", "workspace.ref is required");
  assertContract(workspace.isolated === true, "WORKSPACE_POLICY_VIOLATION", "workspace must be isolated");
  assertContract(workspace.production_repo === false, "WORKSPACE_POLICY_VIOLATION", "production repository workspace is forbidden");
  return Object.freeze({
    workspace:Object.freeze({ kind, ref, isolated:true, production_repo:false }),
    session_ref:value.session_ref == null ? null : clean(value.session_ref, 512),
  });
}

function normalizeResult(value, policy) {
  assertContract(value && typeof value === "object" && !Array.isArray(value), "MALFORMED_OUTPUT", "normalizeResult() must return an object");
  assertContract(value.schema === 1, "MALFORMED_OUTPUT", "normalized result schema must be 1");
  const state = clean(value.state, 40).toUpperCase();
  const summary = clean(value.summary, 4000);
  assertContract(RESULT_STATES.has(state), "MALFORMED_OUTPUT", "normalized result state is invalid");
  assertContract(summary, "MALFORMED_OUTPUT", "normalized result summary is required");
  assertContract(value.output && typeof value.output === "object" && !Array.isArray(value.output), "MALFORMED_OUTPUT", "normalized result output must be an object");
  const artifactRefs = uniqueStrings(value.artifact_refs || [], "artifact_refs", 1000);
  const evidenceRefs = uniqueStrings(value.evidence_refs || [], "evidence_refs", 1000);
  assertContract(artifactRefs.length <= policy.max_artifact_refs, "OUTPUT_LIMIT", "artifact reference limit exceeded");
  assertContract(evidenceRefs.length <= policy.max_evidence_refs, "OUTPUT_LIMIT", "evidence reference limit exceeded");
  const normalized = {
    schema:1,
    state,
    summary,
    output:structuredClone(value.output),
    artifact_refs:artifactRefs,
    evidence_refs:evidenceRefs,
  };
  assertContract(byteLength(normalized) <= policy.max_output_bytes, "OUTPUT_LIMIT", "normalized result exceeds output byte limit");
  assertContract(!containsSecretLikeContent(normalized), "SECRET_LIKE_OUTPUT", "secret-like content is prohibited in normalized result");
  return Object.freeze(normalized);
}

function normalizeEvidence(value, adapter, policy) {
  assertContract(value && typeof value === "object" && !Array.isArray(value), "EVIDENCE_INVALID", "collectEvidence() must return an object");
  assertContract(value.schema === 1, "EVIDENCE_INVALID", "execution evidence schema must be 1");
  const rawResultRef = clean(value.raw_result_ref, 1000);
  const normalizedResultRef = clean(value.normalized_result_ref, 1000);
  assertContract(rawResultRef && normalizedResultRef, "EVIDENCE_INCOMPLETE", "raw and normalized result references are required");
  const capabilitiesUsed = uniqueStrings(value.capabilities_used || [], "capabilities_used", 80);
  for (const capability of capabilitiesUsed) {
    assertContract(adapter.capabilities.includes(capability), "UNDECLARED_CAPABILITY_USED", `evidence reports undeclared capability: ${capability}`);
  }

  const workspace = value.workspace_mutation_check;
  assertContract(workspace?.temporary_workspace_only === true, "POLICY_VIOLATION", "execution must stay inside temporary workspace");
  assertContract(workspace?.production_repo_changed === false, "POLICY_VIOLATION", "production repository mutation is forbidden");

  const prohibited = value.prohibited_action_check;
  assertContract(prohibited?.passed === true, "POLICY_VIOLATION", "prohibited action check must pass");

  const runtimeActions = value.runtime_actions;
  assertContract(runtimeActions && typeof runtimeActions === "object" && !Array.isArray(runtimeActions), "EVIDENCE_INCOMPLETE", "runtime_actions evidence is required");
  for (const key of ["install","login","account_mutation","external_write"]) {
    assertContract(runtimeActions[key] === false, "POLICY_VIOLATION", `runtime action ${key} is forbidden`);
  }

  const evidenceRefs = uniqueStrings(value.evidence_refs || [], "evidence_refs", 1000);
  const artifactRefs = uniqueStrings(value.artifact_refs || [], "artifact_refs", 1000);
  assertContract(evidenceRefs.length <= policy.max_evidence_refs, "EVIDENCE_LIMIT", "evidence reference limit exceeded");
  assertContract(artifactRefs.length <= policy.max_artifact_refs, "EVIDENCE_LIMIT", "artifact reference limit exceeded");

  const normalized = {
    schema:1,
    raw_result_ref:rawResultRef,
    normalized_result_ref:normalizedResultRef,
    capabilities_used:capabilitiesUsed,
    workspace_mutation_check:Object.freeze({
      temporary_workspace_only:true,
      production_repo_changed:false,
    }),
    prohibited_action_check:Object.freeze({
      passed:true,
      observed:Array.isArray(prohibited.observed) ? Object.freeze(prohibited.observed.map((item) => clean(item, 240)).filter(Boolean)) : Object.freeze([]),
    }),
    runtime_actions:Object.freeze({
      install:false,
      login:false,
      account_mutation:false,
      external_write:false,
    }),
    evidence_refs:evidenceRefs,
    artifact_refs:artifactRefs,
  };
  assertContract(!containsSecretLikeContent(normalized), "SECRET_LIKE_EVIDENCE", "secret-like content is prohibited in execution evidence");
  return Object.freeze(normalized);
}

async function callWithTimeout(method, args, timeoutMs, phase) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => method({ ...args, signal:controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(contractError("TIMEOUT", `${phase} timed out`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function failureCategory(error) {
  const allowed = new Set([
    "TIMEOUT","TASK_INVALID","TASK_POLICY_VIOLATION","TASK_CAPABILITY_FORBIDDEN","CAPABILITY_NOT_DECLARED",
    "CAPABILITY_NOT_ALLOWED","PREPARE_INVALID","WORKSPACE_POLICY_VIOLATION","RAW_OUTPUT_LIMIT","MALFORMED_OUTPUT",
    "OUTPUT_LIMIT","SECRET_LIKE_OUTPUT","EVIDENCE_INVALID","EVIDENCE_INCOMPLETE","EVIDENCE_LIMIT",
    "UNDECLARED_CAPABILITY_USED","POLICY_VIOLATION","SECRET_LIKE_EVIDENCE",
  ]);
  return allowed.has(error?.code) ? error.code : "ADAPTER_ERROR";
}

function frozenOutcome(value) {
  return Object.freeze({
    ...value,
    runtime:Object.freeze({ ...value.runtime }),
    task:Object.freeze({ ...value.task }),
    cleanup:Object.freeze({ ...value.cleanup }),
  });
}

export async function executeBoundedRuntimeTask(adapter, taskInput, {
  policy:policyInput,
  timeoutMs,
  clock = () => new Date().toISOString(),
} = {}) {
  assertContract(adapter?.api === RUNTIME_EXECUTION_ADAPTER_API, "ADAPTER_INVALID", "unsupported runtime execution adapter");
  const policy = defineRuntimeExecutionPolicy(policyInput);
  const task = normalizeRuntimeExecutionTask(taskInput);
  assertContract(policy.allowed_risk_classes.includes(task.risk_class), "TASK_POLICY_VIOLATION", `risk class ${task.risk_class} is not allowed`);

  for (const capability of adapter.capabilities) {
    assertContract(policy.allowed_capabilities.includes(capability), "CAPABILITY_NOT_ALLOWED", `adapter capability is not allowed by policy: ${capability}`);
  }
  for (const capability of task.required_capabilities) {
    assertContract(adapter.capabilities.includes(capability), "CAPABILITY_NOT_DECLARED", `task requires undeclared capability: ${capability}`);
  }

  const boundedTimeout = timeoutMs == null ? policy.default_timeout_ms : Number(timeoutMs);
  assertContract(Number.isInteger(boundedTimeout) && boundedTimeout >= 1 && boundedTimeout <= policy.max_timeout_ms, "TASK_POLICY_VIOLATION", "timeout exceeds execution policy");

  const limits = Object.freeze({
    timeout_ms:boundedTimeout,
    max_output_bytes:policy.max_output_bytes,
    max_evidence_refs:policy.max_evidence_refs,
    max_artifact_refs:policy.max_artifact_refs,
  });
  const startedAt = clock();
  let prepared = null;
  let normalizedResult = null;
  let evidence = null;
  let state = "FAILED";
  let ok = false;
  let errorCategory = null;
  let cleanup = { attempted:false, ok:false };

  try {
    prepared = normalizePrepared(await callWithTimeout(adapter.prepare, { task, limits }, boundedTimeout, "prepare"), policy);
    const rawResult = await callWithTimeout(adapter.executeBoundedTask, { task, prepared, limits }, boundedTimeout, "execute");
    assertContract(byteLength(rawResult) <= policy.max_output_bytes, "RAW_OUTPUT_LIMIT", "raw runtime result exceeds output byte limit");
    normalizedResult = normalizeResult(
      await callWithTimeout(adapter.normalizeResult, { task, prepared, raw_result:rawResult, limits }, boundedTimeout, "normalize"),
      policy,
    );
    evidence = normalizeEvidence(
      await callWithTimeout(adapter.collectEvidence, { task, prepared, raw_result:rawResult, normalized_result:normalizedResult, limits }, boundedTimeout, "evidence"),
      adapter,
      policy,
    );
    state = normalizedResult.state;
    ok = state === "SUCCEEDED";
    if (!ok) errorCategory = state === "FAILED"
      ? "RUNTIME_REPORTED_FAILURE"
      : state === "PARTIAL" ? "RUNTIME_REPORTED_PARTIAL" : "RUNTIME_REPORTED_BLOCKED";
  } catch (error) {
    state = "FAILED";
    ok = false;
    errorCategory = failureCategory(error);
  } finally {
    cleanup = { attempted:true, ok:false };
    try {
      const result = await callWithTimeout(adapter.cleanup, { task, prepared, limits }, boundedTimeout, "cleanup");
      cleanup = { attempted:true, ok:result?.ok === true };
    } catch {
      cleanup = { attempted:true, ok:false };
    }
    if (!cleanup.ok) {
      state = "FAILED";
      ok = false;
      errorCategory = errorCategory || "CLEANUP_FAILED";
    }
  }

  const finishedAt = clock();
  return frozenOutcome({
    schema:1,
    api:RUNTIME_EXECUTION_ADAPTER_API,
    ok,
    state,
    error_category:errorCategory,
    adapter_id:adapter.id,
    adapter_version:adapter.version,
    runtime:adapter.runtime,
    task:{ task_id:task.task_id, employee_id:task.employee_id, risk_class:task.risk_class },
    normalized_result:normalizedResult,
    evidence,
    cleanup,
    started_at:startedAt,
    finished_at:finishedAt,
  });
}
