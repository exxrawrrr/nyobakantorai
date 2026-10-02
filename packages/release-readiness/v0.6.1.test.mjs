import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assessV061ReleaseReadiness,
  buildV061ReadinessSnapshot,
  readAndAssessV061ReleaseReadiness,
} from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical v0.6.1 reliability is PASS while publication is truthfully BLOCKED by v0.6.0 prerequisite",async()=>{
  const {config,assessment}=await readAndAssessV061ReleaseReadiness();
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.reliability_decision,"PASS");
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.reliability_blockers,[]);
  assert.deepEqual(assessment.blockers,["V0_6_0_PREREQUISITE"]);
  assert.equal(assessment.canonical.reliability_passed,4);
  assert.equal(assessment.canonical.reliability_total,4);
  assert.equal(assessment.canonical.v0_6_prerequisite,"BLOCKED");
  assert.deepEqual(assessment.canonical.v0_6_blockers,["REAL_MODEL_EXECUTION","COST_QUOTA_ENFORCEMENT"]);
  assert.equal(assessment.canonical.package_version,"0.5.1");
  assert.equal(assessment.canonical.cross_platform_verification,"PASS");

  const snapshot=buildV061ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.package_bump_authorized,false);
  assert.equal(snapshot.stable_tag_authorized,false);
  assert.equal(snapshot.publication_authorized,false);
  assert.match(snapshot.truth_boundary,/does not authorize publication/);
});

test("declaring v0.6.1 READY cannot bypass the blocked v0.6.0 prerequisite",async()=>{
  const {config}=await readAndAssessV061ReleaseReadiness();
  const changed=structuredClone(config);
  changed.decision="READY";
  changed.release_blockers=[];
  changed.package_version_hold.bump_authorized=true;
  changed.promotion.stable_tag_authorized=true;
  changed.promotion.publication_authorized=true;

  const result=await assessV061ReleaseReadiness(changed);
  assert.equal(result.ok,false);
  assert.equal(result.decision,"BLOCKED");
  assert.deepEqual(result.blockers,["V0_6_0_PREREQUISITE"]);
  assert.ok(result.errors.some((item)=>/release blocker drift/.test(item)));
  assert.ok(result.errors.some((item)=>/decision drift/.test(item)));
  assert.ok(result.errors.some((item)=>/package bump cannot be authorized/.test(item)));
  assert.ok(result.errors.some((item)=>/stable tag cannot be authorized/.test(item)));
  assert.ok(result.errors.some((item)=>/publication cannot be authorized/.test(item)));
});

test("a reliability component regression becomes a release blocker instead of being hidden by the prerequisite",async()=>{
  const {config}=await readAndAssessV061ReleaseReadiness();
  const evidence=JSON.parse(await readFile(resolve(root,"config/v0.6.1-reliability-evidence.json"),"utf8"));
  evidence.components[2].status="FAILED";
  evidence.reliability_verdict="BLOCKED";

  const result=await assessV061ReleaseReadiness(config,{evidenceOverride:evidence});
  assert.equal(result.ok,false);
  assert.equal(result.reliability_decision,"BLOCKED");
  assert.deepEqual(result.reliability_blockers,["CHECKPOINT_RECOVERY"]);
  assert.deepEqual(result.blockers,["CHECKPOINT_RECOVERY","V0_6_0_PREREQUISITE"]);
  assert.ok(result.errors.some((item)=>/reliability count drift/.test(item)));
  assert.ok(result.errors.some((item)=>/release blocker drift/.test(item)));
});

test("v0.6.1 evidence ledger keeps all four reliability components attributable",async()=>{
  const evidence=JSON.parse(await readFile(resolve(root,"config/v0.6.1-reliability-evidence.json"),"utf8"));
  assert.equal(evidence.reliability_verdict,"PASS");
  assert.deepEqual(evidence.components.map((item)=>item.id),[
    "COST_GOVERNOR",
    "ARTIFACT_REPLAY_INTEGRITY",
    "CHECKPOINT_RECOVERY",
    "PROJECT_BRAIN_MEMORY_SCOPE",
  ]);
  for(const item of evidence.components){
    assert.equal(item.status,"PASS");
    assert.match(item.integrated_main_commit,/^[a-f0-9]{40}$/);
    assert.ok(Number.isInteger(item.exact_main_verify_run)&&item.exact_main_verify_run>0);
    assert.ok(item.canonical_doc.startsWith("docs/"));
    assert.ok(item.evaluation_command.startsWith("npm run "));
    assert.ok(item.assertions.length>=2);
  }
});

test("release workflow has a dedicated fail-closed v0.6.1 readiness guard",async()=>{
  const workflow=await readFile(resolve(root,".github/workflows/release.yml"),"utf8");
  assert.match(workflow,/refs\/tags\/v0\.6\.1/);
  assert.match(workflow,/v0\.6\.1:readiness:require-ready/);
});
