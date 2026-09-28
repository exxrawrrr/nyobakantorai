import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile, unlink } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHermesHome } from "./hermes-home.mjs";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { sanitizeRuntimeTask } from "./reconcile.mjs";
import { createRuntimeSnapshotCache } from "./runtime-cache.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const root = join(projectRoot, "dist");
const requestedPort = Number.parseInt(process.env.NYOBAKANTORAI_PORT || "4322", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 1023 && requestedPort < 65536 ? requestedPort : 4322;
const hermesExe = process.env.NYOBAKANTORAI_HERMES_EXE || process.env.HERMES_EXE || "hermes";
const hermesDisabled = /^(1|true|yes)$/i.test(process.env.NYOBAKANTORAI_DISABLE_HERMES || "");
const hermesHome = hermesDisabled ? "" : resolveHermesHome();
const hermesEnabled = !hermesDisabled && Boolean(hermesHome);
const board = process.env.NYOBAKANTORAI_BOARD || "nyobakantorai";
const employeeIds = ["praroro", "paijo", "subagjo", "alex", "sumiati", "siti"];
const execFileAsync = promisify(execFile);
const requestedWorkerPort = Number.parseInt(process.env.NYOBAKANTORAI_WORKER_PORT || "4333", 10);
const workerPort = Number.isInteger(requestedWorkerPort) && requestedWorkerPort > 1023 && requestedWorkerPort < 65536 ? requestedWorkerPort : 4333;
const workerBase = "http://127.0.0.1:" + workerPort;
const stopFile = join(projectRoot, ".nyobakantorai-stop-token");
const stopToken = randomBytes(24).toString("hex");
const allowedExtensions = new Set([".html", ".css", ".mjs", ".js", ".json", ".png", ".svg", ".webp"]);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const security = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src http://127.0.0.1:${workerPort}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

class PublicError extends Error { constructor(status, message) { super(message); this.status = status; } }
function assertLocal(request) {
  const host = request.headers.host || "";
  if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host)) throw new PublicError(403, "Localhost Host header required");
  const site = request.headers["sec-fetch-site"];
  if (site && !["same-origin", "none"].includes(site)) throw new PublicError(403, "Cross-site request rejected");
  const origin = request.headers.origin;
  if (origin) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new PublicError(403, "Invalid Origin header"); }
    if (parsed.protocol !== "http:" || parsed.host !== host) throw new PublicError(403, "Same-origin request required");
  }
}
function json(response, statusCode, value) {
  response.writeHead(statusCode, { ...security, "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}
async function runHermes(args) {
  if (!hermesEnabled) throw new Error("Hermes integration is not configured");
  const { stdout } = await execFileAsync(hermesExe, args, {
    env: { ...(hermesHome ? { HERMES_HOME: hermesHome } : {}), NO_COLOR: "1", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA },
    timeout: 15_000, maxBuffer: 1024 * 1024, windowsHide: true,
  });
  return stdout.trim();
}
function parseProfile(id, output) {
  const model = output.match(/^Model:\s+(.+)$/m)?.[1]?.trim() || "";
  const gateway = output.match(/^Gateway:\s+(.+)$/m)?.[1]?.trim().toLowerCase() || "unknown";
  return { id, profile_exists: true, model_configured: Boolean(model), gateway, presence: !model ? "NOT CONNECTED" : gateway === "running" ? "UNKNOWN" : "OFFLINE" };
}
async function employeeSnapshot() {
  if (!hermesEnabled) return { profiles: employeeIds.map((id) => ({ id, profile_exists: false, model_configured: false, gateway: "unknown", presence: "NOT CONNECTED" })), version: "not-configured", checked_at: new Date().toISOString() };
  const profiles = await Promise.all(employeeIds.map(async (id) => {
    try { return parseProfile(id, await runHermes(["-p", id, "profile", "show", id])); }
    catch { return { id, profile_exists: false, model_configured: false, gateway: "unknown", presence: "NOT CONNECTED" }; }
  }));
  let version = "unknown";
  try { version = (await runHermes(["--version"])).split(/\r?\n/, 1)[0]; } catch { /* keep UNKNOWN */ }
  return { profiles, version, checked_at: new Date().toISOString() };
}

const EMPLOYEE_CACHE_TTL_MS = 8000;
const readEmployees = createRuntimeSnapshotCache(employeeSnapshot, {
  ttlMs: EMPLOYEE_CACHE_TTL_MS,
  cacheable: (value) => value?.version !== "unknown"
    && employeeIds.every((id) => value?.profiles?.some((p) => p.id === id && p.profile_exists === true)),
});

async function runtimeSnapshot() {
  const employeesPending = readEmployees();
  let tasks = null;
  if (hermesEnabled) try { tasks = JSON.parse(await runHermes(["kanban", "--board", board, "list", "--json"])); } catch { /* keep UNKNOWN */ }
  const employeesReading = await employeesPending;
  const { profiles, version } = employeesReading.snapshot;
  const employeeAgeMs = Math.max(0, Date.now() - Date.parse(employeesReading.snapshot.checked_at));
  return {
    checked_at: new Date().toISOString(), mode: "READ_ONLY / VALIDATE_ONLY",
    employee_snapshot_cache: {
      source: employeesReading.source, age_ms: employeeAgeMs,
      ttl_ms: EMPLOYEE_CACHE_TTL_MS, checked_at: employeesReading.snapshot.checked_at,
      stale: employeeAgeMs >= EMPLOYEE_CACHE_TTL_MS,
    },
    hermes: { configured: hermesEnabled, installed: hermesEnabled && (version !== "unknown" || existsSync(hermesExe)), version, board, board_connected: Array.isArray(tasks), task_count: Array.isArray(tasks) ? tasks.length : null },
    tasks: Array.isArray(tasks) ? tasks.map(sanitizeRuntimeTask).filter(Boolean) : null,
    employees: Object.fromEntries(profiles.map((profile) => [profile.id, profile])),
    dispatch: { enabled: false, state: "BLOCKED", reason: "The office server has no dispatch endpoint and performs no model inference." },
  };
}

const RUNTIME_CACHE_TTL_MS = 1500;
const readRuntimeSnapshot = createRuntimeSnapshotCache(runtimeSnapshot, {
  ttlMs: RUNTIME_CACHE_TTL_MS,
  cacheable: (value) => value?.hermes?.board_connected === true
    && Array.isArray(value?.tasks)
    && value.employee_snapshot_cache?.stale === false
    && employeeIds.every((id) => value.employees?.[id]?.profile_exists === true),
});

const server = createServer(async (request, response) => {
  try {
    if (!request.url) throw new PublicError(400, "Missing URL");
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    if (pathname === "/api/health" && request.method === "GET") {
      assertLocal(request); json(response, 200, { ok: true, app: "nyobakantorai", mode: "LOCAL_ONLY", dispatch: false }); return;
    }
    if (pathname === "/api/capabilities" && request.method === "GET") {
      assertLocal(request);
      json(response, 200, { app: "nyobakantorai", api: 1, runtime_adapter_api: 1, local_only: true, dispatch: false, runtime_adapter: hermesEnabled ? "hermes-readonly" : "none", evidence_gated_verification: true, human_approval_gate: true, approval_risk_classes: ["EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"], employees: employeeIds, endpoints: ["/api/health", "/api/capabilities", "/api/runtime", "/api/worker/tasks"] }); return;
    }
    if (pathname === "/api/capabilities") throw new PublicError(405, "Method not allowed");
    if (pathname === "/api/worker/tasks" && request.method === "GET") {
      assertLocal(request);
      try {
        const health = await fetch(workerBase + "/api/health", { signal: AbortSignal.timeout(1800) });
        if (!health.ok || (await health.json()).worker_alive !== true) throw new Error("Local worker is not running");
        const upstream = await fetch(workerBase + "/api/tasks", { signal: AbortSignal.timeout(3500) });
        if (!upstream.ok) throw new Error("Local worker unavailable");
        const data = await upstream.json();
        if (!Array.isArray(data.tasks) || data.mode !== "PUBLIC_ONLY_LOCAL_PILOT") throw new Error("Unexpected pilot response");
        const tasks = data.tasks.filter((t) => employeeIds.includes(t.employee) && typeof t.id === "string")
          .slice(-30).map((t) => ({
            id: t.id.slice(0, 32), employee: t.employee,
            state: ["QUEUED","RUNNING","RESULT_READY","FAILED","INTERRUPTED"].includes(t.state) ? t.state : "UNKNOWN",
            prompt: typeof t.prompt === "string" ? t.prompt.slice(0, 180) : "",
            result: typeof t.result === "string" ? t.result.slice(0, 240) : "",
            review_of: typeof t.review_of === "string" ? t.review_of.slice(0, 32) : null,
            created_at: t.created_at, completed_at: t.completed_at,
          }));
        json(response, 200, { connected: true, source: "PUBLIC_PILOT_NOT_OFFICIAL_KANBAN", tasks });
      } catch {
        json(response, 200, { connected: false, source: "PUBLIC_PILOT_NOT_OFFICIAL_KANBAN", tasks: [] });
      }
      return;
    }
    if (pathname === "/api/worker/tasks") throw new PublicError(405, "Method not allowed");
    if (pathname === "/api/runtime" && request.method === "GET") {
      assertLocal(request);
      const reading = await readRuntimeSnapshot();
      json(response, 200, {
        ...reading.snapshot,
        employee_snapshot_cache: {
          ...reading.snapshot.employee_snapshot_cache,
          age_ms: Math.max(0, Date.now() - Date.parse(reading.snapshot.employee_snapshot_cache.checked_at)),
          stale: Date.now() - Date.parse(reading.snapshot.employee_snapshot_cache.checked_at) >= EMPLOYEE_CACHE_TTL_MS,
        },
        snapshot_cache: { source: reading.source, age_ms: reading.age_ms,
          ttl_ms: RUNTIME_CACHE_TTL_MS, stale: false },
      });
      return;
    }
    if (pathname === "/api/runtime") throw new PublicError(405, "Method not allowed");
    if (pathname === "/api/admin/stop" && request.method === "POST") {
      assertLocal(request);
      if (request.headers.authorization !== `Bearer ${stopToken}`) throw new PublicError(401, "Stop token required");
      json(response, 202, { stopping: true });
      setTimeout(() => server.close(async () => { try { await unlink(stopFile); } catch {} process.exit(0); }), 25);
      return;
    }
    if (pathname.startsWith("/api/")) throw new PublicError(404, "API route not found");
    if (!["GET", "HEAD"].includes(request.method)) throw new PublicError(405, "Method not allowed");
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const segments = relative.split("/");
    if (segments.some((part) => !part || part === "." || part === ".." || part.startsWith(".") || part.includes("\\") || part.includes(":"))) throw new PublicError(404, "Not found");
    const resolvedRoot = resolve(root);
    const file = resolve(root, ...segments);
    if (!file.startsWith(`${resolvedRoot}${sep}`) || !allowedExtensions.has(extname(file).toLowerCase())) throw new PublicError(404, "Not found");
    const info = await stat(file);
    if (!info.isFile()) throw new PublicError(404, "Not found");
    const body = await readFile(file);
    response.writeHead(200, { ...security, "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    const status = error instanceof PublicError ? error.status : 500;
    if (request.url?.startsWith("/api/")) json(response, status, { error: error instanceof PublicError ? error.message : "Internal request failure" });
    else response.writeHead(status === 500 ? 404 : status, { ...security, "Content-Type": "text/plain; charset=utf-8" }).end(status === 403 ? "Forbidden" : "Not found");
  }
});

server.listen(port, "127.0.0.1", async () => {
  await writeFile(stopFile, stopToken, { encoding: "utf8", mode: 0o600 });
  console.log(`nyobakantorai: http://127.0.0.1:${port}`);
  console.log(`Local-only · read-only Hermes adapter · dispatch disabled · ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MiB RSS`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(async () => { try { await unlink(stopFile); } catch {} process.exit(0); }));
