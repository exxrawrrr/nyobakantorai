import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { readFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
import { EMPLOYEE_IDS } from "../office/workforce.mjs";

const root = resolve(import.meta.dirname, "..");
const office = resolve(root, "office");
const stopFile = resolve(office, ".nyobakantorai-stop-token");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitFor(url, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      last = new Error(`HTTP ${response.status}`);
    } catch (error) {
      last = error;
    }
    await sleep(100);
  }
  throw last || new Error("Server did not become ready.");
}

async function waitForExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null) return child.exitCode;
  return await Promise.race([
    new Promise((resolveExit) => child.once("exit", (code) => resolveExit(code))),
    sleep(timeoutMs).then(() => { throw new Error("Server did not stop cleanly."); }),
  ]);
}

async function fileExists(path) {
  try { await access(path, fsConstants.F_OK); return true; }
  catch { return false; }
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
let stdout = "";
let stderr = "";

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: office,
  env: {
    ...process.env,
    NYOBAKANTORAI_PORT: String(port),
    NYOBAKANTORAI_DISABLE_HERMES: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-12000); });
child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-12000); });

try {
  const healthResponse = await waitFor(base + "/api/health");
  assert.match(healthResponse.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(healthResponse.headers.get("cache-control"), "no-store");
  const health = await healthResponse.json();
  assert.deepEqual(health, { ok: true, app: "nyobakantorai", mode: "LOCAL_ONLY", dispatch: false });

  const capsResponse = await fetch(base + "/api/capabilities");
  assert.equal(capsResponse.status, 200);
  const caps = await capsResponse.json();
  assert.equal(caps.runtime_adapter_api, 1);
  assert.equal(caps.local_only, true);
  assert.equal(caps.dispatch, false);
  assert.equal(caps.human_approval_gate, true);
  assert.equal(caps.runtime_adapter, "none");
  assert.deepEqual(caps.employees, EMPLOYEE_IDS);
  assert.equal(caps.workforce_version, "0.3.0");
  assert.equal(caps.autonomy_default, "GUARDED");
  assert.ok(caps.autonomy_modes.includes("OBSERVE") && caps.autonomy_modes.includes("DELEGATED"));
  assert.ok(caps.capability_states.includes("NOT_CONNECTED"));
  assert.ok(caps.external_capability_catalog.some((item) => item.id === "ads.meta.write"));
  assert.ok(caps.external_capability_catalog.some((item) => item.id === "ads.google.write"));
  const workforceResponse = await fetch(base + "/api/workforce");
  assert.equal(workforceResponse.status, 200);
  const workforce = await workforceResponse.json();
  assert.equal(workforce.employees.length, EMPLOYEE_IDS.length);
  assert.ok(workforce.employees.length >= 16);
  const maya = workforce.employees.find((person) => person.id === "maya");
  assert.equal(maya.asset_status, "pending-original-art");
  assert.equal(maya.capability_state["ads.meta.write"], "NOT_CONNECTED");

  const runtimeResponse = await fetch(base + "/api/runtime");
  assert.equal(runtimeResponse.status, 200);
  const runtime = await runtimeResponse.json();
  assert.equal(runtime.mode, "READ_ONLY / VALIDATE_ONLY");
  assert.equal(runtime.hermes.configured, false);
  assert.equal(runtime.dispatch.enabled, false);
  assert.equal(runtime.dispatch.state, "BLOCKED");

  const home = await fetch(base + "/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") || "", /^text\/html/);
  assert.match(await home.text(), /nyobakantorai/i);

  const sprite = await fetch(base + "/assets/generated/characters/praroro/idle.png");
  assert.equal(sprite.status, 200);
  assert.equal(sprite.headers.get("content-type"), "image/png");
  assert.ok((await sprite.arrayBuffer()).byteLength > 1000);

  const wrongMethod = await fetch(base + "/api/capabilities", { method: "POST" });
  assert.equal(wrongMethod.status, 405);

  const unknown = await fetch(base + "/api/definitely-not-a-route");
  assert.equal(unknown.status, 404);

  for (let i = 0; i < 50 && !(await fileExists(stopFile)); i += 1) await sleep(50);
  assert.equal(await fileExists(stopFile), true, "Stop token must exist only while the server is running.");
  const token = (await readFile(stopFile, "utf8")).trim();
  assert.match(token, /^[a-f0-9]{48}$/);

  const stop = await fetch(base + "/api/admin/stop", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Origin: base },
  });
  assert.equal(stop.status, 202);
  await waitForExit(child);
  for (let i = 0; i < 40 && (await fileExists(stopFile)); i += 1) await sleep(50);
  assert.equal(await fileExists(stopFile), false, "Stop token must be removed after clean shutdown.");

  console.log(`Smoke test passed on ${base}: health, capabilities, runtime, UI, sprite, security headers, method guards, and clean shutdown.`);
} catch (error) {
  if (child.exitCode === null) child.kill();
  console.error("Smoke test failed:", error?.stack || error);
  if (stdout) console.error("--- server stdout ---\n" + stdout);
  if (stderr) console.error("--- server stderr ---\n" + stderr);
  process.exitCode = 1;
}
