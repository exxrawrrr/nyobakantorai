import { WORKFORCE_VIEW as WORKFORCE } from "./workforce-view.mjs";

export const EMPLOYEES = Object.freeze(WORKFORCE.map(({ id, name, role, department, visual, external_capabilities }) => Object.freeze({
  id, name, role, department, color: visual.color, asset_status: visual.asset_status,
  initials: visual.initials, external_capabilities,
})));
export const RISK_CLASSES = Object.freeze(["READ_ONLY", "LOCAL_WRITE", "EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"]);
export const APPROVAL_STATUSES = Object.freeze(["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"]);
const AUTO_APPROVAL_RISKS = new Set(["EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"]);
export const STATUSES = Object.freeze(["PLANNED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED"]);
const EMPLOYEE_IDS = new Set(EMPLOYEES.map(({ id }) => id));
const EMPLOYEE_POLICY = new Map(WORKFORCE.map((person) => [person.id, person]));
function mayVerify(assigneeId, actorId) {
  if (!EMPLOYEE_IDS.has(actorId) || actorId === assigneeId) return false;
  const policy = EMPLOYEE_POLICY.get(assigneeId)?.verification_policy;
  return policy?.independent_required === true && policy?.self_verify === false
    && Array.isArray(policy.reviewer_candidates) && policy.reviewer_candidates.includes(actorId);
}
const transitions = {
  PLANNED: new Set(["IN_PROGRESS", "BLOCKED"]),
  IN_PROGRESS: new Set(["BLOCKED", "COMPLETED"]),
  BLOCKED: new Set(["IN_PROGRESS", "COMPLETED"]),
  COMPLETED: new Set(["IN_PROGRESS", "VERIFIED"]),
  VERIFIED: new Set(["IN_PROGRESS"]),
};
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;

export function emptyRegistry() {
  return { schema: 3, tasks: [], events: [], updated_at: now() };
}

export function demoRegistry() {
  const registry = emptyRegistry();
  return createTask(registry, {
    title: "Review local office shell",
    detail: "Demo-only task. No model, Hermes dispatch, or external write.",
    assignee_id: "siti",
    priority: "MEDIUM",
    due_date: "",
  }, () => "task_demo", () => "2026-09-19T00:00:00.000Z");
}

export function createTask(registry, input, idFactory = () => id("task"), clock = now) {
  const next = clone(registry);
  const title = clean(input.title, 160);
  const assignee = clean(input.assignee_id, 40).toLowerCase();
  if (!title) throw new Error("Title is required.");
  if (!EMPLOYEE_IDS.has(assignee)) throw new Error("Unknown assignee.");
  const at = clock();
  const task = {
    id: idFactory(), title, detail: clean(input.detail, 4000), assignee_id: assignee,
    priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(input.priority) ? input.priority : "MEDIUM",
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(input.due_date || "") ? input.due_date : "",
    lifecycle_status: "PLANNED", execution_mode: "DEMO", provenance: "DEMO", quarantined: false,
    risk_class: RISK_CLASSES.includes(input.risk_class) ? input.risk_class : "READ_ONLY",
    approval_required: false, approval_status: "NOT_REQUIRED", approval_actor: "", approval_at: "", approval_evidence_ref: "",
    approval_target: "", approval_reason: "", approval_preview: "", approval_scope_actions: [], approval_scope_resources: [], approval_expires_at: "",
    approval_budget_amount: null, approval_budget_currency: "",
    runtime_ref: "", runtime_state: "", comments: [], attachments: [], evidence_refs: [],
    created_at: at, updated_at: at,
  };
  task.approval_required = AUTO_APPROVAL_RISKS.has(task.risk_class) || Boolean(input.approval_required);
  task.approval_status = task.approval_required ? "PENDING" : "NOT_REQUIRED";
  task.approval_target = clean(input.approval_target || ("task:"+task.id), 500);
  task.approval_reason = clean(input.approval_reason || task.detail || task.title, 4000);
  task.approval_preview = clean(input.approval_preview || task.detail || task.title, 8000);
  task.approval_scope_actions = Array.isArray(input.approval_scope_actions) ? [...new Set(input.approval_scope_actions.map((x)=>clean(x,160)).filter(Boolean))] : ["execute"];
  task.approval_scope_resources = Array.isArray(input.approval_scope_resources) ? [...new Set(input.approval_scope_resources.map((x)=>clean(x,500)).filter(Boolean))] : [task.approval_target];
  task.approval_expires_at = /^\d{4}-\d{2}-\d{2}T/.test(input.approval_expires_at || "") ? new Date(input.approval_expires_at).toISOString() : "";
  task.approval_budget_amount = input.approval_budget_amount == null || input.approval_budget_amount === "" ? null : Math.max(0, Number(input.approval_budget_amount));
  task.approval_budget_currency = task.approval_budget_amount == null ? "" : clean(input.approval_budget_currency || "USD", 3).toUpperCase();
  next.tasks.push(task);
  next.events.push(eventFor(task, "TASK_CREATED", "owner", at, "LOCAL_MANUAL"));
  next.updated_at = at;
  validateRegistry(next);
  return next;
}

export function updateTask(registry, taskId, patch, clock = now) {
  const next = clone(registry);
  const task = next.tasks.find(({ id: current }) => current === taskId);
  if (!task) throw new Error("Task not found.");
  if (task.execution_mode === "RUNTIME") throw new Error("Runtime claims are read-only in the office.");
  const status = clean(patch.lifecycle_status || task.lifecycle_status, 30).toUpperCase();
  if (!STATUSES.includes(status)) throw new Error("Unknown status.");
  if (status !== task.lifecycle_status && !transitions[task.lifecycle_status]?.has(status)) throw new Error(`Invalid transition ${task.lifecycle_status} → ${status}.`);
  if (task.approval_required && ["IN_PROGRESS", "COMPLETED", "VERIFIED"].includes(status) && task.approval_status !== "APPROVED") throw new Error("Owner approval required before this task may execute.");
  if (task.approval_required && task.approval_status === "APPROVED" && task.approval_expires_at && ["IN_PROGRESS","COMPLETED","VERIFIED"].includes(status) && Date.parse(clock()) >= Date.parse(task.approval_expires_at)) throw new Error("Approval expired before execution.");
  const actor = clean(patch.actor || "owner", 40).toLowerCase();
  const evidence = clean(patch.evidence_ref, 1000);
  if (status === "VERIFIED") {
    if (actor === task.assignee_id) throw new Error("A worker cannot independently verify its own work.");
    if (!mayVerify(task.assignee_id, actor)) throw new Error("VERIFIED requires an independent registry-approved reviewer.");
    if (!evidence && !task.evidence_refs.length) throw new Error("VERIFIED requires evidence.");
  }
  if (task.lifecycle_status === "VERIFIED" && status === "IN_PROGRESS" && actor !== "owner") throw new Error("Only the owner may reopen VERIFIED work.");
  const old = task.lifecycle_status;
  task.lifecycle_status = status;
  task.title = clean(patch.title || task.title, 160);
  task.detail = clean(patch.detail ?? task.detail, 4000);
  task.assignee_id = EMPLOYEE_IDS.has(patch.assignee_id) ? patch.assignee_id : task.assignee_id;
  task.priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(patch.priority) ? patch.priority : task.priority;
  task.due_date = /^\d{4}-\d{2}-\d{2}$/.test(patch.due_date || "") ? patch.due_date : task.due_date;
  const approvalFields = ["approval_reason","approval_preview","approval_scope_actions","approval_scope_resources","approval_expires_at","approval_budget_amount","approval_budget_currency"];
  const touchesApproval = approvalFields.some((field)=>Object.prototype.hasOwnProperty.call(patch,field));
  if (touchesApproval && actor !== "owner") throw new Error("Only the owner may edit approval scope/preview/expiry.");
  if (touchesApproval && task.approval_status === "APPROVED") throw new Error("Approved scope cannot be edited in place; create a new approval.");
  if (Object.prototype.hasOwnProperty.call(patch,"approval_reason")) task.approval_reason = clean(patch.approval_reason,4000);
  if (Object.prototype.hasOwnProperty.call(patch,"approval_preview")) task.approval_preview = clean(patch.approval_preview,8000);
  if (Object.prototype.hasOwnProperty.call(patch,"approval_scope_actions")) {
    const values=String(patch.approval_scope_actions||"").split(",").map((x)=>clean(x,160)).filter(Boolean);
    if(!values.length) throw new Error("Approval scope actions cannot be empty.");
    task.approval_scope_actions=[...new Set(values)];
  }
  if (Object.prototype.hasOwnProperty.call(patch,"approval_scope_resources")) {
    const values=String(patch.approval_scope_resources||"").split(",").map((x)=>clean(x,500)).filter(Boolean);
    if(!values.length||values.some((x)=>x==="*"||x.includes("*"))) throw new Error("Approval scope resources must be exact and non-wildcard.");
    task.approval_scope_resources=[...new Set(values)];
  }
  if (Object.prototype.hasOwnProperty.call(patch,"approval_expires_at")) {
    const value=clean(patch.approval_expires_at,80);
    if(value && Number.isNaN(Date.parse(value))) throw new Error("Approval expiry must be a valid timestamp.");
    task.approval_expires_at=value?new Date(value).toISOString():"";
  }
  if (Object.prototype.hasOwnProperty.call(patch,"approval_budget_amount")) {
    const raw=patch.approval_budget_amount;
    task.approval_budget_amount=raw==null||raw===""?null:Number(raw);
    if(task.approval_budget_amount!=null&&(!Number.isFinite(task.approval_budget_amount)||task.approval_budget_amount<0)) throw new Error("Approval budget must be non-negative.");
  }
  if (Object.prototype.hasOwnProperty.call(patch,"approval_budget_currency")) task.approval_budget_currency=task.approval_budget_amount==null?"":clean(patch.approval_budget_currency||"USD",3).toUpperCase();
  if (evidence && !task.evidence_refs.includes(evidence)) task.evidence_refs.push(evidence);
  if (clean(patch.comment, 1000)) task.comments.push({ id: id("comment"), actor, text: clean(patch.comment, 1000), at: clock() });
  if (patch.attachment_name) task.attachments.push({ name: clean(patch.attachment_name, 240), type: clean(patch.attachment_type, 120), size: Number(patch.attachment_size) || 0, metadata_only: true });
  task.updated_at = clock();
  next.events.push(eventFor(task, old === status ? "TASK_EDITED" : "STATUS_CHANGED", actor, task.updated_at, "LOCAL_MANUAL", { old_status: old, new_status: status, evidence_ref: evidence }));
  next.updated_at = task.updated_at;
  validateRegistry(next);
  return next;
}

export function recordApproval(registry, taskId, decision, clock = now) {
  const next = clone(registry);
  const task = next.tasks.find(({ id: current }) => current === taskId);
  if (!task) throw new Error("Task not found.");
  if (task.execution_mode === "RUNTIME") throw new Error("Runtime claims are read-only in the office.");
  if (!task.approval_required) throw new Error("Task does not require approval.");
  const actor = clean(decision.actor || "owner", 40).toLowerCase();
  if (actor !== "owner") throw new Error("Only the owner may approve high-impact work.");
  const status = clean(decision.status, 20).toUpperCase();
  if (!["APPROVED", "REJECTED"].includes(status)) throw new Error("Approval decision must be APPROVED or REJECTED.");
  const at = clock();
  if(status === "APPROVED" && task.approval_expires_at && Date.parse(at) >= Date.parse(task.approval_expires_at)) throw new Error("Cannot approve an expired approval request.");
  task.approval_status = status;
  task.approval_actor = "owner";
  task.approval_at = at;
  task.approval_evidence_ref = clean(decision.evidence_ref, 1000) || `local-approval:${task.id}:${at}`;
  task.updated_at = at;
  next.events.push(eventFor(task, "APPROVAL_RECORDED", "owner", at, "LOCAL_APPROVAL", {
    decision: status,
    evidence_ref: task.approval_evidence_ref,
    risk_class: task.risk_class,
    target: task.approval_target,
    scope_actions: task.approval_scope_actions,
    scope_resources: task.approval_scope_resources,
    expires_at: task.approval_expires_at,
    preview: task.approval_preview,
    reason: task.approval_reason,
    budget_amount: task.approval_budget_amount,
    budget_currency: task.approval_budget_currency,
  }));
  next.updated_at = at;
  validateRegistry(next);
  return next;
}

export function importRegistry(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("Valid JSON required."); }
  if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.events)) throw new Error("Registry arrays are required.");
  const next = { schema: 3, tasks: parsed.tasks.map((task) => ({
    ...task,
    id: clean(task.id, 120), title: clean(task.title, 160), detail: clean(task.detail, 4000),
    assignee_id: clean(task.assignee_id, 40).toLowerCase(),
    execution_mode: task.execution_mode && !["DEMO","LOCAL"].includes(task.execution_mode) ? "RUNTIME" : "DEMO",
    runtime_provider: clean(task.runtime_provider || (task.execution_mode && !["DEMO","LOCAL"].includes(task.execution_mode) ? String(task.execution_mode).toLowerCase() : ""), 64),
    risk_class: RISK_CLASSES.includes(task.risk_class) ? task.risk_class : "READ_ONLY",
    approval_required: AUTO_APPROVAL_RISKS.has(task.risk_class) || Boolean(task.approval_required),
    approval_status: APPROVAL_STATUSES.includes(task.approval_status) ? task.approval_status : (AUTO_APPROVAL_RISKS.has(task.risk_class) || task.approval_required ? "PENDING" : "NOT_REQUIRED"),
    approval_actor: clean(task.approval_actor, 40),
    approval_at: clean(task.approval_at, 80),
    approval_evidence_ref: clean(task.approval_evidence_ref, 1000),
    approval_target: clean(task.approval_target || ("task:"+task.id), 500),
    approval_reason: clean(task.approval_reason || task.detail || task.title, 4000),
    approval_preview: clean(task.approval_preview || task.detail || task.title, 8000),
    approval_scope_actions: Array.isArray(task.approval_scope_actions) && task.approval_scope_actions.length ? [...new Set(task.approval_scope_actions.map((x)=>clean(x,160)).filter(Boolean))] : ["execute"],
    approval_scope_resources: Array.isArray(task.approval_scope_resources) && task.approval_scope_resources.length ? [...new Set(task.approval_scope_resources.map((x)=>clean(x,500)).filter(Boolean))] : [clean(task.approval_target || ("task:"+task.id),500)],
    approval_expires_at: clean(task.approval_expires_at,80),
    approval_budget_amount: task.approval_budget_amount == null ? null : Number(task.approval_budget_amount),
    approval_budget_currency: clean(task.approval_budget_currency,3).toUpperCase(),
    provenance: task.execution_mode && !["DEMO","LOCAL"].includes(task.execution_mode) ? "LOCAL_CLAIM" : "DEMO",
    quarantined: Boolean(task.execution_mode && !["DEMO","LOCAL"].includes(task.execution_mode)),
    reconcile_reason: task.execution_mode && !["DEMO","LOCAL"].includes(task.execution_mode) ? "NOT_RECONCILED" : "",
    comments: Array.isArray(task.comments) ? task.comments.slice(0, 200) : [],
    attachments: Array.isArray(task.attachments) ? task.attachments.slice(0, 50) : [],
    evidence_refs: Array.isArray(task.evidence_refs) ? task.evidence_refs.map((item) => clean(item, 1000)).slice(0, 50) : [],
  })), events: parsed.events.slice(0, 5000), updated_at: now() };
  validateRegistry(next);
  return next;
}

export function validateRegistry(registry) {
  if (registry.schema !== 3 || !Array.isArray(registry.tasks) || !Array.isArray(registry.events)) throw new Error("Invalid registry schema.");
  const seen = new Set();
  for (const task of registry.tasks) {
    if (!task.id || seen.has(task.id)) throw new Error("Task IDs must be unique.");
    seen.add(task.id);
    if (!task.title || !EMPLOYEE_IDS.has(task.assignee_id) || !STATUSES.includes(task.lifecycle_status)) throw new Error("Invalid task.");
    if (!RISK_CLASSES.includes(task.risk_class || "READ_ONLY") || !APPROVAL_STATUSES.includes(task.approval_status || "NOT_REQUIRED")) throw new Error("Invalid approval policy.");
    if (AUTO_APPROVAL_RISKS.has(task.risk_class) && task.approval_required !== true) throw new Error("High-impact task requires approval.");
    if (task.approval_required) {
      if (!task.approval_target || !task.approval_reason || !task.approval_preview) throw new Error("Approval Center metadata is incomplete.");
      if (!Array.isArray(task.approval_scope_actions) || !task.approval_scope_actions.length) throw new Error("Approval scope actions required.");
      if (!Array.isArray(task.approval_scope_resources) || !task.approval_scope_resources.length || task.approval_scope_resources.some((x)=>x==="*"||x.includes("*"))) throw new Error("Approval scope resources must be exact.");
      if (task.approval_expires_at && Number.isNaN(Date.parse(task.approval_expires_at))) throw new Error("Approval expiry invalid.");
      if (task.approval_budget_amount != null && (!Number.isFinite(Number(task.approval_budget_amount)) || Number(task.approval_budget_amount)<0)) throw new Error("Approval budget invalid.");
    }
    if (task.approval_required && ["IN_PROGRESS", "COMPLETED", "VERIFIED"].includes(task.lifecycle_status) && task.approval_status !== "APPROVED") throw new Error("High-impact task cannot execute without approval.");
    if (task.lifecycle_status === "VERIFIED") {
      const verified = registry.events.find((entry) => entry.task_id === task.id && entry.action === "STATUS_CHANGED"
        && entry.new_status === "VERIFIED" && entry.evidence_ref && mayVerify(task.assignee_id, entry.actor));
      if (!verified) throw new Error("VERIFIED requires an independent reviewer evidence event.");
    }
    if (task.execution_mode === "RUNTIME" && task.provenance === "AUTHORITATIVE_RUNTIME" && (!task.runtime_evidence?.id || task.runtime_evidence.id !== task.runtime_ref)) throw new Error("Runtime provenance is incomplete.");
  }
  return true;
}

function eventFor(task, action, actor, at, source, extra = {}) {
  return { id: id("event"), task_id: task.id, action, actor, at, source, provenance: task.provenance, ...extra };
}
