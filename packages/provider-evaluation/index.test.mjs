import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateProviderEvaluationSet } from "./index.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [contracts,sources,integrations,browserBaseline,memoryBaseline] = await Promise.all([
  readJson("../../config/provider-evaluation-contracts.json"),
  readJson("../../config/upstream-sources.json"),
  readJson("../../config/integrations.json"),
  readJson("../../benchmarks/provider-evaluations/browser-results.json"),
  readJson("../../benchmarks/provider-evaluations/memory-results.json"),
]);

test("recorded provider baselines validate without inflating unrun claims", () => {
  const browser = validateProviderEvaluationSet({ domain:"browser", result:browserBaseline, contracts, sources, integrations });
  const memory = validateProviderEvaluationSet({ domain:"memory", result:memoryBaseline, contracts, sources, integrations });
  assert.equal(browser.ok, true, browser.errors.join("\n"));
  assert.equal(memory.ok, true, memory.errors.join("\n"));
  assert.deepEqual(browser.evaluated,[
    {provider_id:"playwright-mcp",status:"COMPLETED",acceptance_passed:true},
    {provider_id:"browser-use",status:"NOT_RUN",acceptance_passed:false},
  ]);
  assert.ok(memory.evaluated.every((item) => item.status === "NOT_RUN" && item.acceptance_passed === false));
});

function env() {
  return {
    os:"linux",
    runtime:"eval-harness",
    provider_version:"pinned-test-version",
    started_at:"2026-09-29T04:00:00.000Z",
    finished_at:"2026-09-29T04:01:00.000Z",
  };
}

function browserCase(case_id, overrides = {}) {
  return {
    case_id,
    evidence_refs:[`eval://browser/${case_id}`],
    metrics:{
      success:true,
      evidence_complete:true,
      false_success:false,
      human_intervention:0,
      retries:0,
      duration_ms:10,
      recovered_truthfully:true,
      ...overrides,
    },
  };
}

test("completed browser provider may become candidate only when every acceptance gate passes", () => {
  const result=structuredClone(browserBaseline);
  const rec=result.providers[0];
  rec.status="COMPLETED";
  rec.claim_state="EVALUATED_CANDIDATE";
  rec.environment=env();
  rec.cases=contracts.browser.required_case_ids.map((id)=>browserCase(id));
  rec.summary={acceptance_passed:true};
  const validated=validateProviderEvaluationSet({domain:"browser",result,contracts,sources,integrations});
  assert.equal(validated.ok,true,validated.errors.join("\n"));
  assert.equal(validated.evaluated[0].acceptance_passed,true);
});

test("browser false-success cannot be mislabeled as candidate", () => {
  const result=structuredClone(browserBaseline);
  const rec=result.providers[0];
  rec.status="COMPLETED";
  rec.claim_state="EVALUATED_CANDIDATE";
  rec.environment=env();
  rec.cases=contracts.browser.required_case_ids.map((id)=>browserCase(id,id==="write-guard"?{false_success:true}:{}));
  rec.summary={acceptance_passed:true};
  const validated=validateProviderEvaluationSet({domain:"browser",result,contracts,sources,integrations});
  assert.equal(validated.ok,false);
  assert.ok(validated.errors.some((error)=>/claim_state|acceptance_passed/.test(error)));
});

function memoryCase(case_id, overrides = {}) {
  return {
    case_id,
    evidence_refs:[`eval://memory/${case_id}`],
    metrics:{
      success:true,
      evidence_complete:true,
      false_success:false,
      cross_profile_leak:false,
      secret_persistence:false,
      delete_verified:case_id==="delete",
      export_verified:case_id==="export",
      provenance_verified:case_id==="provenance",
      ...overrides,
    },
  };
}

test("completed memory provider requires isolation export delete provenance and secret rejection", () => {
  const result=structuredClone(memoryBaseline);
  const rec=result.providers[0];
  rec.status="COMPLETED";
  rec.claim_state="EVALUATED_CANDIDATE";
  rec.environment=env();
  rec.cases=contracts.memory.required_case_ids.map((id)=>memoryCase(id));
  rec.summary={acceptance_passed:true};
  const validated=validateProviderEvaluationSet({domain:"memory",result,contracts,sources,integrations});
  assert.equal(validated.ok,true,validated.errors.join("\n"));
});

test("memory cross-profile leak forces non-candidate claim", () => {
  const result=structuredClone(memoryBaseline);
  const rec=result.providers[0];
  rec.status="COMPLETED";
  rec.claim_state="EVALUATED_CANDIDATE";
  rec.environment=env();
  rec.cases=contracts.memory.required_case_ids.map((id)=>memoryCase(id,id==="profile-isolation"?{cross_profile_leak:true}:{}));
  rec.summary={acceptance_passed:true};
  const validated=validateProviderEvaluationSet({domain:"memory",result,contracts,sources,integrations});
  assert.equal(validated.ok,false);
  assert.ok(validated.errors.some((error)=>/claim_state|acceptance_passed/.test(error)));
});

test("source commit drift invalidates provider evaluation evidence", () => {
  const result=structuredClone(browserBaseline);
  result.providers[0].source_commit="deadbeef";
  const validated=validateProviderEvaluationSet({domain:"browser",result,contracts,sources,integrations});
  assert.equal(validated.ok,false);
  assert.ok(validated.errors.some((error)=>/source_commit drift/.test(error)));
});


test("incomplete memory evidence cannot be candidate", () => {
  const result=structuredClone(memoryBaseline);
  const rec=result.providers[0];
  rec.status="COMPLETED";
  rec.claim_state="EVALUATED_CANDIDATE";
  rec.environment=env();
  rec.cases=contracts.memory.required_case_ids.map((id)=>memoryCase(
    id,
    id==="write-read-roundtrip"?{success:false,evidence_complete:false}:{}
  ));
  rec.summary={acceptance_passed:true};
  const validated=validateProviderEvaluationSet({domain:"memory",result,contracts,sources,integrations});
  assert.equal(validated.ok,false);
  assert.ok(validated.errors.some((error)=>/claim_state|acceptance_passed/.test(error)));
});

test("missing required provider record fields are rejected", () => {
  const result=structuredClone(browserBaseline);
  delete result.providers[0].summary;
  const validated=validateProviderEvaluationSet({domain:"browser",result,contracts,sources,integrations});
  assert.equal(validated.ok,false);
  assert.ok(validated.errors.some((error)=>/missing required field summary|summary must be an object/.test(error)));
});


test("explicit cross-profile contamination case blocks memory candidate on leak", () => {
  const result=structuredClone(memoryBaseline);
  const rec=result.providers[0];
  rec.status="COMPLETED";
  rec.claim_state="EVALUATED_CANDIDATE";
  rec.environment=env();
  rec.cases=contracts.memory.required_case_ids.map((id)=>memoryCase(
    id,
    id==="cross-profile-contamination-negative"?{cross_profile_leak:true}:{}
  ));
  rec.summary={acceptance_passed:true};
  const validated=validateProviderEvaluationSet({domain:"memory",result,contracts,sources,integrations});
  assert.equal(validated.ok,false);
  assert.ok(validated.errors.some((error)=>/claim_state|acceptance_passed/.test(error)));
});


test("Cognee readiness evidence cannot promote an unrun provider", async () => {
  const readiness=await readJson("../../benchmarks/provider-evaluations/memory-readiness-2026-09-29.json");
  assert.equal(readiness.provider_id,"cognee-hermes");
  assert.equal(readiness.evaluation_status,"NOT_RUN");
  assert.equal(readiness.claim_state,"UNPROVEN");
  assert.equal(readiness.live_checks.cognee_command,"NOT_FOUND");
  assert.equal(readiness.live_checks.cognee_python_module,"NOT_FOUND");
  assert.ok(readiness.required_cases_not_executed.includes("cross-profile-contamination-negative"));
  assert.equal(memoryBaseline.providers[0].status,"NOT_RUN");
  assert.equal(memoryBaseline.providers[0].claim_state,"UNPROVEN");
  assert.equal(memoryBaseline.providers[0].environment,null);
  assert.deepEqual(memoryBaseline.providers[0].cases,[]);
  assert.equal(
    memoryBaseline.providers[0].summary.readiness_evidence_ref,
    "benchmarks/provider-evaluations/memory-readiness-2026-09-29.json"
  );
});


test("Playwright live evidence binds candidate claim to server-side no-write and isolation proof", async () => {
  const agent=await readJson("../../benchmarks/provider-evaluations/evidence/playwright-mcp-2026-09-29/agent-result.json");
  const server=await readJson("../../benchmarks/provider-evaluations/evidence/playwright-mcp-2026-09-29/server-evidence.json");
  const rec=browserBaseline.providers.find((item)=>item.provider_id==="playwright-mcp");
  assert.equal(rec.status,"COMPLETED");
  assert.equal(rec.claim_state,"EVALUATED_CANDIDATE");
  assert.equal(rec.summary.acceptance_passed,true);
  assert.equal(agent.cases.length,6);
  assert.ok(agent.cases.every((item)=>item.success===true && item.evidence_complete===true && item.false_success===false));
  assert.equal(server.assertions.mutation_post_count,0);
  assert.equal(server.assertions.auth_cookie_observed,false);
  assert.equal(server.assertions.timeout_recovery_read_observed,true);
  assert.equal(server.assertions.partial_recovery_read_observed,true);
  assert.equal(server.assertions.external_target_requests_observed,false);
});

test("Browser Use readiness cannot masquerade as provider evaluation", async () => {
  const readiness=await readJson("../../benchmarks/provider-evaluations/browser-use-readiness-2026-09-29.json");
  const rec=browserBaseline.providers.find((item)=>item.provider_id==="browser-use");
  assert.equal(readiness.evaluation_status,"NOT_RUN");
  assert.equal(readiness.claim_state,"UNPROVEN");
  assert.equal(readiness.live_checks.browser_use_command,"NOT_FOUND");
  assert.equal(readiness.live_checks.browser_use_python_module,"NOT_FOUND");
  assert.equal(readiness.live_checks.hermes_browser_use_plugin,"PRESENT_BUT_DISABLED");
  assert.equal(rec.status,"NOT_RUN");
  assert.equal(rec.claim_state,"UNPROVEN");
  assert.equal(rec.environment,null);
  assert.deepEqual(rec.cases,[]);
  assert.equal(rec.summary.readiness_evidence_ref,"benchmarks/provider-evaluations/browser-use-readiness-2026-09-29.json");
});
