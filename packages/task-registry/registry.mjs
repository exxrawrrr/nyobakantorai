import { WORKFORCE } from "../../lib/workforce.mjs";

export const EMPLOYEES = Object.freeze(WORKFORCE.map((person) => Object.freeze({
  id: person.id,
  name: person.name,
  role: person.role,
  focus: person.summary,
  accent: person.visual?.color || "slate",
})));

export const RISK_CLASSES = Object.freeze(["READ_ONLY", "LOCAL_WRITE", "EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"]);
export const APPROVAL_STATUSES = Object.freeze(["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"]);
const AUTO_APPROVAL_RISKS = new Set(["EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"]);

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
const employeePolicy = new Map(WORKFORCE.map((employee) => [employee.id, employee]));

function mayVerify(assigneeId, actorId) {
  if (!employeeIds.has(actorId) || actorId === assigneeId) return false;
  const policy = employeePolicy.get(assigneeId)?.verification_policy;
  return policy?.independent_required === true
    && policy?.self_verify === false
    && Array.isArray(policy.reviewer_candidates)
    && policy.reviewer_candidates.includes(actorId);
}

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
    execution_receipt_ref: "",
    risk_class: RISK_CLASSES.includes(input.risk_class) ? input.risk_class : "READ_ONLY",
    approval_required: false,
    approval_status: "NOT_REQUIRED",
    approval_actor: "",
    approval_at: "",
    approval_evidence_ref: "",
    handoff_to: employeeIds.has(input.handoff_to) ? input.handoff_to : "",
    execution_mode: "DEMO",
    runtime_ref: "",
    runtime_state: "NOT CONNECTED",
  };
  task.approval_required = AUTO_APPROVAL_RISKS.has(task.risk_class) || Boolean(input.approval_required);
  task.approval_status = task.approval_required ? "PENDING" : "NOT_REQUIRED";
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
  if (task.approval_required && ["IN_PROGRESS", "COMPLETED", "VERIFIED"].includes(newStatus)) {
    assert(task.approval_status === "APPROVED", "Owner approval required before this task may execute.");
  }

  const actor = clean(patch.actor, 80) || "manual:owner";
  const evidence = clean(patch.evidence_ref ?? task.evidence_ref, 1000);
  if (newStatus === "VERIFIED") {
    const verifier = actor.toLowerCase();
    assert(verifier !== task.assignee_id, "A worker cannot independently verify its own work.");
    assert(mayVerify(task.assignee_id, verifier), "Status VERIFIED membutuhkan independent registry-approved reviewer.");
    assert(evidence, "Status VERIFIED membutuhkan evidence reference.");
  }
  if (oldStatus === "VERIFIED" && newStatus === "IN_PROGRESS") {
    assert(actor.toLowerCase() === "owner", "Tugas VERIFIED hanya dapat dibuka kembali oleh the owner.");
  }

  task.lifecycle_status = newStatus;
  task.output_ref = clean(patch.output_ref ?? task.output_ref, 1000);
  task.evidence_ref = evidence;
  task.handoff_to = employeeIds.has(patch.handoff_to) ? patch.handoff_to : (patch.handoff_to === "" ? "" : task.handoff_to);
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

export function attachExecutionReceipt(registry, taskId, receipt, clock = defaultClock, idFactory = defaultId) {
  validateRegistry(registry);
  const next = clone(registry);
  const task = next.tasks.find(({ id }) => id === taskId);
  assert(task, "Tugas tidak ditemukan.");
  const receiptRef = clean(receipt?.receipt_ref, 1000);
  assert(/^receipt:sha256:[a-f0-9]{64}$/.test(receiptRef), "Execution receipt reference tidak valid.");
  assert(
    !next.events.some((event) => event.action === "EXECUTION_RECEIPT_ATTACHED" && event.evidence_ref === receiptRef),
    "Execution receipt reference sudah pernah digunakan."
  );
  assert(task.lifecycle_status !== "VERIFIED", "Execution receipt tidak boleh ditempel setelah task VERIFIED tanpa reopen.");
  const actor = clean(receipt?.actor, 80).toLowerCase();
  assert(actor, "Execution receipt actor wajib diisi.");
  assert(actor === task.assignee_id || actor === "adapter:runtime", "Execution receipt hanya boleh direkam oleh assignee atau runtime adapter.");
  const at = clock();
  task.execution_receipt_ref = receiptRef;
  task.updated_at = at;
  next.events.push(makeEvent(task.id, "EXECUTION_RECEIPT_ATTACHED", {
    actor,
    oldStatus: task.lifecycle_status,
    newStatus: task.lifecycle_status,
    source: clean(receipt?.source, 240) || "signed execution receipt",
    evidenceRef: receiptRef,
  }, clock, idFactory));
  next.updated_at = at;
  validateRegistry(next);
  return next;
}

export function recordApproval(registry, taskId, decision, clock = defaultClock, idFactory = defaultId) {
  validateRegistry(registry);
  const next = clone(registry);
  const task = next.tasks.find(({ id }) => id === taskId);
  assert(task, "Tugas tidak ditemukan.");
  assert(task.execution_mode !== "HERMES", "Approval lokal tidak boleh mengubah klaim runtime Hermes.");
  const actor = clean(decision.actor, 80).toLowerCase();
  assert(actor === "owner" || actor === "manual:owner", "Only the owner may approve high-impact work.");
  const status = clean(decision.status, 20).toUpperCase();
  assert(["APPROVED", "REJECTED"].includes(status), "Approval decision must be APPROVED or REJECTED.");
  assert(task.approval_required, "Task does not require approval.");
  const at = clock();
  task.approval_status = status;
  task.approval_actor = "owner";
  task.approval_at = at;
  task.approval_evidence_ref = clean(decision.evidence_ref, 1000) || `local-approval:${task.id}:${at}`;
  task.updated_at = at;
  next.events.push(makeEvent(task.id, "APPROVAL_RECORDED", {
    actor: "owner",
    oldStatus: task.lifecycle_status,
    newStatus: task.lifecycle_status,
    source: clean(decision.source, 240) || "local approval",
    evidenceRef: task.approval_evidence_ref,
  }, clock, idFactory));
  next.updated_at = at;
  validateRegistry(next);
  return next;
}

export function validateRegistry(registry) {
  assert(registry && typeof registry === "object", "Registry harus berupa object.");
  assert(registry.version === 1, "Versi registry tidak didukung.");
  assert(Array.isArray(registry.tasks) && Array.isArray(registry.events), "Registry tidak lengkap.");

  const seenReceiptRefs = new Set();
  for (const event of registry.events) {
    if (event?.action !== "EXECUTION_RECEIPT_ATTACHED") continue;
    const ref = clean(event.evidence_ref, 1000);
    assert(/^receipt:sha256:[a-f0-9]{64}$/.test(ref), "Execution receipt attachment event memiliki reference tidak valid.");
    assert(!seenReceiptRefs.has(ref), "Execution receipt reference replay terdeteksi di event history.");
    seenReceiptRefs.add(ref);
  }

  for (const task of registry.tasks) {
    assert(clean(task.id), "Task ID kosong.");
    assert(clean(task.title), "Judul task kosong.");
    assert(employeeIds.has(task.assignee_id), "Task memiliki assignee tidak dikenal.");
    assert(STATUSES.includes(task.lifecycle_status), "Task memiliki status tidak dikenal.");
    assert(RISK_CLASSES.includes(task.risk_class || "READ_ONLY"), "Task memiliki risk class tidak dikenal.");
    assert(APPROVAL_STATUSES.includes(task.approval_status || "NOT_REQUIRED"), "Task memiliki approval status tidak dikenal.");
    if (AUTO_APPROVAL_RISKS.has(task.risk_class)) assert(task.approval_required === true, "High-impact task wajib membutuhkan approval.");
    if (task.approval_required && ["IN_PROGRESS", "COMPLETED", "VERIFIED"].includes(task.lifecycle_status)) {
      assert(task.approval_status === "APPROVED", "Task berisiko tinggi tidak boleh berjalan tanpa approval.");
    }
    if (clean(task.execution_receipt_ref, 1000)) {
      assert(/^receipt:sha256:[a-f0-9]{64}$/.test(task.execution_receipt_ref), "Task memiliki execution receipt reference tidak valid.");
      const receiptEvent = registry.events.find((event) =>
        event.task_id === task.id
        && event.action === "EXECUTION_RECEIPT_ATTACHED"
        && event.evidence_ref === task.execution_receipt_ref
      );
      assert(receiptEvent, "Task execution receipt harus memiliki append-only attachment event.");
    }
    if (task.lifecycle_status === "VERIFIED") {
      const verified = registry.events.find((event) =>
        event.task_id === task.id
        && event.action === "STATUS_CHANGED"
        && event.new_status === "VERIFIED"
        && clean(event.evidence_ref, 1000)
        && mayVerify(task.assignee_id, String(event.actor || "").toLowerCase())
      );
      assert(verified, "VERIFIED requires an independent reviewer evidence event.");
    }
    if (task.execution_mode === "HERMES") {
      assert(clean(task.runtime_ref, 200).startsWith("hermes-kanban:"), "Task Hermes tidak memiliki runtime reference valid.");
      assert(task.runtime_state === "BLOCKED" && task.lifecycle_status === "BLOCKED", "Task Hermes yang di-stage harus tetap BLOCKED sampai runtime tervalidasi.");
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
