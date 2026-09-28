import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profileIds = ["praroro","paijo","subagjo","alex","sumiati","siti"];
const argv = process.argv.slice(2);
const mode = argv.includes("--update") ? "update" : argv.includes("--check") ? "check" : "install";
const force = argv.includes("--force");
const json = argv.includes("--json");
const boardArg = argv.find((arg) => arg.startsWith("--board="));
const homeArg = argv.find((arg) => arg.startsWith("--home="));
const board = boardArg ? boardArg.slice("--board=".length) : (process.env.NYOBAKANTORAI_BOARD || "nyobakantorai");
const hermes = process.env.NYOBAKANTORAI_HERMES_EXE || "hermes";
const env = { ...process.env };
if (homeArg) env.HERMES_HOME = resolve(homeArg.slice("--home=".length));
else if (process.env.NYOBAKANTORAI_HERMES_HOME) env.HERMES_HOME = resolve(process.env.NYOBAKANTORAI_HERMES_HOME);

function run(args, allowFailure = false) {
  const r = spawnSync(hermes, args, { env, encoding: "utf8", windowsHide: true });
  if (r.error) {
    if (allowFailure) return { ok:false, code:null, stdout:"", stderr:r.error.message };
    throw new Error(`Unable to run Hermes (${hermes}): ${r.error.message}`);
  }
  const out = { ok:r.status === 0, code:r.status, stdout:String(r.stdout||"").trim(), stderr:String(r.stderr||"").trim() };
  if (!out.ok && !allowFailure) throw new Error(`Hermes command failed: ${args.join(" ")}\n${out.stderr || out.stdout}`);
  return out;
}

const version = run(["--version"], true);
if (!version.ok) {
  console.error("Hermes CLI is not available. Install it from https://github.com/NousResearch/hermes-agent or run the nyobakantorai installer with --with-hermes.");
  process.exit(2);
}

const results = [];
for (const id of profileIds) {
  const source = resolve(root, "hermes-profiles", id);
  if (!existsSync(resolve(source, "distribution.yaml"))) throw new Error(`Missing Hermes distribution for ${id}`);
  const show = run(["profile","show",id], true);
  if (mode === "check") {
    results.push({ profile:id, action:"check", ok:show.ok });
    continue;
  }
  if (show.ok && mode === "install" && !force) {
    results.push({ profile:id, action:"skip-existing", ok:true });
    continue;
  }
  if (show.ok && mode === "update" && !force) {
    const update = run(["profile","update",id], true);
    results.push({ profile:id, action:"update", ok:update.ok, detail:update.ok ? update.stdout : (update.stderr || update.stdout) });
    continue;
  }
  const args = ["profile","install",source,"-y"];
  if (force) args.push("--force");
  const install = run(args, true);
  results.push({ profile:id, action:force ? "force-install" : "install", ok:install.ok, detail:install.ok ? install.stdout : (install.stderr || install.stdout) });
}

if (mode !== "check") {
  const create = run(["kanban","boards","create",board,"--name","nyobakantorai","--description","Human-governed multi-agent office","--switch"], true);
  if (!create.ok) run(["kanban","boards","switch",board]);
}
const currentBoard = run(["kanban","boards","show"], true);
const verify = profileIds.map((id) => ({ id, ok: run(["profile","show",id], true).ok }));
const ok = verify.every((x) => x.ok) && (mode === "check" ? true : currentBoard.ok);
const summary = { ok, hermes_version:version.stdout || version.stderr, hermes_home:env.HERMES_HOME || "(Hermes default)", board:currentBoard.ok ? currentBoard.stdout : board, mode, results, profiles:verify };
if (json) console.log(JSON.stringify(summary,null,2));
else {
  console.log(`Hermes: ${summary.hermes_version}`);
  console.log(`Home: ${summary.hermes_home}`);
  for (const item of results) console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.profile} — ${item.action}`);
  console.log(`Board: ${summary.board}`);
  console.log(ok ? "Hermes bootstrap ready." : "Hermes bootstrap incomplete.");
}
if (!ok) process.exitCode = 1;