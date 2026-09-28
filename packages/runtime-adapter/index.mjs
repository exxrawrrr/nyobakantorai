export const RUNTIME_ADAPTER_API = 1;

const UNSAFE_CAPABILITIES = Object.freeze([
  "write",
  "dispatch",
  "external_write",
  "paid_action",
  "account_change",
  "destructive",
]);

const DEFAULT_CAPABILITIES = Object.freeze({
  read_health: true,
  read_tasks: true,
  write: false,
  dispatch: false,
  external_write: false,
  paid_action: false,
  account_change: false,
  destructive: false,
  execution_receipts: false,
  cost_receipts: false,
});

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function normalizedCapabilities(value = {}) {
  const caps = { ...DEFAULT_CAPABILITIES, ...(value || {}) };
  for (const key of UNSAFE_CAPABILITIES) {
    assert(caps[key] !== true, `Runtime Adapter SDK v1 is read-only; capability "${key}" is not allowed.`);
    caps[key] = false;
  }
  caps.read_health = caps.read_health !== false;
  caps.read_tasks = caps.read_tasks !== false;
  caps.execution_receipts = Boolean(caps.execution_receipts);
  caps.cost_receipts = Boolean(caps.cost_receipts);
  return Object.freeze(caps);
}

export function defineRuntimeAdapter(spec) {
  assert(spec && typeof spec === "object", "Adapter spec is required.");
  const id = clean(spec.id, 64).toLowerCase();
  assert(/^[a-z][a-z0-9-]{1,63}$/.test(id), "Adapter id must be a lowercase slug.");
  assert(typeof spec.health === "function", "Adapter health() is required.");
  assert(typeof spec.listTasks === "function", "Adapter listTasks() is required.");
  const capabilities = normalizedCapabilities(spec.capabilities);
  return Object.freeze({
    api: RUNTIME_ADAPTER_API,
    id,
    label: clean(spec.label || id, 120),
    capabilities,
    health: spec.health,
    listTasks: spec.listTasks,
  });
}

export function createNullAdapter(id = "none") {
  return defineRuntimeAdapter({
    id,
    label: "No runtime configured",
    capabilities: { read_tasks: false },
    async health() { return { ok: false, state: "NOT_CONFIGURED" }; },
    async listTasks() { return []; },
  });
}

function normalizeTask(task) {
  assert(task && typeof task === "object", "Runtime task must be an object.");
  const id = clean(task.id || task.task_id, 160);
  assert(id, "Runtime task id is required.");
  return Object.freeze({
    id,
    assignee: clean(task.assignee, 80),
    state: clean(task.state || task.status, 80).toUpperCase(),
    title: clean(task.title, 240),
    updated_at: clean(task.updated_at, 80),
    evidence_ref: clean(task.evidence_ref, 500),
  });
}

function timeoutError() {
  const error = new Error("Runtime adapter timeout");
  error.code = "ADAPTER_TIMEOUT";
  return error;
}

async function withTimeout(value, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function snapshotRuntime(adapter, options = {}) {
  assert(adapter?.api === RUNTIME_ADAPTER_API, "Unsupported runtime adapter.");
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? Math.min(options.timeoutMs, 10_000) : 2_000;
  const maxTasks = Number.isInteger(options.maxTasks) && options.maxTasks > 0 ? Math.min(options.maxTasks, 500) : 100;
  const checkedAt = new Date().toISOString();

  try {
    const health = await withTimeout(adapter.health(), timeoutMs);
    if (!health || health.ok !== true) {
      return Object.freeze({
        api: RUNTIME_ADAPTER_API,
        adapter_id: adapter.id,
        connected: false,
        state: clean(health?.state || "NOT_CONNECTED", 80).toUpperCase(),
        capabilities: adapter.capabilities,
        tasks: Object.freeze([]),
        checked_at: checkedAt,
      });
    }

    const rawTasks = adapter.capabilities.read_tasks
      ? await withTimeout(adapter.listTasks(), timeoutMs)
      : [];

    assert(Array.isArray(rawTasks), "Adapter listTasks() must return an array.");
    const tasks = Object.freeze(rawTasks.slice(0, maxTasks).map(normalizeTask));

    return Object.freeze({
      api: RUNTIME_ADAPTER_API,
      adapter_id: adapter.id,
      connected: true,
      state: clean(health.state || "CONNECTED", 80).toUpperCase(),
      capabilities: adapter.capabilities,
      tasks,
      checked_at: checkedAt,
    });
  } catch (error) {
    return Object.freeze({
      api: RUNTIME_ADAPTER_API,
      adapter_id: adapter.id,
      connected: false,
      state: "ERROR",
      error_category: error?.code === "ADAPTER_TIMEOUT" ? "TIMEOUT" : "ADAPTER_ERROR",
      capabilities: adapter.capabilities,
      tasks: Object.freeze([]),
      checked_at: checkedAt,
    });
  }
}
