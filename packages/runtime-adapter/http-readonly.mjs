import { defineRuntimeAdapter } from "./index.mjs";
import { authorizeHttpAdapterConfig } from "./policy.mjs";

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function cleanPath(value, fallback) {
  const path = String(value || fallback).trim();
  assert(path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !path.includes("://"), "Adapter endpoint must be a relative absolute path.");
  return path;
}

function parseLoopbackBaseUrl(value) {
  let url;
  try { url = new URL(String(value || "")); }
  catch { throw new TypeError("baseUrl must be a valid URL."); }
  assert(url.protocol === "http:", "Loopback HTTP adapter only permits http://.");
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Loopback HTTP adapter only permits localhost.");
  assert(!url.username && !url.password, "Credentials are not allowed in baseUrl.");
  assert(!url.search && !url.hash, "baseUrl must not include query or fragment.");
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

function stateFromBody(body, responseOk) {
  if (!responseOk) return "HTTP_ERROR";
  if (body?.state) return String(body.state).slice(0, 80).toUpperCase();
  if (body?.connected === true || body?.ok === true || body?.worker_alive === true) return "CONNECTED";
  return "NOT_CONNECTED";
}

export function createLoopbackHttpAdapter({
  id = "http-local",
  label = "Loopback HTTP runtime",
  baseUrl,
  healthPath = "/api/health",
  tasksPath = "/api/tasks",
  fetchImpl = globalThis.fetch,
  permissionPolicy = null,
  timeoutMs = 2_000,
  maxTasks = 100,
} = {}) {
  assert(typeof fetchImpl === "function", "fetch implementation is required.");
  const base = parseLoopbackBaseUrl(baseUrl);
  const healthEndpoint = new URL(cleanPath(healthPath, "/api/health"), base);
  const tasksEndpoint = new URL(cleanPath(tasksPath, "/api/tasks"), base);

  if (permissionPolicy) {
    authorizeHttpAdapterConfig(permissionPolicy, {
      adapterId:id,
      baseUrl:base.toString(),
      method:"GET",
      redirect:"error",
      timeoutMs,
      maxTasks,
    });
  }

  const readJson = async (url) => {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    let body = null;
    try { body = await response.json(); } catch { /* normalized by caller */ }
    return { response, body };
  };

  return defineRuntimeAdapter({
    id,
    label,
    capabilities: {
      read_health: true,
      read_tasks: true,
      write: false,
      dispatch: false,
      external_write: false,
      paid_action: false,
      account_change: false,
      destructive: false,
    },
    async health() {
      const { response, body } = await readJson(healthEndpoint);
      return {
        ok: response.ok && Boolean(body?.ok === true || body?.connected === true || body?.worker_alive === true),
        state: stateFromBody(body, response.ok),
      };
    },
    async listTasks() {
      const { response, body } = await readJson(tasksEndpoint);
      if (!response.ok) throw new Error("runtime tasks endpoint unavailable");
      if (Array.isArray(body)) return body;
      if (Array.isArray(body?.tasks)) return body.tasks;
      throw new TypeError("runtime tasks endpoint must return an array or { tasks: [] }");
    },
  });
}
