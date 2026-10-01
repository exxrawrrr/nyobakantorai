import test from "node:test";
import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assessV05ReleaseReadiness,buildV05ReadinessSnapshot,readAndAssessV05ReleaseReadiness } from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical v0.5.1 readiness is truthfully BLOCKED only by the final promotion gate",async()=>{
  const {config,assessment}=await readAndAssessV05ReleaseReadiness({root});
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.blockers,["final-main-release-gate"]);
  assert.equal(assessment.canonical.reference_case_portability,"SUPPORTED");
  assert.equal(assessment.canonical.live_runtime_growth,"INCREASED");
  assert.equal(assessment.canonical.package_version,"0.5.1");
  assert.equal(assessment.canonical.artifact_maturity,"candidate");
  assert.equal(assessment.canonical.real_task_cases,1);
  assert.equal(assessment.canonical.real_task_required,20);
  const snapshot=buildV05ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.merge_authorized,false);
  assert.match(snapshot.truth_boundary,/BLOCKED state != release authorization/);
});

test("temporary PRD is retired and durable successor contains surviving final rules",async()=>{
  await assert.rejects(access(resolve(root,"docs/V0.5-IMPLEMENTATION-PRD.md")));
  const doc=await readFile(resolve(root,"docs/V0.5-RELEASE-READINESS.md"),"utf8");
  for(const heading of ["Architecture constraints","Required test layers","Acceptance reconciliation","Quality gates","Migration and compatibility","Release claim language","Evidence outputs"]){
    assert.equal(doc.includes("## "+heading),true,"missing durable heading: "+heading);
  }
});

test("READY cannot be declared while the v0.5.1 final main release gate remains open",async()=>{
  const {config}=await readAndAssessV05ReleaseReadiness({root});
  const changed=structuredClone(config);
  changed.decision="READY";
  changed.release_blockers=[];
  changed.promotion.merge_authorized=true;
  const result=await assessV05ReleaseReadiness(changed,{root});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/release blocker drift/.test(e)));
  assert.ok(result.errors.some((e)=>/decision drift/.test(e)));
  assert.ok(result.errors.some((e)=>/merge_authorized cannot be true/.test(e)));
});

test("nonblocking real-world and provider gaps remain canonical instead of being promoted",async()=>{
  const {assessment}=await readAndAssessV05ReleaseReadiness({root});
  assert.equal(assessment.canonical.real_world_workflow,"collecting");
  assert.equal(assessment.canonical.provider_lifecycle,"partial");
});

test("durable requirement source deletion fails readiness validation",async()=>{
  const {config}=await readAndAssessV05ReleaseReadiness({root});
  const changed=structuredClone(config);
  changed.durable_requirement_surfaces.push("docs/does-not-exist-v0.5.md");
  const result=await assessV05ReleaseReadiness(changed,{root});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/durable requirement surface missing/.test(e)));
});
