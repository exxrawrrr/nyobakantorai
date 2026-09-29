import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { defineRuntimeAdapter, snapshotRuntime } from "../packages/runtime-adapter/index.mjs";

const execFileAsync = promisify(execFile);

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

function safeEnv(hermesHome) {
  return {
    ...(hermesHome ? { HERMES_HOME:hermesHome } : {}),
    NO_COLOR:"1",
    PATH:process.env.PATH,
    SystemRoot:process.env.SystemRoot,
    TEMP:process.env.TEMP,
    TMP:process.env.TMP,
    HOME:process.env.HOME,
    USERPROFILE:process.env.USERPROFILE,
    APPDATA:process.env.APPDATA,
    LOCALAPPDATA:process.env.LOCALAPPDATA,
  };
}

function emptyProfile(id) {
  return Object.freeze({
    id,
    profile_exists:false,
    model_configured:false,
    gateway:"unknown",
    presence:"NOT CONNECTED",
  });
}

function parseProfile(id, output) {
  const text = String(output ?? "");
  const model = text.match(/^Model:\s+(.+)$/m)?.[1]?.trim() || "";
  const gateway = text.match(/^Gateway:\s+(.+)$/m)?.[1]?.trim().toLowerCase() || "unknown";
  return Object.freeze({
    id,
    profile_exists:true,
    model_configured:Boolean(model),
    gateway,
    presence:!model ? "NOT CONNECTED" : gateway === "running" ? "UNKNOWN" : "OFFLINE",
  });
}

export function createHermesRuntimeAdapter({
  executable = "hermes",
  hermesHome = "",
  board = "nyobakantorai",
  employeeIds = [],
  disabled = false,
  commandTimeoutMs = 15_000,
  execFileImpl = execFileAsync,
  existsImpl = existsSync,
} = {}) {
  const exe = clean(executable, 512);
  const boardName = clean(board, 120);
  if (!Array.isArray(employeeIds)) throw new TypeError("employeeIds must be an array.");
  const ids = Object.freeze([...employeeIds].map((id) => clean(id, 80).toLowerCase()).filter(Boolean));
  const configured = !disabled && Boolean(clean(hermesHome, 2000));

  if (!exe) throw new TypeError("Hermes executable is required.");
  if (!boardName) throw new TypeError("Hermes board is required.");
  if (!Number.isInteger(commandTimeoutMs) || commandTimeoutMs < 100 || commandTimeoutMs > 30_000) {
    throw new TypeError("commandTimeoutMs must be 100..30000.");
  }

  const run = async (args) => {
    if (!configured) throw new Error("Hermes integration is not configured");
    const { stdout } = await execFileImpl(exe, [...args], {
      env:safeEnv(hermesHome),
      timeout:commandTimeoutMs,
      maxBuffer:1024 * 1024,
      windowsHide:true,
      shell:false,
      encoding:"utf8",
    });
    return String(stdout ?? "").trim();
  };

  const readVersion = async () => {
    if (!configured) return "not-configured";
    try {
      return (await run(["--version"])).split(/\r?\n/, 1)[0] || "unknown";
    } catch {
      return "unknown";
    }
  };

  const listProfiles = async () => {
    if (!configured) return ids.map(emptyProfile);
    return Promise.all(ids.map(async (id) => {
      try {
        return parseProfile(id, await run(["-p", id, "profile", "show", id]));
      } catch {
        return emptyProfile(id);
      }
    }));
  };

  const adapter = defineRuntimeAdapter({
    id:"hermes-readonly",
    label:"Hermes read-only runtime",
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
      return configured
        ? { ok:true, state:"CONFIGURED" }
        : { ok:false, state:"NOT_CONFIGURED" };
    },
    async listTasks() {
      const parsed = JSON.parse(await run(["kanban","--board",boardName,"list","--json"]));
      if (!Array.isArray(parsed)) throw new TypeError("Hermes kanban must return a JSON array.");
      return parsed.map((task) => ({
        id:task?.id,
        assignee:task?.assignee,
        state:task?.status,
        title:task?.title,
        updated_at:task?.updated_at,
        evidence_ref:task?.evidence_ref,
      }));
    },
  });

  return Object.freeze({
    adapter,
    configured,
    board:boardName,
    async employeeSnapshot() {
      const [profiles, version] = await Promise.all([listProfiles(), readVersion()]);
      return Object.freeze({
        profiles:Object.freeze(profiles),
        version,
        checked_at:new Date().toISOString(),
      });
    },
    async runtimeSnapshot(options = {}) {
      return snapshotRuntime(adapter, options);
    },
    async describe(knownVersion = null) {
      const version = clean(knownVersion, 240) || await readVersion();
      return Object.freeze({
        configured,
        installed:configured && (version !== "unknown" || Boolean(existsImpl(exe))),
        version,
        board:boardName,
      });
    },
  });
}
