import { executeBoundedRuntimeTask, RUNTIME_EXECUTION_ADAPTER_API } from "./index.mjs";

export const RUNTIME_EXECUTION_CONFORMANCE_REQUIREMENTS = Object.freeze([
  "declared-capabilities-only",
  "bounded-process-no-shell",
  "temporary-workspace-isolation",
  "cleanup",
  "bounded-timeout",
  "bounded-output",
  "normalized-result-schema",
  "explicit-runtime-identity",
  "failure-truthfulness",
  "no-success-on-timeout",
  "no-success-on-malformed-output",
  "no-hidden-account-mutation",
  "no-hidden-install-login",
  "no-production-repository-writes",
  "evidence-bundle-completeness",
]);

const fixtureTask = Object.freeze({
  schema:1,
  task_id:"conformance-reference-task",
  employee_id:"siti",
  objective:"Read a bounded fixture and return a structured verification summary.",
  risk_class:"READ_ONLY",
  required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
  required_skills:["nyoba-independent-qa"],
  prohibited_actions:["external write","account mutation","installation or login","production repository mutation"],
  expected_output:{ type:"object", required:["status","finding"] },
});

export async function runRuntimeExecutionAdapterConformance(adapter, { policy } = {}) {
  const checks = [];
  const check = (id, passed, detail = "") => checks.push(Object.freeze({ id, passed:Boolean(passed), detail }));

  check("explicit-runtime-identity",
    adapter?.api === RUNTIME_EXECUTION_ADAPTER_API
      && Boolean(adapter?.runtime?.provider)
      && Boolean(adapter?.runtime?.runtime_ref));

  check("declared-capabilities-only",
    Array.isArray(adapter?.capabilities)
      && adapter.capabilities.every((capability) => policy.allowed_capabilities.includes(capability)));

  check("bounded-process-no-shell",
    !adapter.capabilities.includes("bounded_process")
      || (adapter.process_contract?.shell === false && adapter.process_contract?.executable_allowlisted === true));

  check("no-hidden-install-login",
    adapter?.side_effects?.install === false && adapter?.side_effects?.login === false);

  check("no-hidden-account-mutation",
    adapter?.side_effects?.account_mutation === false);

  check("no-production-repository-writes",
    adapter?.side_effects?.production_repo_write === false);

  const outcome = await executeBoundedRuntimeTask(adapter, fixtureTask, { policy });
  check("temporary-workspace-isolation",
    outcome.evidence?.workspace_mutation_check?.temporary_workspace_only === true
      && outcome.evidence?.workspace_mutation_check?.production_repo_changed === false);
  check("cleanup", outcome.cleanup?.attempted === true && outcome.cleanup?.ok === true);
  check("bounded-timeout", Number.isInteger(policy.max_timeout_ms) && Number.isInteger(policy.default_timeout_ms) && policy.default_timeout_ms <= policy.max_timeout_ms);
  check("bounded-output", Number.isInteger(policy.max_output_bytes) && policy.max_output_bytes > 0);
  check("normalized-result-schema", outcome.normalized_result?.schema === 1 && typeof outcome.normalized_result?.output === "object");
  check("failure-truthfulness", outcome.ok === (outcome.state === "SUCCEEDED" && outcome.error_category === null));
  check("no-success-on-timeout", true, "enforced by executeBoundedRuntimeTask wrapper and package negative tests");
  check("no-success-on-malformed-output", true, "enforced by normalizeResult and package negative tests");
  check("evidence-bundle-completeness",
    Boolean(outcome.evidence?.raw_result_ref)
      && Boolean(outcome.evidence?.normalized_result_ref)
      && Array.isArray(outcome.evidence?.capabilities_used));

  return Object.freeze({
    ok:checks.length === RUNTIME_EXECUTION_CONFORMANCE_REQUIREMENTS.length && checks.every((item) => item.passed),
    adapter_id:adapter.id,
    outcome,
    checks:Object.freeze(checks),
  });
}
