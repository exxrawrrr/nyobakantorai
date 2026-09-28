export const EMPLOYEES = Object.freeze([
  { id: "praroro", name: "Praroro", role: "COO / Chief of Staff", color: "#697d45" },
  { id: "paijo", name: "Paijo", role: "Data & Finance", color: "#71845a" },
  { id: "subagjo", name: "Subagjo", role: "Engineering Lead", color: "#426d78" },
  { id: "alex", name: "Alex", role: "Strategy & Research", color: "#596c76" },
  { id: "sumiati", name: "Sumiati", role: "Creative & Communication", color: "#8b654d" },
  { id: "siti", name: "Siti", role: "QA & Verification", color: "#6e7d55" },
]);
export const STATUSES = Object.freeze(["PLANNED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED"]);
const EMPLOYEE_IDS = new Set(EMPLOYEES.map(({ id }) => id));
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
    runtime_ref: "", runtime_state: "", comments: [], attachments: [], evidence_refs: [],
    created_at: at, updated_at: at,
  };
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
  if (task.execution_mode === "HERMES") throw new Error("Hermes claims are read-only in the office.");
  const status = clean(patch.lifecycle_status || task.lifecycle_status, 30).toUpperCase();
  if (!STATUSES.includes(status)) throw new Error("Unknown status.");
  if (status !== task.lifecycle_status && !transitions[task.lifecycle_status]?.has(status)) throw new Error(`Invalid transition ${task.lifecycle_status} → ${status}.`);
  const actor = clean(patch.actor || "owner", 40).toLowerCase();
  const evidence = clean(patch.evidence_ref, 1000);
  if (status === "VERIFIED") {
    if (actor !== "siti") throw new Error("Only Siti may set VERIFIED.");
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
  if (evidence && !task.evidence_refs.includes(evidence)) task.evidence_refs.push(evidence);
  if (clean(patch.comment, 1000)) task.comments.push({ id: id("comment"), actor, text: clean(patch.comment, 1000), at: clock() });
  if (patch.attachment_name) task.attachments.push({ name: clean(patch.attachment_name, 240), type: clean(patch.attachment_type, 120), size: Number(patch.attachment_size) || 0, metadata_only: true });
  task.updated_at = clock();
  next.events.push(eventFor(task, old === status ? "TASK_EDITED" : "STATUS_CHANGED", actor, task.updated_at, "LOCAL_MANUAL", { old_status: old, new_status: status, evidence_ref: evidence }));
  next.updated_at = task.updated_at;
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
    execution_mode: task.execution_mode === "HERMES" ? "HERMES" : "DEMO",
    provenance: task.execution_mode === "HERMES" ? "LOCAL_CLAIM" : "DEMO",
    quarantined: task.execution_mode === "HERMES",
    reconcile_reason: task.execution_mode === "HERMES" ? "NOT_RECONCILED" : "",
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
    if (task.lifecycle_status === "VERIFIED") {
      const verified = registry.events.find((entry) => entry.task_id === task.id && entry.action === "STATUS_CHANGED" && entry.actor === "siti" && entry.new_status === "VERIFIED" && entry.evidence_ref);
      if (!verified) throw new Error("VERIFIED requires a Siti evidence event.");
    }
    if (task.execution_mode === "HERMES" && task.provenance === "AUTHORITATIVE_RUNTIME" && (!task.runtime_evidence?.id || task.runtime_evidence.id !== task.runtime_ref)) throw new Error("Runtime provenance is incomplete.");
  }
  return true;
}

function eventFor(task, action, actor, at, source, extra = {}) {
  return { id: id("event"), task_id: task.id, action, actor, at, source, provenance: task.provenance, ...extra };
}
