import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const office = resolve(root, "office");
const checks = [];
const runtimeOnly = process.argv.includes("--runtime");
const add = (name, ok, detail, level = "required") => checks.push({ name, ok, detail, level });

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
add("Node.js 20+", nodeMajor >= 20, process.version);

function command(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

const git = command("git", ["--version"]);
add("Git", git.ok, git.ok ? git.stdout : "git command not available", runtimeOnly ? "optional" : "required");

let pythonCommand = "";
let pythonVersion = "";
for (const candidate of process.platform === "win32" ? ["python", "py"] : ["python3", "python"]) {
  const args = candidate === "py" ? ["-3", "-c", "import sys; print('.'.join(map(str,sys.version_info[:3])))"] : ["-c", "import sys; print('.'.join(map(str,sys.version_info[:3])))"];
  const result = command(candidate, args);
  if (result.ok) { pythonCommand = candidate; pythonVersion = result.stdout; break; }
}
const [pyMajor = 0, pyMinor = 0] = pythonVersion.split(".").map(Number);
add("Python 3.10+", Boolean(pythonCommand) && (pyMajor > 3 || (pyMajor === 3 && pyMinor >= 10)), pythonCommand ? `${pythonCommand} ${pythonVersion}` : "python command not available", runtimeOnly ? "optional" : "required");

if (pythonCommand) {
  const args = pythonCommand === "py" ? ["-3", "-c", "import yaml; print(yaml.__version__)"] : ["-c", "import yaml; print(yaml.__version__)"];
  const yaml = command(pythonCommand, args);
  add("PyYAML", yaml.ok, yaml.ok ? `PyYAML ${yaml.stdout}` : "install with: python -m pip install -r requirements-dev.txt", runtimeOnly ? "optional" : "required");
} else {
  add("PyYAML", false, "Python is unavailable", runtimeOnly ? "optional" : "required");
}

for (const rel of [
  "package.json", "office/package.json", "office/server.mjs",
  "office/src/asset-manifest.json", "packages/runtime-adapter/index.mjs",
  "README.md", "SECURITY.md", "config/employees.json", "config/capabilities.json", "config/real-task-recorder.json", "config/provider-doctor.json", "packages/real-task-recorder/index.mjs", "packages/provider-doctor/index.mjs", "office/workforce.mjs", "office/src/workforce.generated.css",
]) add(`Required file: ${rel}`, existsSync(resolve(root, rel)), rel);

try {
  const manifest = JSON.parse(readFileSync(resolve(office, "src/asset-manifest.json"), "utf8"));
  const good = manifest.schema === 3 && manifest.license === "MIT" && Array.isArray(manifest.assets) && manifest.assets.length === 54;
  add("Character asset manifest", good, good ? "schema 3 · 54 owner-authored sprites" : "unexpected asset manifest");
} catch {
  add("Character asset manifest", false, "cannot parse asset manifest");
}

try {
  const workforce = JSON.parse(readFileSync(resolve(root, "config/employees.json"), "utf8"));
  const caps = JSON.parse(readFileSync(resolve(root, "config/capabilities.json"), "utf8"));
  const good = workforce.version === "0.3.0"
    && workforce.employee_count === workforce.employees?.length
    && workforce.employees.length >= 16
    && caps.default_mode === "GUARDED"
    && Array.isArray(caps.capabilities);
  add("Workforce registry", good, `${workforce.employees?.length || 0} employees · ${workforce.version || "unknown"} · autonomy ${caps.default_mode || "unknown"}`);
} catch {
  add("Workforce registry", false, "cannot parse workforce/capability registry");
}

const requestedPort = Number.parseInt(process.env.NYOBAKANTORAI_PORT || "4322", 10);
const validPort = Number.isInteger(requestedPort) && requestedPort > 1023 && requestedPort < 65536;
if (!validPort) {
  add("Office port", false, `invalid NYOBAKANTORAI_PORT: ${process.env.NYOBAKANTORAI_PORT || ""}`);
} else {
  const free = await new Promise((done) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => done(false));
    probe.listen(requestedPort, "127.0.0.1", () => probe.close(() => done(true)));
  });
  add("Office port", free, free ? `127.0.0.1:${requestedPort} available` : `127.0.0.1:${requestedPort} is already in use; set NYOBAKANTORAI_PORT to another free port before npm start`, "optional");
}

const hermesDisabled = /^(1|true|yes)$/i.test(process.env.NYOBAKANTORAI_DISABLE_HERMES || "");
const explicitHermesExe = process.env.NYOBAKANTORAI_HERMES_EXE || "";
const explicitHermesHome = process.env.NYOBAKANTORAI_HERMES_HOME || "";
if (hermesDisabled) {
  add("Optional Hermes", true, "explicitly disabled", "optional");
} else if (explicitHermesExe || explicitHermesHome) {
  add("Optional Hermes", (!explicitHermesExe || existsSync(explicitHermesExe)) && (!explicitHermesHome || existsSync(explicitHermesHome)), "explicit Hermes paths checked", "optional");
} else {
  add("Optional Hermes", true, "not required; standalone mode is supported", "optional");
}

const failures = checks.filter((c) => c.level === "required" && !c.ok);
if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify({ ok: failures.length === 0, mode: runtimeOnly ? "runtime" : "release", checks }, null, 2) + "\n");
} else {
  for (const c of checks) {
    const mark = c.ok ? "PASS" : c.level === "optional" ? "WARN" : "FAIL";
    console.log(`${mark.padEnd(4)}  ${c.name} — ${c.detail}`);
  }
  console.log(failures.length ? `\nPreflight failed: ${failures.length} required check(s).` : "\nPreflight passed: this machine is ready for nyobakantorai.");
}
if (failures.length) process.exitCode = 1;
