import { basename } from "node:path";

const SLUG = /^[a-z][a-z0-9-]{1,63}$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,119}$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1","localhost","[::1]"]);

const clean = (value, max = 512) => String(value ?? "").trim().slice(0, max);
const unique = (values) => [...new Set(values)];

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function executableBasename(value) {
  const raw = clean(value, 2048).replaceAll("\\", "/");
  const name = raw.split("/").pop() || basename(raw);
  return name.toLowerCase();
}

function normalizedStringList(value, label, max = 128) {
  assert(Array.isArray(value), `${label} must be an array`);
  const items = unique(value.map((item) => clean(item, max)).filter(Boolean));
  assert(items.length === value.filter((item) => clean(item, max)).length, `${label} must not contain duplicates/empty values`);
  return Object.freeze(items);
}

export function defineAdapterPermissionPolicy(spec = {}) {
  assert(spec && typeof spec === "object" && !Array.isArray(spec), "permission policy must be an object");
  const id = clean(spec.id, 64).toLowerCase();
  assert(SLUG.test(id), "permission policy id must be a lowercase slug");

  const adapterIds = normalizedStringList(spec.adapter_ids || [], "adapter_ids", 64).map((item) => item.toLowerCase());
  assert(adapterIds.length > 0, "adapter_ids must not be empty");
  for (const adapterId of adapterIds) assert(SLUG.test(adapterId), `invalid adapter id in policy: ${adapterId}`);

  const executableBasenames = normalizedStringList(spec.executable_basenames || [], "executable_basenames", 255)
    .map((item) => item.toLowerCase());
  const allowedEnvKeys = normalizedStringList(spec.allowed_env_keys || [], "allowed_env_keys", 120);
  for (const key of allowedEnvKeys) assert(ENV_KEY.test(key), `invalid allowed env key: ${key}`);

  const maxTimeoutMs = Number(spec.max_timeout_ms);
  const maxBufferBytes = Number(spec.max_buffer_bytes);
  const maxTasks = Number(spec.max_tasks);
  assert(Number.isInteger(maxTimeoutMs) && maxTimeoutMs >= 1 && maxTimeoutMs <= 30_000, "max_timeout_ms must be 1..30000");
  assert(Number.isInteger(maxBufferBytes) && maxBufferBytes >= 0 && maxBufferBytes <= 4 * 1024 * 1024, "max_buffer_bytes must be 0..4194304");
  assert(Number.isInteger(maxTasks) && maxTasks >= 1 && maxTasks <= 500, "max_tasks must be 1..500");

  const loopbackHosts = normalizedStringList(spec.loopback_hosts || [], "loopback_hosts", 255).map((item) => item.toLowerCase());
  const allowedProtocols = normalizedStringList(spec.allowed_protocols || [], "allowed_protocols", 32).map((item) => item.toLowerCase());
  if (spec.loopback_only === true) {
    assert(loopbackHosts.length > 0, "loopback_only policy requires loopback_hosts");
    for (const host of loopbackHosts) assert(LOOPBACK_HOSTS.has(host), `non-loopback host forbidden in loopback policy: ${host}`);
  }

  return Object.freeze({
    schema:1,
    id,
    adapter_ids:Object.freeze(adapterIds),
    executable_basenames:Object.freeze(executableBasenames),
    allowed_env_keys:Object.freeze(allowedEnvKeys),
    max_timeout_ms:maxTimeoutMs,
    max_buffer_bytes:maxBufferBytes,
    max_tasks:maxTasks,
    require_shell_false:spec.require_shell_false !== false,
    loopback_only:spec.loopback_only === true,
    loopback_hosts:Object.freeze(loopbackHosts),
    allowed_protocols:Object.freeze(allowedProtocols),
    allow_redirects:spec.allow_redirects === true,
  });
}

export function validateAdapterPolicyCatalog(catalog = {}) {
  const errors = [];
  if (catalog?.schema !== 1) errors.push("catalog schema must be 1");
  if (!Array.isArray(catalog?.policies)) return { ok:false, errors:["policies must be an array"], policies:[] };

  const ids = new Set();
  const policies = [];
  for (const raw of catalog.policies) {
    try {
      const policy = defineAdapterPermissionPolicy(raw);
      if (ids.has(policy.id)) errors.push(`duplicate policy id: ${policy.id}`);
      ids.add(policy.id);
      policies.push(policy);
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }
  return Object.freeze({ ok:errors.length === 0, errors:Object.freeze(errors), policies:Object.freeze(policies) });
}

export function findAdapterPermissionPolicy(catalog, policyId) {
  const checked = validateAdapterPolicyCatalog(catalog);
  if (!checked.ok) throw new TypeError(`invalid adapter policy catalog: ${checked.errors.join("; ")}`);
  const id = clean(policyId, 64).toLowerCase();
  const policy = checked.policies.find((item) => item.id === id);
  if (!policy) throw new TypeError(`unknown adapter permission policy: ${id}`);
  return policy;
}

function assertAdapterId(policy, adapterId) {
  const id = clean(adapterId, 64).toLowerCase();
  assert(policy.adapter_ids.includes(id), `adapter id ${id || "(empty)"} is not allowed by policy ${policy.id}`);
}

export function authorizeCliAdapterConfig(policyInput, {
  adapterId,
  executable,
  envKeys = [],
  timeoutMs,
  maxBufferBytes,
  shell = false,
} = {}) {
  const policy = policyInput?.schema === 1 && Array.isArray(policyInput.adapter_ids)
    ? defineAdapterPermissionPolicy(policyInput)
    : defineAdapterPermissionPolicy(policyInput || {});
  assertAdapterId(policy, adapterId);

  const exe = clean(executable, 2048);
  assert(exe, "executable is required by adapter permission policy");
  const exeBase = executableBasename(exe);
  if (policy.executable_basenames.length) {
    assert(policy.executable_basenames.includes(exeBase), `executable ${exeBase} is not allowed by policy ${policy.id}`);
  }

  const keys = unique((Array.isArray(envKeys) ? envKeys : []).map((item) => clean(item, 120)).filter(Boolean));
  for (const key of keys) {
    assert(ENV_KEY.test(key), `invalid environment key: ${key}`);
    assert(policy.allowed_env_keys.includes(key), `environment key ${key} is not allowed by policy ${policy.id}`);
  }

  assert(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= policy.max_timeout_ms,
    `timeout exceeds policy ${policy.id} maximum`);
  assert(Number.isInteger(maxBufferBytes) && maxBufferBytes >= 0 && maxBufferBytes <= policy.max_buffer_bytes,
    `buffer exceeds policy ${policy.id} maximum`);
  if (policy.require_shell_false) assert(shell === false, `shell execution is forbidden by policy ${policy.id}`);

  return Object.freeze({
    allowed:true,
    policy_id:policy.id,
    adapter_id:clean(adapterId,64).toLowerCase(),
    executable_basename:exeBase,
    max_tasks:policy.max_tasks,
  });
}

export function authorizeHttpAdapterConfig(policyInput, {
  adapterId,
  baseUrl,
  method = "GET",
  redirect = "error",
  timeoutMs = 2_000,
  maxTasks = 100,
} = {}) {
  const policy = policyInput?.schema === 1 && Array.isArray(policyInput.adapter_ids)
    ? defineAdapterPermissionPolicy(policyInput)
    : defineAdapterPermissionPolicy(policyInput || {});
  assertAdapterId(policy, adapterId);

  let url;
  try { url = new URL(String(baseUrl || "")); }
  catch { throw new TypeError("baseUrl must be a valid URL"); }

  const host = url.hostname.toLowerCase();
  const protocol = url.protocol.toLowerCase();
  if (policy.loopback_only) assert(policy.loopback_hosts.includes(host), `host ${host} is not allowed by policy ${policy.id}`);
  if (policy.allowed_protocols.length) assert(policy.allowed_protocols.includes(protocol), `protocol ${protocol} is not allowed by policy ${policy.id}`);
  assert(String(method).toUpperCase() === "GET", `HTTP method is not allowed by policy ${policy.id}`);
  if (!policy.allow_redirects) assert(redirect === "error", `redirects are forbidden by policy ${policy.id}`);
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= policy.max_timeout_ms,
    `timeout exceeds policy ${policy.id} maximum`);
  assert(Number.isInteger(maxTasks) && maxTasks >= 1 && maxTasks <= policy.max_tasks,
    `maxTasks exceeds policy ${policy.id} maximum`);

  return Object.freeze({
    allowed:true,
    policy_id:policy.id,
    adapter_id:clean(adapterId,64).toLowerCase(),
    host,
    protocol,
    max_tasks:policy.max_tasks,
  });
}
