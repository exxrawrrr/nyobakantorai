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

test("NOT_RUN baselines are valid and remain explicitly unproven", () => {
  const browser = validateProviderEvaluationSet({ domain:"browser", result:browserBaseline, contracts, sources, integrations });
  const memory = validateProviderEvaluationSet({ domain:"memory", result:memoryBaseline, contracts, sources, integrations });
  assert.equal(browser.ok, true, browser.errors.join("\n"));
  assert.equal(memory.ok, true, memory.errors.join("\n"));
  assert.ok(browser.evaluated.every((item) => item.status === "NOT_RUN" && item.acceptance_passed === false));
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
