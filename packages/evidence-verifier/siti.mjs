import { createHash } from "node:crypto";
import { PORTABLE_WORKFORCE } from "../../lib/workforce.mjs";
import { normalizeTaskNode, transitionTaskNode } from "../task-registry/task-node.mjs";
import { verifyEvidencePacket } from "./index.mjs";

export const SITI_VERIFICATION_API = 1;
export const SITI_REVIEW_KINDS = Object.freeze(["RESEARCH","CODE","EXTERNAL_STATE"]);
export const SITI_REVIEW_STATES = Object.freeze(["PASS","FAIL","INCOMPLETE"]);

const EMPLOYEE_BY_ID = new Map(PORTABLE_WORKFORCE.map((employee) => [employee.id, employee]));
const KIND_SET = new Set(SITI_REVIEW_KINDS);
const CHECK_STATUS_SET = new Set(["PASS","FAIL","NOT_RUN"]);
const EXTERNAL_STATUS_SET = new Set(["MATCH","CONTRADICTED","UNKNOWN"]);
const INCOMPLETE_EVIDENCE_CODES = new Set([
  "SIGNED_EXECUTION_RECEIPT_REQUIRED",
  "SIGNED_EXECUTION_RECEIPT_MISSING_VALID",
  "SIGNED_RECEIPT_REFERENCE_MISSING",
  "WRONG_OR_MISSING_ARTIFACT",
  "PARTIAL_COMPLETION",
  "MISSING_REQUIRED_EVIDENCE",
  "EVIDENCE_TIMESTAMP_MISSING_OR_INVALID",
  "STALE_EVIDENCE",
]);

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const list = (value) => Object.freeze([...new Set((Array.isArray(value) ? value : [])
  .map((item) => clean(item, 1000))
  .filter(Boolean))]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function issue(code, details = []) {
  return Object.freeze({
    code:clean(code,120),
    details:list(details),
  });
}

function isoNow(value) {
  const date = value instanceof Date ? value : new Date(value);
  assert(!Number.isNaN(date.getTime()), "Siti verification now must be a valid date.");
  return date.toISOString();
}

function verificationPolicy(task) {
  const employee = EMPLOYEE_BY_ID.get(task.employee_id);
  assert(employee, "Task employee is not present in the canonical workforce.");
  const policy = employee.verification_policy || {};
  return Object.freeze({
    independent_required:policy.independent_required === true,
    self_verify:policy.self_verify === true,
    reviewer_candidates:list(policy.reviewer_candidates),
  });
}

function independence(task, verifierId) {
  const policy = verificationPolicy(task);
  if (verifierId === task.employee_id) {
    return Object.freeze({ok:false, independent:false, policy, issue:issue("SELF_VERIFICATION",[verifierId])});
  }
  if (!policy.independent_required || policy.self_verify !== false || !policy.reviewer_candidates.includes(verifierId)) {
    return Object.freeze({ok:false, independent:false, policy, issue:issue("UNAUTHORIZED_VERIFIER",[verifierId])});
  }
  return Object.freeze({ok:true, independent:true, policy, issue:null});
}

function researchReview(input = {}) {
  const claims = Array.isArray(input.claims) ? input.claims : [];
  const contradictions = [];
  const unknowns = [];
  const claimChecks = claims.map((raw, index) => {
    const claimId = clean(raw?.claim_id || `claim-${index + 1}`,120);
    const statement = clean(raw?.statement,1000);
    const sourceRef = clean(raw?.source_ref,1000);
    const claimContradictions = [];
    const claimUnknowns = [];

    if (!sourceRef || raw?.source_exists !== true) claimUnknowns.push(issue("SOURCE_MISSING",[claimId,sourceRef].filter(Boolean)));
    if (raw?.source_relevant !== true) claimUnknowns.push(issue("SOURCE_NOT_RELEVANT",[claimId]));
    if (raw?.source_current !== true) claimUnknowns.push(issue("SOURCE_NOT_CURRENT",[claimId]));

    const expectedValue = raw?.expected_value == null ? null : clean(raw.expected_value,1000);
    const observedValue = raw?.observed_value == null ? null : clean(raw.observed_value,1000);
    if (expectedValue == null || observedValue == null || observedValue === "") {
      claimUnknowns.push(issue("VALUE_NOT_OBSERVED",[claimId]));
    } else if (expectedValue !== observedValue) {
      claimContradictions.push(issue("VALUE_MISMATCH",[claimId,expectedValue,observedValue]));
    }

    const expectedUnit = raw?.expected_unit == null ? null : clean(raw.expected_unit,120);
    const observedUnit = raw?.observed_unit == null ? null : clean(raw.observed_unit,120);
    if (expectedUnit) {
      if (!observedUnit) claimUnknowns.push(issue("UNIT_NOT_OBSERVED",[claimId,expectedUnit]));
      else if (expectedUnit !== observedUnit) claimContradictions.push(issue("UNIT_MISMATCH",[claimId,expectedUnit,observedUnit]));
    }

    contradictions.push(...claimContradictions);
    unknowns.push(...claimUnknowns);
    const verdict = claimContradictions.length ? "CONTRADICTED" : claimUnknowns.length ? "NOT_VERIFIED" : "SUPPORTED";
    return Object.freeze({
      claim_id:claimId,
      statement,
      source_ref:sourceRef || null,
      verdict,
      contradictions:Object.freeze(claimContradictions),
      unknowns:Object.freeze(claimUnknowns),
    });
  });

  if (!claimChecks.length) unknowns.push(issue("RESEARCH_CLAIMS_MISSING"));
  return Object.freeze({
    claim_checks:Object.freeze(claimChecks),
    contradictions:Object.freeze(contradictions),
    unknowns:Object.freeze(unknowns),
  });
}

function checkList(kind, entries, contradictions, unknowns) {
  const values = Array.isArray(entries) ? entries : [];
  if (!values.length) {
    unknowns.push(issue(`${kind}_CHECKS_NOT_ATTEMPTED`));
    return Object.freeze([]);
  }
  return Object.freeze(values.map((raw, index) => {
    const id = clean(raw?.id || `${kind.toLowerCase()}-${index + 1}`,120);
    const status = clean(raw?.status,40).toUpperCase();
    const evidenceRefs = list(raw?.evidence_refs);
    if (!CHECK_STATUS_SET.has(status)) {
      unknowns.push(issue(`${kind}_CHECK_STATUS_UNKNOWN`,[id]));
    } else if (status === "FAIL") {
      contradictions.push(issue(`${kind}_CHECK_FAILED`,[id]));
    } else if (status === "NOT_RUN") {
      unknowns.push(issue(`${kind}_CHECK_NOT_RUN`,[id]));
    }
    if (status === "PASS" && !evidenceRefs.length) unknowns.push(issue(`${kind}_CHECK_EVIDENCE_MISSING`,[id]));
    return Object.freeze({id,status:CHECK_STATUS_SET.has(status)?status:"UNKNOWN",evidence_refs:evidenceRefs});
  }));
}

function codeReview(input = {}) {
  const contradictions = [];
  const unknowns = [];
  const changedFiles = list(input.changed_files);
  const inspectedFiles = new Set(list(input.inspected_files));

  if (!changedFiles.length) unknowns.push(issue("CHANGED_FILES_NOT_DECLARED"));
  for (const file of changedFiles) {
    if (!inspectedFiles.has(file)) unknowns.push(issue("CHANGED_FILE_NOT_INSPECTED",[file]));
  }

  const tests = checkList("TEST",input.tests,contradictions,unknowns);
  const regressions = checkList("REGRESSION",input.regression_checks,contradictions,unknowns);
  const negatives = checkList("NEGATIVE",input.negative_checks,contradictions,unknowns);

  const fixClaims = Array.isArray(input.fix_claims) ? input.fix_claims : [];
  if (!fixClaims.length) unknowns.push(issue("FIX_EVIDENCE_NOT_MAPPED"));
  const normalizedFixClaims = Object.freeze(fixClaims.map((raw,index) => {
    const claimId = clean(raw?.claim_id || `fix-${index + 1}`,120);
    const evidenceRefs = list(raw?.evidence_refs);
    if (!evidenceRefs.length) unknowns.push(issue("FIX_EVIDENCE_MISSING",[claimId]));
    return Object.freeze({claim_id:claimId,evidence_refs:evidenceRefs});
  }));
  for (const item of list(input.remaining_unknowns)) unknowns.push(issue("CODE_REMAINING_UNKNOWN",[item]));

  return Object.freeze({
    code_checks:Object.freeze({
      changed_files:changedFiles,
      inspected_files:list(input.inspected_files),
      tests,
      regression_checks:regressions,
      negative_checks:negatives,
      fix_claims:normalizedFixClaims,
    }),
    contradictions:Object.freeze(contradictions),
    unknowns:Object.freeze(unknowns),
  });
}

async function externalStateReview(input = {}, hook, task, checkedAt, verifierId) {
  const targetRef = clean(input.target_ref,1000);
  const expectedState = clean(input.expected_state,1000);
  const contradictions = [];
  const unknowns = [];
  let external = Object.freeze({
    status:"UNKNOWN",
    target_ref:targetRef || null,
    expected_state:expectedState || null,
    observed_state:null,
    evidence_refs:Object.freeze([]),
    checked_at:null,
    read_only:null,
  });

  if (!targetRef || !expectedState) {
    unknowns.push(issue("EXTERNAL_STATE_EXPECTATION_MISSING"));
  } else if (typeof hook !== "function") {
    unknowns.push(issue("EXTERNAL_STATE_CHECK_UNAVAILABLE",[targetRef]));
  } else {
    let observed;
    try {
      const request = Object.freeze({
        task_id:task.task_id,
        mission_id:task.mission_id,
        employee_id:task.employee_id,
        verifier_id:verifierId,
        target_ref:targetRef,
        expected_state:expectedState,
      });
      observed = await hook(request);
    } catch {
      observed = null;
      unknowns.push(issue("EXTERNAL_STATE_CHECK_FAILED",[targetRef]));
    }

    if (observed != null) {
      const status = clean(observed.status,40).toUpperCase();
      const observedState = observed.observed_state == null ? null : clean(observed.observed_state,1000);
      const evidenceRefs = list(observed.evidence_refs);
      const observedAt = observed.checked_at == null ? null : clean(observed.checked_at,80);
      const readOnly = observed.read_only === true;
      external = Object.freeze({
        status:EXTERNAL_STATUS_SET.has(status)?status:"UNKNOWN",
        target_ref:targetRef,
        expected_state:expectedState,
        observed_state:observedState,
        evidence_refs:evidenceRefs,
        checked_at:observedAt,
        read_only:readOnly,
      });

      if (!EXTERNAL_STATUS_SET.has(status)) unknowns.push(issue("EXTERNAL_STATE_STATUS_UNKNOWN",[status || "EMPTY"]));
      if (!readOnly) contradictions.push(issue("EXTERNAL_STATE_NOT_READ_ONLY",[targetRef]));
      if (!observedAt || Number.isNaN(Date.parse(observedAt))) unknowns.push(issue("EXTERNAL_STATE_TIMESTAMP_MISSING",[targetRef]));
      else if (Date.parse(observedAt) > Date.parse(checkedAt) + 60_000) unknowns.push(issue("EXTERNAL_STATE_FROM_FUTURE",[observedAt]));
      if (!evidenceRefs.length) unknowns.push(issue("EXTERNAL_STATE_EVIDENCE_MISSING",[targetRef]));

      if (status === "CONTRADICTED") contradictions.push(issue("EXTERNAL_STATE_CONTRADICTED",[targetRef,expectedState,observedState || "UNKNOWN"]));
      else if (status === "UNKNOWN") unknowns.push(issue("EXTERNAL_STATE_UNKNOWN",[targetRef]));
      else if (status === "MATCH" && observedState !== expectedState) contradictions.push(issue("EXTERNAL_STATE_RESULT_INCONSISTENT",[targetRef,expectedState,observedState || "UNKNOWN"]));
    }
  }

  return Object.freeze({
    external_state:external,
    contradictions:Object.freeze(contradictions),
    unknowns:Object.freeze(unknowns),
  });
}

function evidenceReview(task, verifierId, policy, evidencePacket, now) {
  const packet = evidencePacket && typeof evidencePacket === "object" ? evidencePacket : {};
  const expected = packet.expected && typeof packet.expected === "object" ? packet.expected : {};
  const report = packet.report && typeof packet.report === "object" ? packet.report : {};
  const evidence = packet.evidence && typeof packet.evidence === "object" ? packet.evidence : {};
  return verifyEvidencePacket({
    ...packet,
    expected:{
      ...expected,
      assignee_id:task.employee_id,
      allowed_verifier_ids:[...policy.reviewer_candidates],
      task_id:task.task_id,
    },
    report:{
      ...report,
      claimed_verified:true,
      verifier_id:verifierId,
    },
    evidence,
    now,
  });
}

function classifyEvidenceReasons(result) {
  const contradictions = [];
  const unknowns = [];
  for (const reason of result.reasons || []) {
    const normalized = issue(reason.code,reason.details);
    if (INCOMPLETE_EVIDENCE_CODES.has(reason.code)) unknowns.push(normalized);
    else contradictions.push(normalized);
  }
  return Object.freeze({contradictions:Object.freeze(contradictions),unknowns:Object.freeze(unknowns)});
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key,stableValue(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function verificationCore(input) {
  return Object.freeze({
    api:input.api,
    task_id:input.task_id,
    mission_id:input.mission_id,
    employee_id:input.employee_id,
    verifier_id:input.verifier_id,
    independent:input.independent,
    kind:input.kind,
    checked_at:input.checked_at,
    review_state:input.review_state,
    decision:input.decision,
    evidence_packet_decision:input.evidence_packet_decision,
    claim_checks:input.claim_checks,
    code_checks:input.code_checks,
    external_state:input.external_state,
    contradictions:input.contradictions,
    unknowns:input.unknowns,
  });
}

export function validateSitiVerificationRecord(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Siti verification record must be an object.");
  assert(input.api === SITI_VERIFICATION_API, "Siti verification record API is invalid.");
  assert(clean(input.task_id,160), "Siti verification record task_id is required.");
  assert(clean(input.employee_id,40), "Siti verification record employee_id is required.");
  assert(clean(input.verifier_id,40), "Siti verification record verifier_id is required.");
  assert(typeof input.independent === "boolean", "Siti verification record independent must be boolean.");
  assert(KIND_SET.has(clean(input.kind,40).toUpperCase()), "Siti verification record kind is invalid.");
  const reviewState = clean(input.review_state,40).toUpperCase();
  assert(SITI_REVIEW_STATES.includes(reviewState), "Siti verification record review_state is invalid.");
  const decision = clean(input.decision,40).toUpperCase();
  assert(decision === (reviewState === "PASS" ? "VERIFIED" : "NOT_VERIFIED"), "Siti verification record decision is inconsistent.");
  if (reviewState === "PASS") assert(input.independent === true, "Siti PASS verification must be independent.");
  assert(!Number.isNaN(Date.parse(input.checked_at)), "Siti verification record checked_at is invalid.");
  assert(Array.isArray(input.claim_checks), "Siti verification record claim_checks must be an array.");
  assert(Array.isArray(input.contradictions), "Siti verification record contradictions must be an array.");
  assert(Array.isArray(input.unknowns), "Siti verification record unknowns must be an array.");
  const ref = clean(input.verification_ref,200);
  assert(/^verification:sha256:[a-f0-9]{64}$/.test(ref), "Siti verification ref is invalid.");
  const expectedRef = "verification:sha256:"+digest(verificationCore(input));
  assert(ref === expectedRef, "Siti verification ref does not match record content.");
  return true;
}

export async function runSitiVerification({
  task_node,
  verifier_id = "siti",
  kind,
  evidence_packet = {},
  research = {},
  code = {},
  external_state = {},
  external_state_check = null,
  now = new Date(),
} = {}) {
  const task = normalizeTaskNode(task_node);
  assert(task.state === "SUCCEEDED", "Siti verification requires a SUCCEEDED TaskNode.");
  const verifierId = clean(verifier_id,40).toLowerCase();
  assert(verifierId, "Verifier id is required.");
  const normalizedKind = clean(kind,40).toUpperCase();
  assert(KIND_SET.has(normalizedKind), "Siti verification kind is invalid.");
  const checkedAt = isoNow(now);

  const independent = independence(task,verifierId);
  const evidenceResult = evidenceReview(task,verifierId,independent.policy,evidence_packet,now);
  const evidenceIssues = classifyEvidenceReasons(evidenceResult);

  let domain = Object.freeze({claim_checks:Object.freeze([]),contradictions:Object.freeze([]),unknowns:Object.freeze([])});
  let codeChecks = null;
  let externalResult = null;
  if (normalizedKind === "RESEARCH") {
    domain = researchReview(research);
  } else if (normalizedKind === "CODE") {
    const reviewed = codeReview(code);
    codeChecks = reviewed.code_checks;
    domain = reviewed;
  } else {
    const reviewed = await externalStateReview(external_state,external_state_check,task,checkedAt,verifierId);
    externalResult = reviewed.external_state;
    domain = reviewed;
  }

  const contradictions = [
    ...(independent.issue ? [independent.issue] : []),
    ...evidenceIssues.contradictions,
    ...domain.contradictions,
  ];
  const unknowns = [
    ...evidenceIssues.unknowns,
    ...domain.unknowns,
  ];

  const reviewState = contradictions.length ? "FAIL" : unknowns.length ? "INCOMPLETE" : "PASS";
  const baseRecord = Object.freeze({
    api:SITI_VERIFICATION_API,
    task_id:task.task_id,
    mission_id:task.mission_id,
    employee_id:task.employee_id,
    verifier_id:verifierId,
    independent:independent.independent,
    kind:normalizedKind,
    checked_at:checkedAt,
    review_state:reviewState,
    decision:reviewState === "PASS" ? "VERIFIED" : "NOT_VERIFIED",
    evidence_packet_decision:evidenceResult.decision,
    claim_checks:Object.freeze([...(domain.claim_checks || [])]),
    code_checks:codeChecks,
    external_state:externalResult,
    contradictions:Object.freeze(contradictions),
    unknowns:Object.freeze(unknowns),
  });
  const verificationRef = `verification:sha256:${digest(baseRecord)}`;

  let resultingTask = task;
  if (reviewState === "PASS") {
    resultingTask = transitionTaskNode(task,"VERIFIED",{
      verifier_id:verifierId,
      evidence_refs:[verificationRef],
      clock:() => checkedAt,
    });
  }

  return Object.freeze({
    ...baseRecord,
    verification_ref:verificationRef,
    task_node:resultingTask,
  });
}
