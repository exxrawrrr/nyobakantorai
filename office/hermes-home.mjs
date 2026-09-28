import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveHermesHome({ env = process.env, platform = process.platform, home = homedir(), exists = existsSync } = {}) {
  const explicit = env.NYOBAKANTORAI_HERMES_HOME || env.HERMES_HOME;
  if (explicit) return explicit;
  const candidates = [];
  if (platform === "win32" && env.LOCALAPPDATA) candidates.push(join(env.LOCALAPPDATA, "hermes"));
  candidates.push(platform === "win32" ? join(home, ".hermes") : `${String(home).replace(/\/$/, "")}/.hermes`);
  return candidates.find((candidate) => exists(candidate)) || "";
}