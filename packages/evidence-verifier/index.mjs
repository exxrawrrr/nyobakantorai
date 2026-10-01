import { verifyExecutionReceipt } from "../execution-receipt/index.mjs";

const INJECTION_PATTERNS = [
  /ignore (?:all|any|the) previous instructions/i,
  /bypass (?:approval|policy|verification|guard)/i,
  /mark (?:this|the task|it) (?:as )?verified/i,
  /system prompt/i,
  /developer message/i,
  /pretend (?:the )?(?:evidence|task|action).*(?:is|was) (?:valid|complete|done)/i,
];

const ALLOWED_EVIDENCE_SCHEMES = new Set(["receipt:", "file:", "https:", "http:", "artifact:", "test:", "approval:", "runtime:"]);
const asList = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item).trim()).filter(Boolean);
const uniq = (values) => [...new Set(values)];
const normalizeRef = (value) => String(value ?? "").trim();

function evidenceScheme(value) {
  const match = normalizeRef(value).match(/^([a-z][a-z0-9+.-]*:)/i);
  return match ? match[1].toLowerCase() : null;
}

const includesExact = (haystack, needle) => String(haystack ?? "").includes(String(needle));

export function detectPromptInjection(value) {
  const text = String(value ?? "");
  return INJECTION_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

export function verifyEvidencePacket({ expected = {}, report = {}, evidence = {}, now = new Date(), maxAgeMs = 15 * 60 * 1000 } = {}) {
  const reasons = [];
  const reportText = String(report.text ?? "");
  const evidenceText = String(evidence.observed_text ?? "");
  const evidenceRefs = uniq(asList(evidence.refs));
  const artifacts = uniq(asList(evidence.artifacts));
  const completion = new Set(asList(evidence.completion_items));
  const requiredFacts = uniq(asList(expected.required_facts));
  const requiredArtifacts = uniq(asList(expected.required_artifacts));
  const requiredCompletion = uniq(asList(expected.required_completion_items));
  const requiredEvidenceRefs = uniq(asList(expected.required_evidence_refs));
  const allowedSchemes = new Set(asList(expected.allowed_evidence_schemes).map((value) => value.endsWith(":") ? value.toLowerCase() : value.toLowerCase() + ":"));
  const effectiveAllowedSchemes = allowedSchemes.size ? allowedSchemes : ALLOWED_EVIDENCE_SCHEMES;

  const signedReceipts = Array.isArray(evidence.signed_receipts) ? evidence.signed_receipts : [];
  const receiptPublicKeys = expected.receipt_public_keys && typeof expected.receipt_public_keys === "object" && !Array.isArray(expected.receipt_public_keys)
    ? expected.receipt_public_keys
    : {};
  const receiptTrustRegistry = expected.receipt_trust_registry && typeof expected.receipt_trust_registry === "object" && !Array.isArray(expected.receipt_trust_registry)
    ? expected.receipt_trust_registry
    : null;
  const requiredReceiptStates = asList(expected.required_receipt_result_states);
  const receiptMaxAgeMs = Object.prototype.hasOwnProperty.call(expected, "max_execution_receipt_age_ms")
    ? expected.max_execution_receipt_age_ms
    : maxAgeMs;
  const consumedReceiptRefs = new Set(asList(expected.consumed_receipt_refs));
  const allowedReceiptRuntimeProviders = asList(expected.allowed_receipt_runtime_providers);
  const allowedReceiptRuntimeRefPrefixes = asList(expected.allowed_receipt_runtime_ref_prefixes);
  const signedReceiptChecks = signedReceipts.map((envelope) => {
    const check = verifyExecutionReceipt(envelope, {
      publicKeys:receiptPublicKeys,
      trustRegistry:receiptTrustRegistry,
      now,
      maxReceiptAgeMs:receiptMaxAgeMs,
      consumedReceiptRefs,
      allowedRuntimeProviders:allowedReceiptRuntimeProviders,
      allowedRuntimeRefPrefixes:allowedReceiptRuntimeRefPrefixes,
      requiredTaskId:normalizeRef(expected.task_id) || null,
      requiredEmployeeId:normalizeRef(expected.assignee_id).toLowerCase() || null,
      requiredCapabilityId:Object.prototype.hasOwnProperty.call(expected, "capability_id") ? expected.capability_id : undefined,
      requiredResultStates:requiredReceiptStates.length ? requiredReceiptStates : null,
    });
    if (check.receipt_ref) consumedReceiptRefs.add(check.receipt_ref);
    return check;
  });
  const validSignedReceiptRefs = signedReceiptChecks.filter((item) => item.ok).map((item) => item.receipt_ref).filter(Boolean);
  const invalidSignedReceiptChecks = signedReceiptChecks.filter((item) => !item.ok);

  if (expected.require_signed_execution_receipt === true && signedReceipts.length === 0) {
    reasons.push({ code:"SIGNED_EXECUTION_RECEIPT_REQUIRED", details:[] });
  }
  if (invalidSignedReceiptChecks.length) {
    reasons.push({
      code:"SIGNED_EXECUTION_RECEIPT_INVALID",
      details:invalidSignedReceiptChecks.flatMap((item) => [
        item.receipt_ref || item.key_id || "unknown-receipt",
        ...item.reasons,
      ]),
    });
  }
  if (expected.require_signed_execution_receipt === true && validSignedReceiptRefs.length === 0 && signedReceipts.length > 0) {
    reasons.push({ code:"SIGNED_EXECUTION_RECEIPT_MISSING_VALID", details:[] });
  }
  if (expected.require_signed_execution_receipt === true) {
    const missingSignedRefs = validSignedReceiptRefs.filter((ref) => !evidenceRefs.includes(ref));
    if (missingSignedRefs.length) reasons.push({ code:"SIGNED_RECEIPT_REFERENCE_MISSING", details:missingSignedRefs });
  }

  const missingReportFacts = requiredFacts.filter((fact) => !includesExact(reportText, fact));
  const missingEvidenceFacts = requiredFacts.filter((fact) => !includesExact(evidenceText, fact));
  if (missingReportFacts.length) reasons.push({ code: "REPORT_FACT_MISMATCH", details: missingReportFacts });
  if (missingEvidenceFacts.length) reasons.push({ code: "EVIDENCE_FACT_MISMATCH", details: missingEvidenceFacts });

  const missingArtifacts = requiredArtifacts.filter((artifact) => !artifacts.includes(artifact));
  if (missingArtifacts.length) reasons.push({ code: "WRONG_OR_MISSING_ARTIFACT", details: missingArtifacts });

  const missingCompletion = requiredCompletion.filter((item) => !completion.has(item));
  if (missingCompletion.length) reasons.push({ code: "PARTIAL_COMPLETION", details: missingCompletion });

  const missingRefs = requiredEvidenceRefs.filter((ref) => !evidenceRefs.includes(ref));
  if (missingRefs.length) reasons.push({ code: "MISSING_REQUIRED_EVIDENCE", details: missingRefs });

  const invalidRefs = evidenceRefs.filter((ref) => {
    const scheme = evidenceScheme(ref);
    return !scheme || !effectiveAllowedSchemes.has(scheme);
  });
  if (invalidRefs.length) reasons.push({ code: "UNTRUSTED_EVIDENCE_REFERENCE", details: invalidRefs });

  const checkedAt = evidence.checked_at ? new Date(evidence.checked_at) : null;
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!checkedAt || Number.isNaN(checkedAt.getTime())) reasons.push({ code: "EVIDENCE_TIMESTAMP_MISSING_OR_INVALID", details: [] });
  else if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) reasons.push({ code: "INVALID_FRESHNESS_POLICY", details: [] });
  else if (nowDate.getTime() - checkedAt.getTime() > maxAgeMs) reasons.push({ code: "STALE_EVIDENCE", details: [evidence.checked_at] });
  else if (checkedAt.getTime() - nowDate.getTime() > 60_000) reasons.push({ code: "EVIDENCE_FROM_FUTURE", details: [evidence.checked_at] });

  const injection = uniq([...detectPromptInjection(reportText), ...detectPromptInjection(evidenceText), ...evidenceRefs.flatMap(detectPromptInjection)]);
  if (injection.length) reasons.push({ code: "PROMPT_INJECTION_SIGNAL", details: injection });

  if (report.claimed_verified === true) {
    const verifierId = normalizeRef(report.verifier_id).toLowerCase();
    const assigneeId = normalizeRef(expected.assignee_id).toLowerCase();
    const allowedVerifierIds = uniq(asList(expected.allowed_verifier_ids).map((value) => value.toLowerCase()));

    if (!assigneeId || !allowedVerifierIds.length) {
      reasons.push({ code: "VERIFIER_POLICY_MISSING", details: [] });
    } else if (verifierId === assigneeId) {
      reasons.push({ code: "SELF_VERIFICATION", details: [verifierId] });
    } else if (!allowedVerifierIds.includes(verifierId)) {
      reasons.push({ code: "UNAUTHORIZED_VERIFIER", details: [verifierId] });
    }
  }
  if (report.claimed_executed === true && report.authorization?.allowed !== true) reasons.push({ code: "UNAUTHORIZED_ACTION_CLAIM", details: [String(report.authorization?.reason ?? "missing authorization")] });

  return Object.freeze({
    ok: reasons.length === 0,
    decision: reasons.length === 0 ? "VERIFIED" : "REJECTED",
    reasons: Object.freeze(reasons.map((item) => Object.freeze({ ...item, details: Object.freeze([...item.details]) }))),
    metrics: Object.freeze({
      required_fact_recall: requiredFacts.length ? (requiredFacts.length - missingReportFacts.length) / requiredFacts.length : 1,
      evidence_fact_recall: requiredFacts.length ? (requiredFacts.length - missingEvidenceFacts.length) / requiredFacts.length : 1,
      artifact_recall: requiredArtifacts.length ? (requiredArtifacts.length - missingArtifacts.length) / requiredArtifacts.length : 1,
      completion_recall: requiredCompletion.length ? (requiredCompletion.length - missingCompletion.length) / requiredCompletion.length : 1,
      signed_receipts_valid: validSignedReceiptRefs.length,
      signed_receipts_invalid: invalidSignedReceiptChecks.length,
    }),
  });
}
