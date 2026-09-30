import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  defineRuntimeExecutionAdapter,
  defineRuntimeExecutionPolicy,
  executeBoundedRuntimeTask,
  normalizeRuntimeExecutionTask,
} from "./index.mjs";
import {
  RUNTIME_EXECUTION_CONFORMANCE_REQUIREMENTS,
  runRuntimeExecutionAdapterConformance,
} from "./conformance.mjs";

const root = new URL("../../", import.meta.url);
const policy = defineRuntimeExecutionPolicy(JSON.parse(await readFile(new URL("config/runtime-execution-policy.json", root), "utf8")));

const task = Object.freeze({
  schema:1,
  task_id:"task-reference-001",
  employee_id:"siti",
  objective:"Inspect the fixture and return a bounded QA result.",
  risk_class:"READ_ONLY",
  required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
  required_skills:["nyoba-independent-qa"],
  prohibited_actions:["external write","login","installation","production repository mutation"],
  expected_output:{ type:"object", required:["status","finding"] },
});

function makeAdapter({
  execute,
  normalize,
  evidence,
  cleanup,
  capabilities = ["model_inference","temporary_workspace","evidence_collection"],
  sideEffects = {},
  processContract = null,
} = {}) {
  return defineRuntimeExecutionAdapter({
    id:"fixture-exec",
    version:"1.0.0",
    runtime:{ provider:"fixture-runtime", runtime_ref:"fixture:local", provider_version:"1.0" },
    capabilities,
    side_effects:sideEffects,
    process_contract:processContract,
    async prepare() {
      return { workspace:{ kind:"TEMPORARY", ref:"tmp://fixture", isolated:true, production_repo:false }, session_ref:"session:fixture" };
    },
    async executeBoundedTask(args) {
      if (execute) return execute(args);
      return { text:"fixture raw output" };
    },
    async normalizeResult(args) {
      if (normalize) return normalize(args);
      return {
        schema:1,
        state:"SUCCEEDED",
        summary:"Fixture passed bounded verification.",
        output:{ status:"PASS", finding:"bounded fixture" },
        artifact_refs:["artifact:normalized"],
        evidence_refs:["evidence:normalized"],
      };
    },
    async collectEvidence(args) {
      if (evidence) return evidence(args);
      return {
        schema:1,
        raw_result_ref:"artifact:raw",
        normalized_result_ref:"artifact:normalized",
        capabilities_used:["model_inference","temporary_workspace","evidence_collection"],
        workspace_mutation_check:{ temporary_workspace_only:true, production_repo_changed:false },
        prohibited_action_check:{ passed:true, observed:[] },
        runtime_actions:{ install:false, login:false, account_mutation:false, external_write:false },
        evidence_refs:["evidence:workspace","evidence:policy"],
        artifact_refs:["artifact:raw","artifact:normalized"],
      };
    },
    async cleanup(args) {
      if (cleanup) return cleanup(args);
      return { ok:true };
    },
  });
}

test("read-only execution policy is explicit and rejects forbidden task capability", () => {
  assert.deepEqual(policy.allowed_risk_classes, ["READ_ONLY"]);
  assert.ok(policy.forbidden_capabilities.includes("external_write"));
  assert.ok(policy.forbidden_capabilities.includes("production_repo_write"));
  assert.throws(() => normalizeRuntimeExecutionTask({
    ...task,
    required_capabilities:["external_write"],
  }), /forbidden capability/);
});

test("execution adapter contract rejects undeclared danger and unbounded shell", () => {
  assert.throws(() => makeAdapter({ capabilities:["external_write"] }), /forbidden execution capability/);
  assert.throws(() => makeAdapter({ sideEffects:{ install:true } }), /may not declare install/);
  assert.throws(() => makeAdapter({
    capabilities:["bounded_process"],
    processContract:{ shell:true, executable_allowlisted:true },
  }), /shell:false/);
  assert.throws(() => makeAdapter({
    capabilities:["bounded_process"],
    processContract:{ shell:false, executable_allowlisted:false },
  }), /allowlisted executable/);
});

test("bounded execution succeeds only with temporary workspace, normalized output, evidence, and cleanup", async () => {
  const outcome = await executeBoundedRuntimeTask(makeAdapter(), task, { policy });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state, "SUCCEEDED");
  assert.equal(outcome.error_category, null);
  assert.equal(outcome.runtime.provider, "fixture-runtime");
  assert.equal(outcome.normalized_result.output.status, "PASS");
  assert.equal(outcome.evidence.workspace_mutation_check.production_repo_changed, false);
  assert.equal(outcome.cleanup.ok, true);
  assert.equal("raw_result" in outcome, false);
});

test("task may not request capability the adapter did not declare", async () => {
  await assert.rejects(
    () => executeBoundedRuntimeTask(makeAdapter({ capabilities:["temporary_workspace","evidence_collection"] }), task, { policy }),
    /undeclared capability/,
  );
});

test("timeout fails closed and cleanup still runs", async () => {
  let cleaned = false;
  const adapter = makeAdapter({
    execute:async () => new Promise(() => {}),
    cleanup:async () => { cleaned = true; return { ok:true }; },
  });
  const outcome = await executeBoundedRuntimeTask(adapter, task, { policy, timeoutMs:10 });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.state, "FAILED");
  assert.equal(outcome.error_category, "TIMEOUT");
  assert.equal(cleaned, true);
  assert.equal(outcome.cleanup.ok, true);
});

test("malformed normalized output never becomes success", async () => {
  const adapter = makeAdapter({ normalize:async () => ({ state:"SUCCEEDED" }) });
  const outcome = await executeBoundedRuntimeTask(adapter, task, { policy });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.state, "FAILED");
  assert.equal(outcome.error_category, "MALFORMED_OUTPUT");
  assert.equal(outcome.cleanup.ok, true);
});

test("evidence reporting hidden install/login/account or production write fails closed", async () => {
  for (const mutation of [
    { runtime_actions:{ install:true, login:false, account_mutation:false, external_write:false } },
    { runtime_actions:{ install:false, login:true, account_mutation:false, external_write:false } },
    { runtime_actions:{ install:false, login:false, account_mutation:true, external_write:false } },
    { runtime_actions:{ install:false, login:false, account_mutation:false, external_write:true } },
    { workspace_mutation_check:{ temporary_workspace_only:true, production_repo_changed:true } },
  ]) {
    const adapter = makeAdapter({
      evidence:async () => ({
        schema:1,
        raw_result_ref:"artifact:raw",
        normalized_result_ref:"artifact:normalized",
        capabilities_used:["model_inference"],
        workspace_mutation_check:{ temporary_workspace_only:true, production_repo_changed:false },
        prohibited_action_check:{ passed:true, observed:[] },
        runtime_actions:{ install:false, login:false, account_mutation:false, external_write:false },
        evidence_refs:["evidence:policy"],
        artifact_refs:["artifact:raw"],
        ...mutation,
      }),
    });
    const outcome = await executeBoundedRuntimeTask(adapter, task, { policy });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error_category, "POLICY_VIOLATION");
  }
});

test("undeclared capability use in evidence fails closed", async () => {
  const adapter = makeAdapter({
    evidence:async () => ({
      schema:1,
      raw_result_ref:"artifact:raw",
      normalized_result_ref:"artifact:normalized",
      capabilities_used:["bounded_process"],
      workspace_mutation_check:{ temporary_workspace_only:true, production_repo_changed:false },
      prohibited_action_check:{ passed:true, observed:[] },
      runtime_actions:{ install:false, login:false, account_mutation:false, external_write:false },
      evidence_refs:["evidence:policy"],
      artifact_refs:[],
    }),
  });
  const outcome = await executeBoundedRuntimeTask(adapter, task, { policy });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error_category, "UNDECLARED_CAPABILITY_USED");
});

test("bounded output limit fails closed", async () => {
  const smallPolicy = defineRuntimeExecutionPolicy({ ...JSON.parse(await readFile(new URL("config/runtime-execution-policy.json", root), "utf8")), max_output_bytes:1024 });
  const adapter = makeAdapter({
    normalize:async () => ({
      schema:1,
      state:"SUCCEEDED",
      summary:"large",
      output:{ payload:"x".repeat(5000) },
      artifact_refs:[],
      evidence_refs:[],
    }),
  });
  const outcome = await executeBoundedRuntimeTask(adapter, task, { policy:smallPolicy });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error_category, "OUTPUT_LIMIT");
});

test("cleanup failure downgrades an otherwise successful execution", async () => {
  const outcome = await executeBoundedRuntimeTask(makeAdapter({ cleanup:async () => ({ ok:false }) }), task, { policy });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.state, "FAILED");
  assert.equal(outcome.error_category, "CLEANUP_FAILED");
});

test("reference READ_ONLY policy rejects high-impact risk classes before execution", async () => {
  await assert.rejects(
    () => executeBoundedRuntimeTask(makeAdapter(), { ...task, risk_class:"EXTERNAL_WRITE" }, { policy }),
    /risk class EXTERNAL_WRITE is not allowed/,
  );
});

test("conformance helper covers every required contract check without live credentials", async () => {
  const result = await runRuntimeExecutionAdapterConformance(makeAdapter(), { policy });
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, RUNTIME_EXECUTION_CONFORMANCE_REQUIREMENTS.length);
  assert.deepEqual(result.checks.map((item) => item.id), RUNTIME_EXECUTION_CONFORMANCE_REQUIREMENTS);
  assert.equal(result.outcome.ok, true);
});
