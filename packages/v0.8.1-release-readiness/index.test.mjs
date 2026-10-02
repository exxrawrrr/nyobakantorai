import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assessV081ReleaseReadiness,buildV081ReadinessSnapshot,readAndAssessV081ReleaseReadiness } from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical v0.8.1 ledger is valid but blocked by live evidence and v0.8.0 prerequisite",async()=>{
  const {config,assessment}=await readAndAssessV081ReleaseReadiness({root});
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.mission_control_decision,"BLOCKED");
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.blockers,["LIVE_LONG_RUNNING_MISSION","LIVE_HARDENED_SANDBOX_OBSERVATION","V0_8_0_PREREQUISITE"]);
  assert.equal(assessment.components.MISSION_CONTROL_CONTRACTS,"PASS");
  assert.equal(assessment.components.SANDBOX_HARDENING_CONTRACTS,"PASS");
  assert.equal(assessment.components.PAUSE_RECOVERY_CONTRACTS,"PASS");
  assert.equal(assessment.canonical.package_version,"0.5.1");
  const snapshot=buildV081ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.publication_authorized,false);
  assert.match(snapshot.truth_boundary,/live pause\/resume/i);
});

test("forged READY fields cannot replace missing live v0.8.1 evidence",async()=>{
  const {config}=await readAndAssessV081ReleaseReadiness({root});
  const forged=structuredClone(config);
  forged.mission_control_decision="PASS"; forged.decision="READY"; forged.release_blockers=[];
  for(const k of Object.keys(forged.evidence.observed))forged.evidence.observed[k]="PASS";
  forged.package_version_hold.bump_authorized=true; forged.promotion.stable_tag_authorized=true; forged.promotion.publication_authorized=true;
  const result=await assessV081ReleaseReadiness(forged,{root});
  assert.equal(result.ok,false);
  assert.equal(result.decision,"BLOCKED");
  assert.ok(result.errors.some(x=>/drift/.test(x)));
});

test("complete live CHAT 28 evidence cannot leapfrog blocked v0.8.0",async()=>{
  const {config}=await readAndAssessV081ReleaseReadiness({root});
  const live={schema:1,candidate:"v0.8.1",
    long_running_mission:{live_observed:true,control_ref:"mission-control-run:sha256:"+"a".repeat(64),checkpoint_ref:"checkpoint:sha256:"+"b".repeat(64),resumed_from_checkpoint:true,stoppable:true,inspectable:true,budgeted:true,permission_scoped:true},
    hardened_sandbox:{live_observed:true,hardening_ref:"sandbox-hardening:sha256:"+"c".repeat(64),filesystem_boundary_observed:true,ephemeral_browser_observed:true,network_allowlist_observed:true,resource_ceiling_observed:true,credential_reference_only_observed:true,application_level_guard:true,os_container_isolation_claim:false}
  };
  const changed=structuredClone(config);
  changed.mission_control_decision="PASS";
  for(const k of Object.keys(changed.evidence.observed))changed.evidence.observed[k]="PASS";
  changed.release_blockers=[changed.release_blockers.at(-1)];
  const result=await assessV081ReleaseReadiness(changed,{root,liveEvidenceOverride:live,v08Override:{assessment:{decision:"BLOCKED",blockers:["LIVE_PROSPECTING_CYCLE"]}}});
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(result.mission_control_decision,"PASS");
  assert.deepEqual(result.blockers,["V0_8_0_PREREQUISITE"]);
});

test("v0.8.1 release workflow has dedicated fail-closed readiness guard",async()=>{
  const workflow=await readFile(resolve(root,".github/workflows/release.yml"),"utf8");
  assert.match(workflow,/refs\/tags\/v0\.8\.1/);
  assert.match(workflow,/v0\.8\.1:readiness:require-ready/);
});

test("v0.8.1 readiness CLI validates BLOCKED ledger but require-ready exits 2",()=>{
  const normal=spawnSync(process.execPath,["scripts/v0.8.1-release-readiness.mjs"],{cwd:root,encoding:"utf8"});
  assert.equal(normal.status,0,normal.stderr||normal.stdout);
  assert.equal(JSON.parse(normal.stdout).assessment.decision,"BLOCKED");
  const required=spawnSync(process.execPath,["scripts/v0.8.1-release-readiness.mjs","--require-ready"],{cwd:root,encoding:"utf8"});
  assert.equal(required.status,2,required.stderr||required.stdout);
  assert.equal(JSON.parse(required.stdout).snapshot.publication_authorized,false);
});
