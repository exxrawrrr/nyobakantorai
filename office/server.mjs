import { createServer } from "node:http";
import { readFile, stat, writeFile, unlink } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHermesHome } from "./hermes-home.mjs";
import { createHermesRuntimeAdapter } from "./hermes-runtime-adapter.mjs";
import { randomBytes } from "node:crypto";
import { sanitizeRuntimeTask } from "./reconcile.mjs";
import { createRuntimeSnapshotCache } from "./runtime-cache.mjs";
import { WORKFORCE, EMPLOYEE_IDS, WORKFORCE_VERSION, CAPABILITY_STATES, AUTONOMY_MODES, DEFAULT_AUTONOMY, CAPABILITY_CATALOG } from "./workforce.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const root = join(projectRoot, "dist");
const requestedPort = Number.parseInt(process.env.NYOBAKANTORAI_PORT || "4322", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 1023 && requestedPort < 65536 ? requestedPort : 4322;
const hermesExe = process.env.NYOBAKANTORAI_HERMES_EXE || process.env.HERMES_EXE || "hermes";
const hermesDisabled = /^(1|true|yes)$/i.test(process.env.NYOBAKANTORAI_DISABLE_HERMES || "");
const hermesHome = hermesDisabled ? "" : resolveHermesHome();
const hermesEnabled = !hermesDisabled && Boolean(hermesHome);
const board = process.env.NYOBAKANTORAI_BOARD || "nyobakantorai";
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
const hermesRuntime = createHermesRuntimeAdapter({
  executable:hermesExe,
  hermesHome,
  board,
  employeeIds:EMPLOYEE_IDS,
  disabled:hermesDisabled,
});

async function employeeSnapshot() {
  const snapshot = await hermesRuntime.employeeSnapshot();
  return {
    profiles:snapshot.profiles.map((profile) => {
      const person = WORKFORCE.find((employee) => employee.id === profile.id);
      return {
        ...profile,
        external_capabilities:Object.fromEntries(
          (person?.external_capabilities || []).map((capability) => [capability, "NOT_CONNECTED"])
        ),
      };
    }),
    version:snapshot.version,
    checked_at:snapshot.checked_at,
  };
}

const EMPLOYEE_CACHE_TTL_MS = 8000;
const readEmployees = createRuntimeSnapshotCache(employeeSnapshot, {
  ttlMs: EMPLOYEE_CACHE_TTL_MS,
  cacheable: (value) => value?.version !== "unknown"
    && EMPLOYEE_IDS.every((id) => value?.profiles?.some((p) => p.id === id && p.profile_exists === true)),
});

async function runtimeSnapshot() {
  const employeesPending = readEmployees();
  const [runtime, employeesReading] = await Promise.all([
    hermesRuntime.runtimeSnapshot({ timeoutMs: 10_000, maxTasks: 500 }),
    employeesPending,
  ]);
  const { profiles, version } = employeesReading.snapshot;
  const descriptor = await hermesRuntime.describe(version);
  const employeeAgeMs = Math.max(0, Date.now() - Date.parse(employeesReading.snapshot.checked_at));
  const boardConnected = runtime.connected === true && Array.isArray(runtime.tasks);
  return {
    checked_at: runtime.checked_at || new Date().toISOString(), mode: "READ_ONLY / VALIDATE_ONLY",
    employee_snapshot_cache: {
      source: employeesReading.source, age_ms: employeeAgeMs,
      ttl_ms: EMPLOYEE_CACHE_TTL_MS, checked_at: employeesReading.snapshot.checked_at,
      stale: employeeAgeMs >= EMPLOYEE_CACHE_TTL_MS,
    },
    hermes: {
      configured: descriptor.configured,
      installed: descriptor.installed,
      version: version || descriptor.version,
      board: descriptor.board,
      board_connected: boardConnected,
      task_count: boardConnected ? runtime.tasks.length : null,
      adapter_id: runtime.adapter_id,
      adapter_state: runtime.state,
    },
    tasks: boardConnected ? runtime.tasks.map((task) => sanitizeRuntimeTask({
      id:task.id,
      assignee:task.assignee,
      status:task.state,
      created_by:"adapter:hermes",
      created_at:null,
      session_id:null,
      result:null,
    })).filter(Boolean) : null,
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
    && EMPLOYEE_IDS.every((id) => value.employees?.[id]?.profile_exists === true),
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
      json(response, 200, { app: "nyobakantorai", api: 1, runtime_adapter_api: 1, local_only: true, dispatch: false, runtime_adapter: hermesRuntime.configured ? hermesRuntime.adapter.id : "none", evidence_gated_verification: true, human_approval_gate: true, approval_risk_classes: ["EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"], workforce_version: WORKFORCE_VERSION, autonomy_default: DEFAULT_AUTONOMY, autonomy_modes: AUTONOMY_MODES, capability_states: CAPABILITY_STATES, external_capability_catalog: CAPABILITY_CATALOG, employees: EMPLOYEE_IDS, endpoints: ["/api/health", "/api/capabilities", "/api/workforce", "/api/runtime", "/api/worker/tasks"] }); return;
    }
    if (pathname === "/api/capabilities") throw new PublicError(405, "Method not allowed");
    if (pathname === "/api/workforce" && request.method === "GET") {
      assertLocal(request);
      json(response, 200, {
        schema: 1, version: WORKFORCE_VERSION, default_autonomy: "GUARDED",
        employees: WORKFORCE.map((person) => ({
          id: person.id, name: person.name, role: person.role, department: person.department,
          summary: person.summary, aliases: person.aliases, personality: person.personality,
          habits: person.habits, expertise: person.expertise, preferred_toolsets: person.preferred_toolsets,
          capability_state: Object.fromEntries(person.external_capabilities.map((capability) => [capability, "NOT_CONNECTED"])),
          approval_policy: person.approval_policy, verification_policy: person.verification_policy,
          asset_status: person.visual.asset_status, initials: person.visual.initials,
        })),
      }); return;
    }
    if (pathname === "/api/workforce") throw new PublicError(405, "Method not allowed");
    if (pathname === "/api/worker/tasks" && request.method === "GET") {
      assertLocal(request);
      try {
        const health = await fetch(workerBase + "/api/health", { signal: AbortSignal.timeout(1800) });
        if (!health.ok || (await health.json()).worker_alive !== true) throw new Error("Local worker is not running");
        const upstream = await fetch(workerBase + "/api/tasks", { signal: AbortSignal.timeout(3500) });
        if (!upstream.ok) throw new Error("Local worker unavailable");
        const data = await upstream.json();
        if (!Array.isArray(data.tasks) || data.mode !== "PUBLIC_ONLY_LOCAL_PILOT") throw new Error("Unexpected pilot response");
        const tasks = data.tasks.filter((t) => EMPLOYEE_IDS.includes(t.employee) && typeof t.id === "string")
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
  console.log(`Local-only · ${hermesRuntime.configured ? hermesRuntime.adapter.id : "no runtime adapter"} · dispatch disabled · ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MiB RSS`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(async () => { try { await unlink(stopFile); } catch {} process.exit(0); }));
