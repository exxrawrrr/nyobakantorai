const VALID_COMPLETED_ENV_FIELDS = ["os","runtime","provider_version","started_at","finished_at"];

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

function unique(values) {
  return [...new Set(values)];
}

function assertDate(value, label, errors) {
  if (!nonEmpty(value) || Number.isNaN(Date.parse(value))) errors.push(`${label} must be a valid timestamp`);
}

function validateIdentity(record, expected, sourceById, integrationIds, errors) {
  if (record.provider_id !== expected.provider_id) errors.push(`${expected.provider_id}: provider_id drift`);
  if (record.integration_id !== expected.integration_id) errors.push(`${expected.provider_id}: integration_id drift`);
  if (record.source_id !== expected.source_id) errors.push(`${expected.provider_id}: source_id drift`);
  if (!integrationIds.has(record.integration_id)) errors.push(`${expected.provider_id}: unknown integration_id`);
  const source = sourceById.get(expected.source_id);
  if (!source) errors.push(`${expected.provider_id}: unknown source_id`);
  else if (record.source_commit !== source.commit) errors.push(`${expected.provider_id}: source_commit drift`);
}

function validateEnvironment(record, errors) {
  if (!record.environment || typeof record.environment !== "object" || Array.isArray(record.environment)) {
    errors.push(`${record.provider_id}: COMPLETED/PARTIAL evaluation requires environment`);
    return;
  }
  for (const field of VALID_COMPLETED_ENV_FIELDS) {
    if (!nonEmpty(record.environment[field])) errors.push(`${record.provider_id}: environment.${field} required`);
  }
  assertDate(record.environment.started_at, `${record.provider_id}: environment.started_at`, errors);
  assertDate(record.environment.finished_at, `${record.provider_id}: environment.finished_at`, errors);
  if (
    nonEmpty(record.environment.started_at) &&
    nonEmpty(record.environment.finished_at) &&
    !Number.isNaN(Date.parse(record.environment.started_at)) &&
    !Number.isNaN(Date.parse(record.environment.finished_at)) &&
    Date.parse(record.environment.finished_at) < Date.parse(record.environment.started_at)
  ) errors.push(`${record.provider_id}: environment.finished_at precedes started_at`);
}

function validateCases(record, contract, errors) {
  if (!Array.isArray(record.cases)) {
    errors.push(`${record.provider_id}: cases must be an array`);
    return new Map();
  }
  const byId = new Map();
  for (const item of record.cases) {
    if (!nonEmpty(item?.case_id)) {
      errors.push(`${record.provider_id}: case_id required`);
      continue;
    }
    if (byId.has(item.case_id)) errors.push(`${record.provider_id}: duplicate case_id ${item.case_id}`);
    byId.set(item.case_id, item);
    if (!Array.isArray(item.evidence_refs) || item.evidence_refs.length < 1 || item.evidence_refs.some((ref) => !nonEmpty(ref))) {
      errors.push(`${record.provider_id}/${item.case_id}: evidence_refs required`);
    }
    if (!item.metrics || typeof item.metrics !== "object" || Array.isArray(item.metrics)) {
      errors.push(`${record.provider_id}/${item.case_id}: metrics required`);
      continue;
    }
    for (const metric of contract.required_metrics) {
      if (!(metric in item.metrics)) errors.push(`${record.provider_id}/${item.case_id}: missing metric ${metric}`);
    }
  }
  return byId;
}

function browserAcceptance(record, contract, byId) {
  const required = contract.required_case_ids;
  const cases = required.map((id) => byId.get(id)).filter(Boolean);
  if (cases.length !== required.length) return false;
  const falseSuccesses = cases.filter((item) => item.metrics.false_success === true).length;
  const evidenceCompleteRate = cases.filter((item) => item.metrics.evidence_complete === true).length / cases.length;
  const auth = byId.get("auth-isolation");
  const write = byId.get("write-guard");
  const timeout = byId.get("timeout-recovery");
  const partial = byId.get("partial-result-recovery");
  return (
    falseSuccesses === contract.acceptance.false_successes &&
    evidenceCompleteRate >= contract.acceptance.evidence_complete_rate_min &&
    auth?.metrics.success === true &&
    auth?.metrics.recovered_truthfully === true &&
    write?.metrics.success === true &&
    write?.metrics.recovered_truthfully === true &&
    timeout?.metrics.success === true &&
    timeout?.metrics.recovered_truthfully === true &&
    partial?.metrics.success === true &&
    partial?.metrics.recovered_truthfully === true
  );
}

function memoryAcceptance(record, contract, byId) {
  const required = contract.required_case_ids;
  const cases = required.map((id) => byId.get(id)).filter(Boolean);
  if (cases.length !== required.length) return false;
  const falseSuccesses = cases.filter((item) => item.metrics.false_success === true).length;
  const leaks = cases.filter((item) => item.metrics.cross_profile_leak === true).length;
  const secret = byId.get("secret-rejection");
  const deletion = byId.get("delete");
  const exported = byId.get("export");
  const provenance = byId.get("provenance");
  return (
    falseSuccesses === contract.acceptance.false_successes &&
    leaks === contract.acceptance.cross_profile_leaks &&
    secret?.metrics.success === true &&
    secret?.metrics.cross_profile_leak === false &&
    secret?.metrics.secret_persistence === false &&
    deletion?.metrics.delete_verified === true &&
    exported?.metrics.export_verified === true &&
    provenance?.metrics.provenance_verified === true
  );
}

function expectedClaim({ status, acceptancePassed }) {
  if (status === "NOT_RUN" || status === "PARTIAL") return ["UNPROVEN"];
  if (status === "INVALID") return ["REJECTED"];
  if (status === "COMPLETED" && acceptancePassed) return ["EVALUATED_CANDIDATE"];
  return ["EVALUATED_NOT_APPROVED","REJECTED"];
}

export function validateProviderEvaluationSet({ domain, result, contracts, sources, integrations }) {
  const errors = [];
  if (!contracts?.[domain]) return { ok:false, errors:[`Unknown evaluation domain: ${domain}`], evaluated:[] };
  const contract = contracts[domain];
  const sourceById = new Map((sources?.sources || []).map((item) => [item.id, item]));
  const integrationIds = new Set((integrations?.integrations || []).map((item) => item.id));
  const records = Array.isArray(result?.providers) ? result.providers : [];
  if (result?.schema !== 1) errors.push("result schema must be 1");

  const expectedIds = contract.providers.map((item) => item.provider_id);
  const actualIds = records.map((item) => item.provider_id);
  if (unique(actualIds).length !== actualIds.length) errors.push("duplicate provider records");
  for (const id of expectedIds) if (!actualIds.includes(id)) errors.push(`missing provider record: ${id}`);
  for (const id of actualIds) if (!expectedIds.includes(id)) errors.push(`unexpected provider record: ${id}`);

  const evaluated = [];
  for (const expected of contract.providers) {
    const record = records.find((item) => item.provider_id === expected.provider_id);
    if (!record) continue;
    validateIdentity(record, expected, sourceById, integrationIds, errors);

    if (!contracts.common_statuses.includes(record.status)) errors.push(`${record.provider_id}: invalid status`);
    if (!contracts.claim_states.includes(record.claim_state)) errors.push(`${record.provider_id}: invalid claim_state`);

    if (record.status === "NOT_RUN") {
      if (record.environment !== null) errors.push(`${record.provider_id}: NOT_RUN environment must be null`);
      if (!Array.isArray(record.cases) || record.cases.length !== 0) errors.push(`${record.provider_id}: NOT_RUN cases must be empty`);
      if (record.claim_state !== "UNPROVEN") errors.push(`${record.provider_id}: NOT_RUN must be UNPROVEN`);
      evaluated.push({ provider_id:record.provider_id, status:record.status, acceptance_passed:false });
      continue;
    }

    validateEnvironment(record, errors);
    const byId = validateCases(record, contract, errors);
    if (record.status === "COMPLETED") {
      for (const caseId of contract.required_case_ids) {
        if (!byId.has(caseId)) errors.push(`${record.provider_id}: COMPLETED missing required case ${caseId}`);
      }
    }

    const acceptancePassed = domain === "browser"
      ? browserAcceptance(record, contract, byId)
      : memoryAcceptance(record, contract, byId);

    const allowedClaims = expectedClaim({ status:record.status, acceptancePassed });
    if (!allowedClaims.includes(record.claim_state)) {
      errors.push(`${record.provider_id}: claim_state ${record.claim_state} does not match status/evidence; allowed: ${allowedClaims.join(", ")}`);
    }
    if (record.summary?.acceptance_passed !== undefined && record.summary.acceptance_passed !== acceptancePassed) {
      errors.push(`${record.provider_id}: summary.acceptance_passed disagrees with computed gate`);
    }
    evaluated.push({ provider_id:record.provider_id, status:record.status, acceptance_passed:acceptancePassed });
  }

  return Object.freeze({ ok:errors.length === 0, errors:Object.freeze(errors), evaluated:Object.freeze(evaluated) });
}
