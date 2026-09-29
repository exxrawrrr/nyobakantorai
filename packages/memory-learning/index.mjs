const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/,
  /\b(?:password|passwd|api[_ -]?key|secret|token)\s*[:=]\s*\S+/i,
];

const NON_CANONICAL_STATUSES = new Set(["CANDIDATE","REVIEW_REQUIRED","REJECTED"]);

export function containsSecretLikeContent(value) {
  const text = String(value ?? "");
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateLearningEvent(event, { employeeIds = [] } = {}) {
  const errors = [];
  if (event?.schema !== 1) errors.push("schema must be 1");
  if (!/^[a-z0-9][a-z0-9._-]{5,127}$/.test(event?.event_id || "")) errors.push("invalid event_id");
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(event?.employee_id || "")) errors.push("invalid employee_id");
  if (employeeIds.length && !employeeIds.includes(event?.employee_id)) errors.push("unknown employee_id");
  if (!["M1","M2","M3","M4"].includes(event?.layer)) errors.push("invalid layer");
  if (!event?.created_at || Number.isNaN(Date.parse(event.created_at))) errors.push("invalid created_at");
  if (typeof event?.summary !== "string" || !event.summary.trim()) errors.push("summary required");
  if (!Array.isArray(event?.evidence_refs) || event.evidence_refs.length < 1) errors.push("evidence_refs required");
  if (!Array.isArray(event?.source_refs) || event.source_refs.length < 1) errors.push("source_refs required");
  if (!["PUBLIC","INTERNAL","PRIVATE","SECRET_PROHIBITED"].includes(event?.sensitivity)) errors.push("invalid sensitivity");
  if (containsSecretLikeContent(event?.summary)) errors.push("secret-like content prohibited");
  if (event?.sensitivity === "SECRET_PROHIBITED") errors.push("SECRET_PROHIBITED cannot be persisted");
  if (event?.layer === "M3") {
    if (!event?.shared_scope) errors.push("M3 requires shared_scope");
    if (event?.human_review !== true) errors.push("M3 requires human_review=true");
  }
  if (event?.layer === "M4" && event?.human_review !== true) errors.push("M4 requires human_review=true");
  return errors;
}

export function promoteToShared(event, { sharedScope, approved = false, reviewer = null } = {}) {
  const baseErrors = validateLearningEvent(event);
  if (baseErrors.length) throw new Error(baseErrors.join("; "));
  if (!["M1","M2"].includes(event.layer)) throw new Error("Only M1/M2 events can be promoted to shared M3 knowledge");
  if (!approved || !reviewer) throw new Error("Shared promotion requires explicit human review");
  if (!sharedScope || !String(sharedScope).trim()) throw new Error("Shared promotion requires shared_scope");
  if (containsSecretLikeContent(event.summary) || event.sensitivity === "SECRET_PROHIBITED") throw new Error("Secret-like memory cannot be promoted");
  return Object.freeze({
    ...event,
    layer: "M3",
    shared_scope: String(sharedScope).trim(),
    human_review: true,
    reviewed_by: String(reviewer),
  });
}

export function validateSkillCandidate(candidate, { employeeIds = [] } = {}) {
  const errors = [];
  if (candidate?.schema !== 1) errors.push("schema must be 1");
  if (!/^[a-z0-9][a-z0-9._-]{5,127}$/.test(candidate?.candidate_id || "")) errors.push("invalid candidate_id");
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(candidate?.employee_id || "")) errors.push("invalid employee_id");
  if (employeeIds.length && !employeeIds.includes(candidate?.employee_id)) errors.push("unknown employee_id");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate?.skill_name || "")) errors.push("invalid skill_name");
  if (!candidate?.created_at || Number.isNaN(Date.parse(candidate.created_at))) errors.push("invalid created_at");
  if (typeof candidate?.proposal !== "string" || !candidate.proposal.trim()) errors.push("proposal required");
  if (containsSecretLikeContent(candidate?.proposal)) errors.push("secret-like content prohibited");
  if (!Array.isArray(candidate?.evidence_refs) || candidate.evidence_refs.length < 1) errors.push("evidence_refs required");
  if (!Array.isArray(candidate?.observation_ids)) errors.push("observation_ids must be an array");
  if (!["THREE_PLUS_INDEPENDENT_OBSERVATIONS","EXPLICIT_HUMAN_RULE"].includes(candidate?.promotion_basis)) errors.push("invalid promotion_basis");
  if (!["CANDIDATE","REVIEW_REQUIRED","REJECTED","MERGED_VIA_REPOSITORY_PR"].includes(candidate?.status)) errors.push("invalid status");
  if (candidate?.promotion_basis === "THREE_PLUS_INDEPENDENT_OBSERVATIONS" && new Set(candidate.observation_ids || []).size < 3) errors.push("three independent observations required");
  if (candidate?.promotion_basis === "EXPLICIT_HUMAN_RULE" && !candidate?.human_rule_ref) errors.push("human_rule_ref required");
  if (candidate?.status === "MERGED_VIA_REPOSITORY_PR" && !candidate?.repository_pr) errors.push("merged candidate requires repository_pr");
  if (NON_CANONICAL_STATUSES.has(candidate?.status) && candidate?.repository_pr) errors.push("non-merged candidate must not claim repository_pr");
  return errors;
}

export function markSkillCandidateForReview(candidate, { reviewer } = {}) {
  const errors = validateSkillCandidate(candidate);
  if (errors.length) throw new Error(errors.join("; "));
  if (!reviewer) throw new Error("reviewer required");
  if (candidate.status !== "CANDIDATE") throw new Error("only CANDIDATE can move to REVIEW_REQUIRED");
  return Object.freeze({ ...candidate, status:"REVIEW_REQUIRED", reviewed_by:String(reviewer) });
}

export function markSkillCandidateMerged(candidate, { repositoryPr, approved = false } = {}) {
  const errors = validateSkillCandidate(candidate);
  if (errors.length) throw new Error(errors.join("; "));
  if (candidate.status !== "REVIEW_REQUIRED") throw new Error("candidate must be REVIEW_REQUIRED before merge");
  if (!approved) throw new Error("human approval required before canonical skill merge");
  if (!repositoryPr || !String(repositoryPr).trim()) throw new Error("repository PR reference required");
  return Object.freeze({ ...candidate, status:"MERGED_VIA_REPOSITORY_PR", repository_pr:String(repositoryPr).trim() });
}


export function exportProfileLearningState({ events = [], candidates = [], employeeId, includeShared = false } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new Error("valid employeeId required");
  const profileEvents = events.filter((event) =>
    event?.employee_id === id && (includeShared || event?.layer !== "M3")
  ).map((event) => structuredClone(event));
  const profileCandidates = candidates.filter((candidate) =>
    candidate?.employee_id === id
  ).map((candidate) => structuredClone(candidate));
  return Object.freeze({
    schema: 1,
    employee_id: id,
    include_shared: Boolean(includeShared),
    events: Object.freeze(profileEvents),
    skill_candidates: Object.freeze(profileCandidates),
  });
}

export function deleteProfileLearningState({ events = [], candidates = [], employeeId, deleteShared = false } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new Error("valid employeeId required");

  const deletedEvents = [];
  const keptEvents = [];
  for (const event of events) {
    const owned = event?.employee_id === id;
    const sharedProtected = event?.layer === "M3" && !deleteShared;
    if (owned && !sharedProtected) deletedEvents.push(structuredClone(event));
    else keptEvents.push(structuredClone(event));
  }

  const deletedCandidates = [];
  const keptCandidates = [];
  for (const candidate of candidates) {
    const owned = candidate?.employee_id === id;
    const canonicalProtected = candidate?.status === "MERGED_VIA_REPOSITORY_PR";
    if (owned && !canonicalProtected) deletedCandidates.push(structuredClone(candidate));
    else keptCandidates.push(structuredClone(candidate));
  }

  return Object.freeze({
    schema: 1,
    employee_id: id,
    delete_shared: Boolean(deleteShared),
    remaining: Object.freeze({
      events: Object.freeze(keptEvents),
      skill_candidates: Object.freeze(keptCandidates),
    }),
    deleted: Object.freeze({
      events: Object.freeze(deletedEvents),
      skill_candidates: Object.freeze(deletedCandidates),
    }),
    preserved: Object.freeze({
      shared_events: Object.freeze(keptEvents.filter((event) => event?.employee_id === id && event?.layer === "M3")),
      merged_skill_candidates: Object.freeze(keptCandidates.filter((candidate) => candidate?.employee_id === id && candidate?.status === "MERGED_VIA_REPOSITORY_PR")),
    }),
  });
}
