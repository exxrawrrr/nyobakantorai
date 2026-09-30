import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EMPLOYEE_IDS } from "../office/workforce.mjs";
import { findEmployeeSelectionArg, resolveEmployeeSelection } from "./employee-selection.mjs";

const clean = (value) => String(value ?? "").trim();

export function planSelectedProfileRemoval({ selection = "all", confirmDeleteUserState = false } = {}) {
  const ids = resolveEmployeeSelection(selection, EMPLOYEE_IDS);
  return Object.freeze({
    selection,
    profiles: Object.freeze([...ids]),
    destructive: true,
    confirmed: confirmDeleteUserState === true,
    action: confirmDeleteUserState === true ? "DELETE_PROFILE_AND_USER_STATE" : "PREVIEW_ONLY",
  });
}

function runHermes(hermes, args, env, allowFailure = false) {
  const result = spawnSync(hermes, args, { env, encoding:"utf8", windowsHide:true });
  if (result.error) {
    if (allowFailure) return { ok:false, code:null, stdout:"", stderr:result.error.message };
    throw new Error("Unable to run Hermes: " + result.error.message);
  }
  const output = { ok:result.status===0, code:result.status, stdout:String(result.stdout||"").trim(), stderr:String(result.stderr||"").trim() };
  if (!output.ok && !allowFailure) throw new Error("Hermes command failed: " + args.join(" ") + "\n" + (output.stderr || output.stdout));
  return output;
}

export function removalSucceeded({ results = [], verification = [] } = {}) {
  return results.every((item) => item?.ok === true) && verification.every((item) => item?.exists === false);
}

async function main() {
  const argv = process.argv.slice(2);
  const selection = findEmployeeSelectionArg(argv);
  const confirmDeleteUserState = argv.includes("--confirm-delete-user-state");
  const json = argv.includes("--json");
  const homeArg = argv.find((arg) => arg.startsWith("--home="));
  const hermes = process.env.NYOBAKANTORAI_HERMES_EXE || "hermes";
  const env = { ...process.env };
  if (homeArg) env.HERMES_HOME = resolve(homeArg.slice("--home=".length));
  else if (process.env.NYOBAKANTORAI_HERMES_HOME) env.HERMES_HOME = resolve(process.env.NYOBAKANTORAI_HERMES_HOME);

  const plan = planSelectedProfileRemoval({ selection, confirmDeleteUserState });
  if (!confirmDeleteUserState) {
    const preview = {
      ...plan,
      warning: "Preview only. Actual removal permanently deletes the selected Hermes profile data. Re-run with --confirm-delete-user-state to execute.",
    };
    console.log(json ? JSON.stringify(preview,null,2) : [
      "PREVIEW ONLY — no profile deleted.",
      "Selected: " + plan.profiles.join(", "),
      "This operation would permanently delete those Hermes profiles including config, memories, sessions, and skills.",
      "To execute: add --confirm-delete-user-state",
    ].join("\n"));
    return;
  }

  const version = runHermes(hermes, ["--version"], env, true);
  if (!version.ok) throw new Error("Hermes CLI is not available.");

  const results = [];
  for (const id of plan.profiles) {
    const show = runHermes(hermes, ["profile","show",id], env, true);
    if (!show.ok) {
      results.push({ profile:id, action:"already-absent", ok:true });
      continue;
    }
    const removed = runHermes(hermes, ["profile","delete",id,"--yes"], env, true);
    results.push({ profile:id, action:"delete", ok:removed.ok, detail:removed.ok ? removed.stdout : (removed.stderr || removed.stdout) });
  }

  const verification = plan.profiles.map((id) => ({ id, exists: runHermes(hermes, ["profile","show",id], env, true).ok }));
  const ok = removalSucceeded({ results, verification });
  const summary = { ok, ...plan, hermes_version:version.stdout || version.stderr, results, verification };
  if (json) console.log(JSON.stringify(summary,null,2));
  else {
    for (const item of results) console.log((item.ok ? "PASS" : "FAIL") + "  " + item.profile + " — " + item.action);
    console.log(ok ? "Selected Hermes profiles removed." : "Removal incomplete.");
  }
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
