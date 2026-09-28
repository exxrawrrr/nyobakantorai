export const EMPLOYEES = Object.freeze([
  { id: "praroro", name: "Praroro", role: "COO / Chief of Staff", focus: "Prioritas, delegasi, dan executive brief", accent: "amber" },
  { id: "paijo", name: "Paijo", role: "Quant, Growth & Finance", focus: "Angka, growth, spreadsheet, dan skenario", accent: "emerald" },
  { id: "subagjo", name: "Subagjo", role: "Engineering & Operations", focus: "Engineering, integrasi, dan bukti test", accent: "cyan" },
  { id: "alex", name: "Alex", role: "Strategy & Rapid Execution", focus: "Strategi, opsi, dan quick win", accent: "violet" },
  { id: "sumiati", name: "Sumiati", role: "Creative & Communications", focus: "Creative direction, copy, dan komunikasi", accent: "rose", pashmina: true },
  { id: "siti", name: "Siti", role: "QA, Compliance & Knowledge", focus: "QA independen, bukti, dan konsistensi", accent: "blue" },
]);

export const STATUSES = Object.freeze([
  "PLANNED",
  "REQUESTED",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "COMPLETED",
  "VERIFIED",
  "BLOCKED",
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  PLANNED: ["REQUESTED", "WAITING_FOR_USER", "BLOCKED"],
  REQUESTED: ["IN_PROGRESS", "WAITING_FOR_USER", "BLOCKED"],
  IN_PROGRESS: ["COMPLETED", "WAITING_FOR_USER", "BLOCKED"],
  WAITING_FOR_USER: ["REQUESTED", "IN_PROGRESS", "BLOCKED"],
  COMPLETED: ["VERIFIED", "IN_PROGRESS", "BLOCKED"],
  VERIFIED: ["IN_PROGRESS"],
  BLOCKED: ["PLANNED", "REQUESTED", "IN_PROGRESS", "WAITING_FOR_USER"],
});

const employeeIds = new Set(EMPLOYEES.map(({ id }) => id));

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const clone = (value) => structuredClone(value);
const defaultClock = () => new Date().toISOString();
const defaultId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeEvent(taskId, action, details, clock, idFactory) {
  return {
    event_id: idFactory("event"),
    task_id: taskId,
    at: clock(),
    actor: clean(details.actor, 80) || "manual:owner",
    action,
    old_status: details.oldStatus ?? null,
    new_status: details.newStatus ?? null,
    source: clean(details.source, 240) || "manual dashboard",
    evidence_ref: clean(details.evidenceRef, 1000),
  };
}

export function createEmptyRegistry(clock = defaultClock) {
  return {
    version: 1,
    updated_at: clock(),
    employees: EMPLOYEES.map(({ id }) => ({ id, presence: "UNKNOWN" })),
    tasks: [],
    events: [],
  };
}

export function createDemoRegistry(clock = defaultClock, idFactory = defaultId) {
  let registry = createEmptyRegistry(clock);
  registry = createTask(registry, {
    title: "Siapkan briefing kampanye dummy",
    detail: "Demo lokal tanpa data klien. Praroro menyiapkan handoff manual untuk Paijo dan Sumiati.",
    assignee_id: "praroro",
    requester: "the owner (demo)",
    priority: "HIGH",
    source: "dummy seed",
  }, clock, idFactory);
  registry = createTask(registry, {
    title: "QA dashboard MVP dummy",
    detail: "Periksa persistence, event history, dan aturan VERIFIED menggunakan data fiktif.",
    assignee_id: "siti",
    requester: "Codex (demo)",
    priority: "MEDIUM",
    source: "dummy seed",
  }, clock, idFactory);
  return registry;
}

export function createTask(registry, input, clock = defaultClock, idFactory = defaultId) {
  validateRegistry(registry);
  const title = clean(input.title, 160);
  const assignee = clean(input.assignee_id, 40);
  assert(title, "Judul tugas wajib diisi.");
  assert(employeeIds.has(assignee), "Assignee tidak dikenal.");

  const next = clone(registry);
  const id = idFactory("task");
  const now = clock();
  const task = {
    id,
    title,
    detail: clean(input.detail),
    assignee_id: assignee,
    requester: clean(input.requester, 120) || "the owner",
    priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(input.priority) ? input.priority : "MEDIUM",
    lifecycle_status: "PLANNED",
    created_at: now,
    updated_at: now,
    source: clean(input.source, 240) || "manual dashboard",
    output_ref: "",
    evidence_ref: "",
    approval_required: Boolean(input.approval_required),
    handoff_to: employeeIds.has(input.handoff_to) ? input.handoff_to : "",
    execution_mode: "DEMO",
    runtime_ref: "",
    runtime_state: "NOT CONNECTED",
  };
  next.tasks.push(task);
  next.events.push(makeEvent(id, "TASK_CREATED", {
    actor: input.actor,
    newStatus: "PLANNED",
    source: task.source,
  }, clock, idFactory));
  next.updated_at = now;
  return next;
}

export function attachRuntimeTask(registry, taskId, runtime, clock = defaultClock, idFactory = defaultId) {
  validateRegistry(registry);
  const next = clone(registry);
  const task = next.tasks.find(({ id }) => id === taskId);
  assert(task, "Tugas tidak ditemukan.");
  const runtimeId = clean(runtime.task_id, 160);
  assert(/^t_[a-z0-9]+$/i.test(runtimeId), "Hermes task ID tidak valid.");
  assert(phaseOneEmployee(task.assignee_id), "Phase 1 hanya mendukung Praroro, Subagjo, dan Siti.");
  assert(task.execution_mode !== "HERMES", "Tugas sudah terhubung ke Hermes.");
  assert(runtime.assignee === task.assignee_id, "Assignee Hermes tidak cocok.");
  assert(runtime.state === "BLOCKED", "Task Hermes wajib di-stage sebagai BLOCKED.");
  assert(task.lifecycle_status === "PLANNED" || task.lifecycle_status === "BLOCKED", "Hanya tugas PLANNED/BLOCKED yang dapat di-stage.");
  const oldStatus = task.lifecycle_status;
  task.execution_mode = "HERMES";
  task.runtime_ref = `hermes-kanban:${runtimeId}`;
  task.runtime_state = "BLOCKED";
  task.lifecycle_status = "BLOCKED";
  task.updated_at = clock();
  next.events.push(makeEvent(task.id, "HERMES_TASK_STAGED", {
    actor: "adapter:hermes",
    oldStatus,
    newStatus: "BLOCKED",
    source: "Hermes Kanban adapter",
    evidenceRef: task.runtime_ref,
  }, clock, idFactory));
  next.updated_at = task.updated_at;
  return next;
}

function phaseOneEmployee(id) {
  return ["praroro", "subagjo", "siti"].includes(id);
}

export function updateTask(registry, taskId, patch, clock = defaultClock, idFactory = defaultId) {
  validateRegistry(registry);
  const next = clone(registry);
  const task = next.tasks.find(({ id }) => id === taskId);
  assert(task, "Tugas tidak ditemukan.");
  assert(task.execution_mode !== "HERMES", "Status tugas Hermes hanya boleh berasal dari event runtime yang divalidasi server.");

  const oldStatus = task.lifecycle_status;
  const newStatus = patch.lifecycle_status || oldStatus;
  assert(STATUSES.includes(newStatus), "Status tidak dikenal.");
  if (newStatus !== oldStatus) {
    assert(ALLOWED_TRANSITIONS[oldStatus].includes(newStatus), `Transisi ${oldStatus} → ${newStatus} tidak diizinkan.`);
  }

  const actor = clean(patch.actor, 80) || "manual:owner";
  const evidence = clean(patch.evidence_ref ?? task.evidence_ref, 1000);
  if (newStatus === "VERIFIED") {
    assert(actor.toLowerCase() === "siti", "Status VERIFIED hanya dapat dicatat oleh Siti.");
    assert(evidence, "Status VERIFIED membutuhkan evidence reference.");
  }
  if (oldStatus === "VERIFIED" && newStatus === "IN_PROGRESS") {
    assert(actor.toLowerCase() === "owner", "Tugas VERIFIED hanya dapat dibuka kembali oleh the owner.");
  }

  task.lifecycle_status = newStatus;
  task.output_ref = clean(patch.output_ref ?? task.output_ref, 1000);
  task.evidence_ref = evidence;
  task.handoff_to = employeeIds.has(patch.handoff_to) ? patch.handoff_to : (patch.handoff_to === "" ? "" : task.handoff_to);
  task.approval_required = patch.approval_required ?? task.approval_required;
  task.updated_at = clock();

  next.events.push(makeEvent(task.id, newStatus === oldStatus ? "TASK_DETAILS_UPDATED" : "STATUS_CHANGED", {
    actor,
    oldStatus,
    newStatus,
    source: patch.source,
    evidenceRef: evidence,
  }, clock, idFactory));
  next.updated_at = task.updated_at;
  return next;
}

export function validateRegistry(registry) {
  assert(registry && typeof registry === "object", "Registry harus berupa object.");
  assert(registry.version === 1, "Versi registry tidak didukung.");
  assert(Array.isArray(registry.tasks) && Array.isArray(registry.events), "Registry tidak lengkap.");
  for (const task of registry.tasks) {
    assert(clean(task.id), "Task ID kosong.");
    assert(clean(task.title), "Judul task kosong.");
    assert(employeeIds.has(task.assignee_id), "Task memiliki assignee tidak dikenal.");
    assert(STATUSES.includes(task.lifecycle_status), "Task memiliki status tidak dikenal.");
    if (task.execution_mode === "HERMES") {
      assert(clean(task.runtime_ref, 200).startsWith("hermes-kanban:"), "Task Hermes tidak memiliki runtime reference valid.");
      assert(task.runtime_state === "BLOCKED" && task.lifecycle_status === "BLOCKED", "Task Hermes Phase 1 harus tetap BLOCKED.");
      const staged = registry.events.find((event) => event.task_id === task.id && event.action === "HERMES_TASK_STAGED" && event.actor === "adapter:hermes" && event.evidence_ref === task.runtime_ref);
      assert(staged, "Task Hermes tidak memiliki event staging yang valid.");
    }
  }
  return true;
}

export function loadRegistry(storage, key = "nyobakantorai-registry-v1") {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const registry = JSON.parse(raw);
  validateRegistry(registry);
  return registry;
}

export function saveRegistry(storage, registry, key = "nyobakantorai-registry-v1") {
  validateRegistry(registry);
  storage.setItem(key, JSON.stringify(registry));
}

export function importRegistry(text) {
  const parsed = JSON.parse(text);
  validateRegistry(parsed);
  return clone(parsed);
}
