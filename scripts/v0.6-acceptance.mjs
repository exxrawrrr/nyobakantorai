import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { runDeterministicV06Acceptance, reconcileV06Acceptance } from "../packages/v0.6-acceptance/index.mjs";

const root = resolve(import.meta.dirname,"..");
const argv = process.argv.slice(2);
const command = argv[0] || "check";
const flag = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const has = (name) => argv.includes(name);
const readJson = async (path) => JSON.parse(await readFile(resolve(root,path),"utf8"));

function git(args) {
  return execFileSync("git",args,{ cwd:root, encoding:"utf8", windowsHide:true }).trim();
}

function parseJsonOutput(text) {
  const source = String(text || "").trim();
  if (!source) return null;
  try { return JSON.parse(source); } catch { return null; }
}

const runtimePolicy = await readJson("config/runtime-execution-policy.json");
const expectedCommit = git(["rev-parse","HEAD"]);
const missionRun = await runDeterministicV06Acceptance({ runtime_policy:runtimePolicy });

let liveObservation = null;
let liveAttempt = Object.freeze({ attempted:false, runtime:null, child_status:null, record_available:false, sandbox:null });

if (command === "live") {
  const runtime = String(flag("--runtime") || "").trim().toLowerCase();
  if (!["codex","hermes"].includes(runtime)) throw new Error("live acceptance requires --runtime codex|hermes");
  if (!has("--confirm-live")) throw new Error("live acceptance requires explicit --confirm-live");

  const tempDir = await mkdtemp(resolve(tmpdir(),"nyobakantorai-v06-acceptance-"));
  const recordPath = resolve(tempDir,runtime+"-"+expectedCommit+".json");
  try {
    const child = spawnSync(process.execPath,[
      resolve(root,"scripts/portability-live-run.mjs"),
      "run", "--runtime",runtime, "--confirm-live", "--out",recordPath,
    ],{ cwd:root, encoding:"utf8", windowsHide:true, shell:false, env:process.env, timeout:90_000 });

    const summary = parseJsonOutput(child.stdout);
    let record = null;
    try { record = JSON.parse(await readFile(recordPath,"utf8")); } catch {}
    if (record && summary?.sandbox) {
      liveObservation = Object.freeze({
        record,
        sandbox:Object.freeze({
          admission_ref:summary.sandbox.admission_ref || null,
          executed:summary.sandbox.executed === true,
          status:summary.sandbox.status || null,
          quota_status:summary.sandbox.quota_status || null,
          teardown_verified:summary.sandbox.teardown_verified === true,
          unverified_dimensions:Object.freeze([...(summary.sandbox.unverified_dimensions || [])]),
          record_ref:summary.sandbox.record_ref || null,
        }),
      });
    }
    liveAttempt = Object.freeze({
      attempted:true,
      runtime,
      child_status:child.status,
      record_available:Boolean(record),
      evidence_class:summary?.evidence_class || record?.evidence_class || null,
      qualification:summary?.qualification || null,
      sandbox:summary?.sandbox || null,
      error_category:record?.execution?.error_category || null,
    });
  } finally {
    await rm(tempDir,{ recursive:true, force:true });
  }
} else if (command !== "check") {
  throw new Error("usage: v0.6-acceptance.mjs <check|live> [--runtime codex|hermes --confirm-live] [--out file]");
}

const bundle = reconcileV06Acceptance({ mission_run:missionRun, live_observation:liveObservation, expected_commit:expectedCommit });
const output = Object.freeze({ schema:1, command, acceptance:bundle, live_attempt:liveAttempt });

const out = flag("--out");
if (out) {
  const destination = resolve(root,out);
  await mkdir(dirname(destination),{ recursive:true });
  await writeFile(destination,JSON.stringify(output,null,2)+"\n","utf8");
}

process.stdout.write(JSON.stringify(output,null,2)+"\n");
if (command === "live" && bundle.status !== "ACCEPTED") process.exitCode = 3;
if (bundle.status === "FAILED") process.exitCode = 2;
