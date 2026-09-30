const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/,
  /\b(?:password|passwd|api[_ -]?key|secret|token)\s*[:=]\s*\S+/i,
];

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;

function containsSecretLike(value) {
  const text = String(value ?? "");
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateRealTaskDataset({ dataset, policy, employeeIds = [] }) {
  const errors = [];
  if (dataset?.schema !== 1) errors.push("dataset schema must be 1");
  if (!policy?.statuses?.includes(dataset?.status)) errors.push("invalid dataset status");
  if (!["UNPROVEN","COLLECTING","EVALUATED_BASELINE","PUBLISHED_BASELINE"].includes(dataset?.claim_state)) {
    errors.push("invalid claim_state");
  }
  if (!Array.isArray(dataset?.cases)) errors.push("cases must be an array");
  const cases = Array.isArray(dataset?.cases) ? dataset.cases : [];
  const ids = new Set();
  const sourceRefs = new Set();

  for (const item of cases) {
    if (!nonEmpty(item?.case_id)) {
      errors.push("case_id required");
      continue;
    }
    if (ids.has(item.case_id)) errors.push(`duplicate case_id ${item.case_id}`);
    ids.add(item.case_id);

    if (!policy.allowed_source_types.includes(item.source_type)) {
      errors.push(`${item.case_id}: source_type is not eligible for real-task baseline`);
    }
    if (policy.forbidden_source_types.includes(item.source_type)) {
      errors.push(`${item.case_id}: synthetic/demo source type forbidden`);
    }
    if (!nonEmpty(item.source_ref)) errors.push(`${item.case_id}: source_ref required`);
    else {
      if (sourceRefs.has(item.source_ref)) errors.push(`${item.case_id}: duplicate source_ref ${item.source_ref}`);
      sourceRefs.add(item.source_ref);
      if (containsSecretLike(item.source_ref)) errors.push(`${item.case_id}: source_ref contains secret-like material`);
    }
    if (item.source_generated !== false) errors.push(`${item.case_id}: source_generated must be false for real-task baseline`);
    if (!nonEmpty(item.employee_id) || (employeeIds.length && !employeeIds.includes(item.employee_id))) {
      errors.push(`${item.case_id}: unknown employee_id`);
    }
    if (!nonEmpty(item.task_summary) || containsSecretLike(item.task_summary)) {
      errors.push(`${item.case_id}: task_summary missing or contains secret-like material`);
    }
    if (!Array.isArray(item.evidence_refs) || item.evidence_refs.length < 1 || item.evidence_refs.some((ref) => !nonEmpty(ref))) {
      errors.push(`${item.case_id}: evidence_refs required`);
    }
    if (!item.metrics || typeof item.metrics !== "object" || Array.isArray(item.metrics)) {
      errors.push(`${item.case_id}: metrics required`);
    } else {
      for (const metric of policy.required_metrics) {
        if (!(metric in item.metrics)) errors.push(`${item.case_id}: missing metric ${metric}`);
      }
      const booleanMetrics = ["success","evidence_complete","false_success","cost_known","verification_passed","recovered_after_failure"];
      for (const metric of booleanMetrics) {
        if (typeof item.metrics[metric] !== "boolean") errors.push(`${item.case_id}: ${metric} must be boolean`);
      }
      for (const metric of ["human_intervention","retries","duration_ms"]) {
        if (!nonNegativeInteger(item.metrics[metric])) errors.push(`${item.case_id}: ${metric} must be a non-negative integer`);
      }
      if (item.metrics.verification_passed === true && item.metrics.evidence_complete !== true) {
        errors.push(`${item.case_id}: verification_passed requires evidence_complete`);
      }
      if (item.metrics.false_success === true && item.metrics.success !== true) {
        errors.push(`${item.case_id}: false_success requires an earlier success claim`);
      }
      if (item.metrics.false_success === true && item.metrics.verification_passed === true) {
        errors.push(`${item.case_id}: false_success cannot also be verification_passed`);
      }
    }
    if (item.redaction_reviewed !== true) errors.push(`${item.case_id}: redaction_reviewed must be true`);
    if (!nonEmpty(item.started_at) || Number.isNaN(Date.parse(item.started_at))) errors.push(`${item.case_id}: invalid started_at`);
    if (!nonEmpty(item.finished_at) || Number.isNaN(Date.parse(item.finished_at))) errors.push(`${item.case_id}: invalid finished_at`);
    if (
      nonEmpty(item.started_at) && nonEmpty(item.finished_at) &&
      !Number.isNaN(Date.parse(item.started_at)) && !Number.isNaN(Date.parse(item.finished_at)) &&
      Date.parse(item.finished_at) < Date.parse(item.started_at)
    ) errors.push(`${item.case_id}: finished_at precedes started_at`);
  }

  const publishLike = ["READY_FOR_REPORT","PUBLISHED"].includes(dataset?.status);
  const enough = cases.length >= policy.publication_gate.minimum_cases;
  const falseSuccesses = cases.filter((item) => item?.metrics?.false_success === true).length;
  const evidenceComplete = cases.every((item) => item?.metrics?.evidence_complete === true);
  const uniqueSources = sourceRefs.size === cases.length;
  const directSourcesOk = cases.every((item) => nonEmpty(item?.source_ref) && item?.source_generated === false);
  const environmentOk = dataset?.environment && typeof dataset.environment === "object" && !Array.isArray(dataset.environment);
  const acceptancePassed =
    enough &&
    falseSuccesses <= policy.publication_gate.false_successes_max &&
    evidenceComplete &&
    Boolean(environmentOk) &&
    cases.every((item) => item.redaction_reviewed === true) &&
    (!policy.publication_gate.require_direct_non_generated_source || directSourcesOk) &&
    uniqueSources;

  if (publishLike && !acceptancePassed) {
    errors.push("dataset cannot be READY_FOR_REPORT/PUBLISHED before publication gate passes");
  }

  const expectedClaims = dataset?.status === "PUBLISHED"
    ? ["PUBLISHED_BASELINE"]
    : dataset?.status === "READY_FOR_REPORT"
      ? ["EVALUATED_BASELINE"]
      : dataset?.status === "COLLECTING"
        ? ["COLLECTING"]
        : ["UNPROVEN"];
  if (!expectedClaims.includes(dataset?.claim_state)) {
    errors.push(`claim_state ${dataset?.claim_state} does not match status ${dataset?.status}`);
  }

  if (dataset?.summary?.acceptance_passed !== undefined && dataset.summary.acceptance_passed !== acceptancePassed) {
    errors.push("summary.acceptance_passed disagrees with computed gate");
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    cases: cases.length,
    false_successes: falseSuccesses,
    generated_or_unbound_sources: cases.filter((item) => !nonEmpty(item?.source_ref) || item?.source_generated !== false).length,
    acceptance_passed: acceptancePassed,
    unique_sources: uniqueSources,
  });
}
