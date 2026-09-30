import { EMPLOYEE_IDS } from "./workforce.mjs";

const TASK_ID = /^t_[a-z0-9]+$/i;
const EMPLOYEES = new Set(EMPLOYEE_IDS);

export function sanitizeRuntimeTask(task) {
  if (!task || !TASK_ID.test(String(task.id || ""))) return null;
  const assignee = String(task.assignee || "").toLowerCase();
  if (!EMPLOYEES.has(assignee)) return null;
  return {
    id: String(task.id),
    assignee,
    status: String(task.status || "unknown").toLowerCase(),
    created_by: String(task.created_by || "unknown").slice(0, 80),
    created_at: Number.isFinite(task.created_at) ? task.created_at : null,
    session_present: Boolean(task.session_id),
    result_present: Boolean(task.result),
  };
}

export function reconcileClaims(claims, runtimeTasks, checkedAt = new Date().toISOString()) {
  const official = new Map(runtimeTasks.map(sanitizeRuntimeTask).filter(Boolean).map((task) => [task.id, task]));
  return claims.map((claim) => {
    const runtimeRef = String(claim.runtime_ref || "");
    const match = official.get(runtimeRef);
    const assignee = String(claim.assignee_id || "").toLowerCase();
    if (!TASK_ID.test(runtimeRef)) return { ...claim, provenance: "LOCAL_CLAIM", quarantined: true, reconcile_reason: "INVALID_RUNTIME_REF" };
    if (!match) return { ...claim, provenance: "LOCAL_CLAIM", quarantined: true, reconcile_reason: "NOT_ON_OFFICIAL_BOARD" };
    if (match.assignee !== assignee) return { ...claim, provenance: "LOCAL_CLAIM", quarantined: true, reconcile_reason: "ASSIGNEE_MISMATCH" };
    const expected = String(claim.runtime_state || claim.lifecycle_status || "").toLowerCase();
    if (expected && expected !== match.status) return { ...claim, provenance: "LOCAL_CLAIM", quarantined: true, reconcile_reason: "STATUS_MISMATCH" };
    return {
      ...claim,
      provenance: "AUTHORITATIVE_RUNTIME",
      quarantined: false,
      reconciled_at: checkedAt,
      runtime_state: match.status,
      runtime_evidence: { board: "nyobakantorai", id: match.id, assignee: match.assignee, checked_at: checkedAt },
    };
  });
}
