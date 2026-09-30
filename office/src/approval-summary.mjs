const TRUSTED_APPROVAL_SOURCES = Object.freeze([
  "REGISTRY",
  "POLICY_ENGINE",
  "VERIFIER",
  "RUNTIME_ADAPTER",
  "HUMAN_REVIEW",
]);
const TRUSTED_SOURCE_SET = new Set(TRUSTED_APPROVAL_SOURCES);
const HIGH_IMPACT_RISKS = new Set(["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const freezeList = (items) => Object.freeze(items.map((item) => Object.freeze(item)));

function normalizeEntry(entry, ignored, { allowStatus = false } = {}) {
  if (!entry || typeof entry !== "object" || !TRUSTED_SOURCE_SET.has(entry.source)) {
    ignored.count += 1;
    return null;
  }
  const code = clean(entry.code || entry.id || "STRUCTURED_SIGNAL", 100).toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  const label = clean(entry.label || entry.detail || entry.resource || code, 300);
  if (!label) {
    ignored.count += 1;
    return null;
  }
  const normalized = {
    code,
    label,
    source: entry.source,
    evidence_ref: clean(entry.evidence_ref, 500),
    resource: clean(entry.resource, 300),
  };
  if (allowStatus) {
    const status = clean(entry.status, 20).toUpperCase();
    if (!["PASS","FAIL"].includes(status)) {
      ignored.count += 1;
      return null;
    }
    normalized.status = status;
  }
  return normalized;
}

function normalizeList(value, ignored, options) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeEntry(entry, ignored, options)).filter(Boolean);
}

function normalizeScalarSignal(value, ignored) {
  if (!value) return null;
  const normalized = normalizeEntry(value, ignored);
  return normalized ? Object.freeze(normalized) : null;
}

export function deriveRegistryApprovalSignals(task, events = []) {
  const checks = [
    { code:"RISK_CLASS_RECOGNIZED", label:"Risk class is present in registry state", status:"PASS", source:"REGISTRY" },
    { code:"APPROVAL_GATE_STATE", label:task.approval_required ? "Owner approval gate is active" : "Owner approval gate is not required", status:"PASS", source:"REGISTRY" },
  ];
  const anomalies = [];
  const failedChecks = [];
  const missingEvidence = [];
  const attachments = Array.isArray(task.attachments) ? task.attachments : [];
  const evidenceRefs = Array.isArray(task.evidence_refs) ? task.evidence_refs : [];

  if (task.quarantined) {
    const detail = clean(task.reconcile_reason || "UNCONFIRMED_RUNTIME_CLAIM", 240);
    anomalies.push({ code:"RUNTIME_CLAIM_QUARANTINED", label:"Runtime claim quarantined: " + detail, source:"REGISTRY", evidence_ref:clean(task.runtime_ref,500) });
    failedChecks.push({ code:"RUNTIME_RECONCILIATION", label:"Runtime reconciliation did not establish authoritative provenance", source:"REGISTRY", evidence_ref:clean(task.runtime_ref,500) });
    checks.push({ code:"RUNTIME_RECONCILIATION", label:"Runtime reconciliation", status:"FAIL", source:"REGISTRY" });
  } else if (task.execution_mode === "RUNTIME") {
    checks.push({ code:"RUNTIME_RECONCILIATION", label:"Runtime claim is not quarantined", status:"PASS", source:"REGISTRY" });
  }

  if (task.lifecycle_status === "VERIFIED" && evidenceRefs.length === 0) {
    missingEvidence.push({ code:"VERIFICATION_EVIDENCE_MISSING", label:"VERIFIED state has no registry evidence reference", source:"REGISTRY" });
    checks.push({ code:"VERIFICATION_EVIDENCE", label:"Verification evidence reference", status:"FAIL", source:"REGISTRY" });
  } else if (task.lifecycle_status === "VERIFIED") {
    checks.push({ code:"VERIFICATION_EVIDENCE", label:"Verification evidence reference exists", status:"PASS", source:"REGISTRY", evidence_ref:evidenceRefs[0] });
  }

  const approvalEvents = (Array.isArray(events) ? events : []).filter((event) => event?.task_id === task.id && event?.action === "APPROVAL_RECORDED");
  if (task.approval_status === "APPROVED" && approvalEvents.length === 0) {
    missingEvidence.push({ code:"APPROVAL_EVENT_MISSING", label:"APPROVED state has no append-only approval event", source:"REGISTRY" });
    checks.push({ code:"APPROVAL_EVENT", label:"Append-only approval event", status:"FAIL", source:"REGISTRY" });
  } else if (task.approval_status === "APPROVED") {
    checks.push({ code:"APPROVAL_EVENT", label:"Append-only approval event exists", status:"PASS", source:"REGISTRY", evidence_ref:clean(task.approval_evidence_ref,500) });
  }

  return Object.freeze({
    requested_action: { code:"REQUESTED_ACTION", label:clean(task.title || "Untitled task", 300), source:"REGISTRY" },
    material_changes: attachments.map((item, index) => ({
      code:"ATTACHMENT_METADATA_" + (index + 1),
      label:"Attachment/resource metadata: " + clean(item?.name || "unnamed", 240),
      resource:clean(item?.name || "", 240),
      source:"REGISTRY",
    })),
    changed_resources: attachments.map((item, index) => ({
      code:"CHANGED_RESOURCE_" + (index + 1),
      label:clean(item?.name || "unnamed resource", 240),
      resource:clean(item?.name || "", 240),
      source:"REGISTRY",
    })),
    capabilities_used: [],
    capability_escalations: [],
    policy_violations: [],
    failed_checks: failedChecks,
    missing_evidence: missingEvidence,
    anomalies,
    unusual_output: [],
    checks,
    verification_state: {
      code:"VERIFICATION_STATE",
      label:clean(task.lifecycle_status || "UNKNOWN", 60),
      source:"REGISTRY",
      evidence_ref:evidenceRefs[0] || "",
    },
    confidence: null,
  });
}

export function buildApprovalSummary(task, { signals = deriveRegistryApprovalSignals(task) } = {}) {
  if (!task || typeof task !== "object") throw new Error("approval summary requires a task object");
  const ignored = { count:0 };
  const requestedAction = normalizeScalarSignal(signals?.requested_action, ignored)
    || Object.freeze({ code:"REQUESTED_ACTION", label:clean(task.title || "Untitled task",300), source:"REGISTRY", evidence_ref:"", resource:"" });
  const materialChanges = normalizeList(signals?.material_changes, ignored);
  const changedResources = normalizeList(signals?.changed_resources, ignored);
  const capabilitiesUsed = normalizeList(signals?.capabilities_used, ignored);
  const capabilityEscalations = normalizeList(signals?.capability_escalations, ignored);
  const policyViolations = normalizeList(signals?.policy_violations, ignored);
  const failedChecks = normalizeList(signals?.failed_checks, ignored);
  const missingEvidence = normalizeList(signals?.missing_evidence, ignored);
  const anomalies = normalizeList(signals?.anomalies, ignored);
  const unusualOutput = normalizeList(signals?.unusual_output, ignored);
  const checks = normalizeList(signals?.checks, ignored, { allowStatus:true });
  const verificationState = normalizeScalarSignal(signals?.verification_state, ignored)
    || Object.freeze({ code:"VERIFICATION_STATE", label:clean(task.lifecycle_status || "UNKNOWN",60), source:"REGISTRY", evidence_ref:"", resource:"" });
  const confidence = normalizeScalarSignal(signals?.confidence, ignored);

  if (ignored.count > 0) {
    anomalies.push({
      code:"UNTRUSTED_APPROVAL_SIGNAL_IGNORED",
      label:ignored.count + " untrusted or malformed approval signal(s) ignored",
      source:"REGISTRY",
      evidence_ref:"",
      resource:"",
    });
  }

  const passedChecks = checks.filter((item) => item.status === "PASS");
  const checkFailures = checks.filter((item) => item.status === "FAIL");
  for (const check of checkFailures) {
    if (!failedChecks.some((item) => item.code === check.code)) {
      failedChecks.push({ ...check, status:undefined });
    }
  }

  const counts = Object.freeze({
    anomalies: anomalies.length,
    missing_evidence: missingEvidence.length,
    failed_checks: failedChecks.length,
    policy_violations: policyViolations.length,
    capability_escalations: capabilityEscalations.length,
    material_changes: materialChanges.length,
    changed_resources: changedResources.length,
    capabilities_used: capabilitiesUsed.length,
    unusual_output: unusualOutput.length,
    passed_checks: passedChecks.length,
    ignored_untrusted_claims: ignored.count,
  });

  const blockingCount = counts.policy_violations + counts.failed_checks + counts.missing_evidence
    + counts.anomalies + counts.capability_escalations;
  const state = blockingCount > 0 ? "BLOCKING_SIGNALS"
    : task.approval_required ? "REVIEW_REQUIRED" : "ROUTINE";

  let humanJudgmentReason = "";
  if (counts.policy_violations) humanJudgmentReason = counts.policy_violations + " policy violation(s) require human judgment.";
  else if (counts.failed_checks) humanJudgmentReason = counts.failed_checks + " failed check(s) require human judgment.";
  else if (counts.missing_evidence) humanJudgmentReason = counts.missing_evidence + " missing evidence item(s) require human judgment.";
  else if (counts.anomalies) humanJudgmentReason = counts.anomalies + " anomaly signal(s) require human judgment.";
  else if (counts.capability_escalations) humanJudgmentReason = counts.capability_escalations + " capability escalation(s) require human judgment.";
  else if (task.approval_required || HIGH_IMPACT_RISKS.has(task.risk_class)) humanJudgmentReason = clean(task.risk_class || "HIGH_IMPACT",60) + " requires explicit owner approval before execution.";
  else humanJudgmentReason = "Structured state does not require an owner approval gate.";

  return Object.freeze({
    schema:1,
    task_id:clean(task.id,120),
    risk_class:clean(task.risk_class || "READ_ONLY",60),
    approval_required:Boolean(task.approval_required),
    approval_status:clean(task.approval_status || "NOT_REQUIRED",40),
    requested_action:requestedAction,
    material_changes:freezeList(materialChanges),
    changed_resources:freezeList(changedResources),
    capabilities_used:freezeList(capabilitiesUsed),
    capability_escalations:freezeList(capabilityEscalations),
    policy_violations:freezeList(policyViolations),
    failed_checks:freezeList(failedChecks),
    missing_evidence:freezeList(missingEvidence),
    anomalies:freezeList(anomalies),
    unusual_output:freezeList(unusualOutput),
    checks:freezeList(checks),
    verification_state:verificationState,
    confidence,
    counts,
    state,
    human_judgment_reason:humanJudgmentReason,
    safe_to_auto_approve:false,
    truth_boundary:"structured evidence summary != permission != execution != verification",
  });
}

export function approvalPriorityFacts(summary) {
  const c = summary.counts;
  return Object.freeze([
    Object.freeze({ key:"anomalies", label:c.anomalies ? c.anomalies + " anomalies" : "0 anomalies", count:c.anomalies, tone:c.anomalies ? "danger" : "quiet" }),
    Object.freeze({ key:"missing_evidence", label:c.missing_evidence ? c.missing_evidence + " missing evidence" : "0 missing evidence", count:c.missing_evidence, tone:c.missing_evidence ? "danger" : "quiet" }),
    Object.freeze({ key:"failed_checks", label:c.failed_checks ? c.failed_checks + " failed checks" : "0 failed checks", count:c.failed_checks, tone:c.failed_checks ? "danger" : "quiet" }),
    Object.freeze({ key:"policy_violations", label:c.policy_violations ? c.policy_violations + " policy violations" : "0 policy violations", count:c.policy_violations, tone:c.policy_violations ? "danger" : "quiet" }),
    Object.freeze({ key:"capability_escalations", label:c.capability_escalations ? c.capability_escalations + " capability escalation" : "no capability escalation", count:c.capability_escalations, tone:c.capability_escalations ? "danger" : "quiet" }),
    Object.freeze({ key:"material_changes", label:"material changes: " + c.material_changes, count:c.material_changes, tone:c.material_changes ? "attention" : "quiet" }),
    Object.freeze({ key:"passed_checks", label:c.passed_checks + " checks passed", count:c.passed_checks, tone:"pass" }),
  ]);
}

export { TRUSTED_APPROVAL_SOURCES };
