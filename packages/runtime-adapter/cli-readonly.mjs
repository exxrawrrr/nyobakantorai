import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineRuntimeAdapter } from "./index.mjs";
import { authorizeCliAdapterConfig, defineAdapterPermissionPolicy } from "./policy.mjs";

const execFileAsync = promisify(execFile);
const BASE_ENV_KEYS = Object.freeze([
  "PATH",
  "SystemRoot",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
]);

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function clean(value, max = 512) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeArgs(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  assert(value.length <= 64, `${label} has too many arguments`);
  return Object.freeze(value.map((item) => {
    const text = String(item);
    assert(text.length <= 1024, `${label} argument is too long`);
    assert(!text.includes("\0") && !/[\r\n]/.test(text), `${label} argument contains forbidden control characters`);
    return text;
  }));
}

function buildEnv({ extraEnv = {}, allowedExtraEnvKeys = [] } = {}) {
  assert(extraEnv && typeof extraEnv === "object" && !Array.isArray(extraEnv), "extraEnv must be an object");
  assert(Array.isArray(allowedExtraEnvKeys), "allowedExtraEnvKeys must be an array");
  const allowed = new Set([...BASE_ENV_KEYS, ...allowedExtraEnvKeys.map((item) => clean(item, 120))].filter(Boolean));
  const env = {};

  for (const key of BASE_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }

  for (const [key, value] of Object.entries(extraEnv)) {
    assert(/^[A-Za-z_][A-Za-z0-9_]{0,119}$/.test(key), `invalid environment key: ${key}`);
    assert(allowed.has(key), `environment key not allowlisted: ${key}`);
    if (value === undefined || value === null) continue;
    const text = String(value);
    assert(!text.includes("\0"), `environment value contains NUL: ${key}`);
    env[key] = text;
  }

  return Object.freeze(env);
}

function parseJson(stdout, label) {
  const text = String(stdout ?? "").trim();
  if (!text) throw new TypeError(`${label} returned empty stdout`);
  try { return JSON.parse(text); }
  catch { throw new TypeError(`${label} must return JSON on stdout`); }
}

function healthState(body) {
  if (body?.state) return clean(body.state, 80).toUpperCase();
  if (body?.connected === true || body?.ok === true || body?.worker_alive === true) return "CONNECTED";
  return "NOT_CONNECTED";
}

export function createCliJsonAdapter({
  id = "cli-local",
  label = "Read-only CLI runtime",
  executable,
  healthArgs = [],
  tasksArgs = [],
  cwd = undefined,
  extraEnv = {},
  allowedExtraEnvKeys = [],
  commandTimeoutMs = 1_500,
  maxBufferBytes = 1024 * 1024,
  execFileImpl = execFileAsync,
  permissionPolicy = null,
} = {}) {
  const exe = clean(executable, 512);
  assert(exe, "executable is required");
  assert(!exe.includes("\0") && !/[\r\n]/.test(exe), "executable contains forbidden control characters");
  assert(typeof execFileImpl === "function", "execFileImpl must be a function");

  const health = normalizeArgs(healthArgs, "healthArgs");
  const tasks = normalizeArgs(tasksArgs, "tasksArgs");
  const rawEnv = buildEnv({ extraEnv, allowedExtraEnvKeys });
  const normalizedPermissionPolicy = permissionPolicy ? defineAdapterPermissionPolicy(permissionPolicy) : null;

  assert(Number.isInteger(commandTimeoutMs) && commandTimeoutMs > 0 && commandTimeoutMs <= 10_000, "commandTimeoutMs must be 1..10000");
  assert(Number.isInteger(maxBufferBytes) && maxBufferBytes >= 1024 && maxBufferBytes <= 4 * 1024 * 1024, "maxBufferBytes must be 1024..4194304");

  if (normalizedPermissionPolicy) {
    authorizeCliAdapterConfig(normalizedPermissionPolicy, {
      adapterId:id,
      executable:exe,
      envKeys:Object.keys(extraEnv),
      timeoutMs:commandTimeoutMs,
      maxBufferBytes,
      shell:false,
    });
  }

  const env = normalizedPermissionPolicy
    ? Object.freeze(Object.fromEntries(
        Object.entries(rawEnv).filter(([key]) => normalizedPermissionPolicy.allowed_env_keys.includes(key))
      ))
    : rawEnv;

  const runJson = async (args, purpose) => {
    const result = await execFileImpl(exe, [...args], {
      cwd,
      env,
      encoding:"utf8",
      windowsHide:true,
      shell:false,
      timeout:commandTimeoutMs,
      maxBuffer:maxBufferBytes,
    });
    return parseJson(result?.stdout, purpose);
  };

  return defineRuntimeAdapter({
    id,
    label,
    capabilities:{
      read_health:true,
      read_tasks:true,
      write:false,
      dispatch:false,
      external_write:false,
      paid_action:false,
      account_change:false,
      destructive:false,
    },
    async health() {
      const body = await runJson(health, "CLI health command");
      return {
        ok:Boolean(body?.ok === true || body?.connected === true || body?.worker_alive === true),
        state:healthState(body),
      };
    },
    async listTasks() {
      const body = await runJson(tasks, "CLI tasks command");
      if (Array.isArray(body)) return body;
      if (Array.isArray(body?.tasks)) return body.tasks;
      throw new TypeError("CLI tasks command must return an array or { tasks: [] }");
    },
  });
}
