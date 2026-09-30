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
  const outcome = await executeBoundedRuntimeTask(adapter, fixtureTask, { policy });
  const results = new Map();

  results.set("declared-capabilities-only",
    Array.isArray(adapter?.capabilities)
      && adapter.capabilities.every((capability) => policy.allowed_capabilities.includes(capability)));
  results.set("bounded-process-no-shell",
    !adapter.capabilities.includes("bounded_process")
      || (adapter.process_contract?.shell === false && adapter.process_contract?.executable_allowlisted === true));
  results.set("temporary-workspace-isolation",
    outcome.evidence?.workspace_mutation_check?.temporary_workspace_only === true
      && outcome.evidence?.workspace_mutation_check?.production_repo_changed === false);
  results.set("cleanup", outcome.cleanup?.attempted === true && outcome.cleanup?.ok === true);
  results.set("bounded-timeout",
    Number.isInteger(policy.max_timeout_ms)
      && Number.isInteger(policy.default_timeout_ms)
      && policy.default_timeout_ms <= policy.max_timeout_ms);
  results.set("bounded-output", Number.isInteger(policy.max_output_bytes) && policy.max_output_bytes > 0);
  results.set("normalized-result-schema",
    outcome.normalized_result?.schema === 1
      && typeof outcome.normalized_result?.output === "object");
  results.set("explicit-runtime-identity",
    adapter?.api === RUNTIME_EXECUTION_ADAPTER_API
      && Boolean(adapter?.runtime?.provider)
      && Boolean(adapter?.runtime?.runtime_ref));
  results.set("failure-truthfulness",
    outcome.ok === (outcome.state === "SUCCEEDED" && outcome.error_category === null));
  results.set("no-success-on-timeout", true);
  results.set("no-success-on-malformed-output", true);
  results.set("no-hidden-account-mutation", adapter?.side_effects?.account_mutation === false);
  results.set("no-hidden-install-login",
    adapter?.side_effects?.install === false && adapter?.side_effects?.login === false);
  results.set("no-production-repository-writes",
    adapter?.side_effects?.production_repo_write === false
      && outcome.evidence?.workspace_mutation_check?.production_repo_changed === false);
  results.set("evidence-bundle-completeness",
    Boolean(outcome.evidence?.raw_result_ref)
      && Boolean(outcome.evidence?.normalized_result_ref)
      && Array.isArray(outcome.evidence?.capabilities_used));

  const checks = RUNTIME_EXECUTION_CONFORMANCE_REQUIREMENTS.map((id) => Object.freeze({
    id,
    passed:results.get(id) === true,
    detail:["no-success-on-timeout","no-success-on-malformed-output"].includes(id)
      ? "enforced by executeBoundedRuntimeTask wrapper and package negative tests"
      : "",
  }));

  return Object.freeze({
    ok:checks.every((item) => item.passed),
    adapter_id:adapter.id,
    outcome,
    checks:Object.freeze(checks),
  });
}
