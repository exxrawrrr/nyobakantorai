import { EMPLOYEE_IDS } from "./workforce.mjs";

const RUNTIME_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const EMPLOYEES = new Set(EMPLOYEE_IDS);
const clean = (value, max = 240) => String(value ?? "").trim().slice(0, max);

export function sanitizeRuntimeTask(task) {
  const id = clean(task?.id, 160);
  if (!task || !RUNTIME_ID.test(id)) return null;
  const assignee = clean(task.assignee, 80).toLowerCase();
  if (!EMPLOYEES.has(assignee)) return null;
  return {
    id,
    assignee,
    status: clean(task.status || "unknown", 40).toLowerCase(),
    created_by: clean(task.created_by || "unknown", 80),
    created_at: Number.isFinite(task.created_at) ? task.created_at : null,
    session_present: Boolean(task.session_id),
    result_present: Boolean(task.result),
  };
}

export function reconcileClaims(claims, runtimeTasks, checkedAt = new Date().toISOString(), {
  providerId = "runtime",
  sourceId = "nyobakantorai",
} = {}) {
  const provider = clean(providerId, 64).toLowerCase();
  const source = clean(sourceId, 120);
  const official = new Map(runtimeTasks.map(sanitizeRuntimeTask).filter(Boolean).map((task) => [task.id, task]));
  return claims.map((claim) => {
    const runtimeRef = clean(claim.runtime_ref, 160);
    const match = official.get(runtimeRef);
    const assignee = clean(claim.assignee_id, 80).toLowerCase();
    if (!RUNTIME_ID.test(runtimeRef)) return { ...claim, provenance: "LOCAL_CLAIM", quarantined: true, reconcile_reason: "INVALID_RUNTIME_REF" };
    if (!match) return { ...claim, provenance: "LOCAL_CLAIM", quarantined: true, reconcile_reason: "NOT_ON_RUNTIME_SOURCE" };
    if (match.assignee !== assignee) return { ...claim, provenance: "LOCAL_CLAIM", quarantined: true, reconcile_reason: "ASSIGNEE_MISMATCH" };
    const expected = clean(claim.runtime_state || claim.lifecycle_status, 40).toLowerCase();
    if (expected && expected !== match.status) return { ...claim, provenance: "LOCAL_CLAIM", quarantined: true, reconcile_reason: "STATUS_MISMATCH" };
    return {
      ...claim,
      execution_mode:"RUNTIME",
      runtime_provider:provider,
      provenance:"AUTHORITATIVE_RUNTIME",
      quarantined:false,
      reconciled_at:checkedAt,
      runtime_state:match.status,
      runtime_evidence:{ provider_id:provider, source_id:source, id:match.id, assignee:match.assignee, checked_at:checkedAt },
    };
  });
}
