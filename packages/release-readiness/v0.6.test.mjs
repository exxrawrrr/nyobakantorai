import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assessV06ReleaseReadiness,
  buildV06ReadinessSnapshot,
  readAndAssessV06ReleaseReadiness,
} from "./index.mjs";

test("canonical v0.6.0 convergence is valid but truthfully BLOCKED on two live acceptance criteria", async () => {
  const {config,assessment}=await readAndAssessV06ReleaseReadiness();
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.blockers,["REAL_MODEL_EXECUTION","COST_QUOTA_ENFORCEMENT"]);
  assert.equal(assessment.canonical.mission_state,"VERIFIED");
  assert.equal(assessment.canonical.acceptance_verdict,"BLOCKED");
  assert.equal(assessment.canonical.acceptance_passed,9);
  assert.equal(assessment.canonical.acceptance_total,11);
  assert.equal(assessment.canonical.package_version,"0.5.1");
  assert.equal(assessment.canonical.public_demo_deployment,"NOT_CONFIGURED");
  assert.deepEqual(assessment.canonical.live_observation_runtimes,["codex","hermes"]);

  const snapshot=buildV06ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.package_bump_authorized,false);
  assert.equal(snapshot.stable_tag_authorized,false);
  assert.equal(snapshot.publication_authorized,false);
  assert.match(snapshot.truth_boundary,/green CI can validate a BLOCKED release state/);
});

test("declaring v0.6 READY cannot override canonical blocked acceptance evidence", async () => {
  const {config}=await readAndAssessV06ReleaseReadiness();
  const changed=structuredClone(config);
  changed.decision="READY";
  changed.release_blockers=[];
  changed.package_version_hold.bump_authorized=true;
  changed.promotion.stable_tag_authorized=true;
  changed.promotion.publication_authorized=true;

  const result=await assessV06ReleaseReadiness(changed);
  assert.equal(result.ok,false);
  assert.equal(result.decision,"BLOCKED");
  assert.ok(result.errors.some((item)=>/release blocker drift/.test(item)));
  assert.ok(result.errors.some((item)=>/decision drift/.test(item)));
  assert.ok(result.errors.some((item)=>/package bump cannot be authorized/.test(item)));
  assert.ok(result.errors.some((item)=>/stable tag cannot be authorized/.test(item)));
  assert.ok(result.errors.some((item)=>/publication cannot be authorized/.test(item)));
});

test("blocked convergence keeps the published stable package metadata unchanged", async () => {
  const {config,assessment}=await readAndAssessV06ReleaseReadiness();
  assert.equal(assessment.ok,true);
  assert.equal(config.package_version_hold.current,"0.5.1");
  assert.equal(config.package_version_hold.candidate,"0.6.0");
  assert.equal(config.package_version_hold.bump_authorized,false);
});

test("public demo deployment is explicitly NOT_CONFIGURED rather than silently claimed deployed", async () => {
  const {config,assessment}=await readAndAssessV06ReleaseReadiness();
  assert.equal(assessment.ok,true);
  assert.equal(config.public_demo_deployment.configured,false);
  assert.equal(config.public_demo_deployment.state,"NOT_CONFIGURED");
  assert.equal(config.public_demo_deployment.blocking,false);
});

test("v0.6 convergence preserves both fresh live attempts as unsuccessful but safely torn down", async () => {
  const evidence=JSON.parse(await readFile(resolve(import.meta.dirname,"../../config/v0.6-acceptance-evidence.json"),"utf8"));
  assert.equal(evidence.live_observations.length,2);
  for(const item of evidence.live_observations){
    assert.equal(item.evidence_class,"UNVERIFIED_RUNTIME_ATTEMPT");
    assert.equal(item.qualification_reason,"RUNTIME_EXECUTION_NOT_SUCCESSFUL");
    assert.equal(item.sandbox_executed,true);
    assert.equal(item.teardown_verified,true);
    assert.equal(item.external_write_observed,false);
  }
});
