import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { assessV1ReleaseReadiness,buildV1ReadinessSnapshot,readAndAssessV1ReleaseReadiness } from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical v1.0 production convergence is valid NO_GO with truthful evidence blockers",async()=>{
  const {config,assessment}=await readAndAssessV1ReleaseReadiness({root});
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.production_decision,"NO_GO");
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.blockers,[
    "REAL_WORLD_WORKFLOW_EVIDENCE",
    "PROVIDER_LIFECYCLE_MATURITY",
    "REPRESENTATIVE_RECOVERY_EVIDENCE",
    "INSTALL_MIGRATION_FRESH_MATRIX",
    "V0_9_PREREQUISITE",
  ]);
  assert.equal(assessment.components.SECURITY_CONTROL_CONVERGENCE,"PASS");
  assert.equal(assessment.components.RELEASE_CLAIM_AUDIT,"PASS");
  assert.equal(assessment.canonical.real_world_cases,1);
  assert.equal(assessment.canonical.real_world_minimum,20);
  assert.equal(assessment.canonical.provider_lifecycle,"partial");
  assert.equal(assessment.canonical.package_version,"0.5.1");
  const snapshot=buildV1ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.publication_authorized,false);
  assert.equal(snapshot.highest_truthful_pre_v1,"0.5.1");
  assert.match(snapshot.truth_boundary,/Static tests or schedule pressure cannot substitute/i);
});

test("forged v1 READY fields cannot override canonical production evidence",async()=>{
  const {config}=await readAndAssessV1ReleaseReadiness({root});
  const forged=structuredClone(config);
  forged.production_decision="GO";
  forged.decision="READY";
  forged.release_blockers=[];
  for(const key of Object.keys(forged.evidence.observed))forged.evidence.observed[key]="PASS";
  forged.package_version_hold.bump_authorized=true;
  forged.promotion.stable_tag_authorized=true;
  forged.promotion.publication_authorized=true;
  const result=await assessV1ReleaseReadiness(forged,{root});
  assert.equal(result.ok,false);
  assert.equal(result.production_decision,"NO_GO");
  assert.equal(result.decision,"BLOCKED");
  assert.ok(result.errors.some((x)=>/drift|authorized/.test(x)));
});

test("a passing install matrix cannot leapfrog real-world provider recovery or v0.9 blockers",async()=>{
  const {config,assessment}=await readAndAssessV1ReleaseReadiness({root});
  const evidence=structuredClone(assessment.production_evidence);
  evidence.install_matrix={
    live_observed:true,
    source_commit:"a".repeat(40),
    clean_source:true,
    isolated_python_env:true,
    one_worker:true,
    subset:true,
    full:true,
    lifecycle:true,
    log_sha256:"b".repeat(64),
  };
  const changed=structuredClone(config);
  changed.evidence.observed.INSTALL_MIGRATION_FRESH_MATRIX="PASS";
  changed.release_blockers=changed.release_blockers.filter((x)=>x.id!=="INSTALL_MIGRATION_FRESH_MATRIX");
  const result=await assessV1ReleaseReadiness(changed,{root,productionEvidenceOverride:evidence});
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.deepEqual(result.blockers,[
    "REAL_WORLD_WORKFLOW_EVIDENCE",
    "PROVIDER_LIFECYCLE_MATURITY",
    "REPRESENTATIVE_RECOVERY_EVIDENCE",
    "V0_9_PREREQUISITE",
  ]);
  assert.equal(result.production_decision,"NO_GO");
});

test("manual GO cannot override technical production blockers",async()=>{
  const {config,assessment}=await readAndAssessV1ReleaseReadiness({root});
  const evidence=structuredClone(assessment.production_evidence);
  evidence.manual_gate={status:"COMPLETE",decision:"GO",approval_ref:"manual-release:sha256:"+"c".repeat(64),reason:"forced"};
  const result=await assessV1ReleaseReadiness(config,{root,productionEvidenceOverride:evidence});
  assert.equal(result.ok,false);
  assert.equal(result.decision,"BLOCKED");
  assert.ok(result.errors.some((x)=>/manual GO cannot override/i.test(x)));
});

test("v1.0.0 release workflow has a dedicated fail-closed production readiness guard",async()=>{
  const workflow=await readFile(resolve(root,".github/workflows/release.yml"),"utf8");
  assert.match(workflow,/refs\/tags\/v1\.0\.0/);
  assert.match(workflow,/v1\.0:readiness:require-ready/);
});

test("v1 readiness CLI validates NO_GO ledger but require-ready exits 2",()=>{
  const normal=spawnSync(process.execPath,["scripts/v1.0-release-readiness.mjs"],{cwd:root,encoding:"utf8"});
  assert.equal(normal.status,0,normal.stderr||normal.stdout);
  assert.equal(JSON.parse(normal.stdout).assessment.production_decision,"NO_GO");
  const required=spawnSync(process.execPath,["scripts/v1.0-release-readiness.mjs","--require-ready"],{cwd:root,encoding:"utf8"});
  assert.equal(required.status,2,required.stderr||required.stdout);
  assert.equal(JSON.parse(required.stdout).snapshot.publication_authorized,false);
});

test("release manifest check surfaces v1.0 production convergence decision",()=>{
  const result=spawnSync(process.execPath,["scripts/release-manifest.mjs","--check"],{cwd:root,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/v1\.0_production=NO_GO/);
  assert.match(result.stdout,/v1\.0_readiness=BLOCKED\(5\)/);
});
