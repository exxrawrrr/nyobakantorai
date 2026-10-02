import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { assessV09ReleaseReadiness,buildV09ReadinessSnapshot,readAndAssessV09ReleaseReadiness } from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical v0.9.0 Team Office ledger is valid but blocked by live evidence and v0.8.1 prerequisite",async()=>{
  const {config,assessment}=await readAndAssessV09ReleaseReadiness({root});
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.team_office_decision,"BLOCKED");
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.blockers,[
    "LIVE_MULTI_USER_ISOLATION",
    "LIVE_DELEGATED_APPROVAL",
    "LIVE_SHARED_AUDIT_OBSERVATION",
    "V0_8_1_PREREQUISITE",
  ]);
  assert.equal(assessment.components.TEAM_IDENTITY_RBAC_CONTRACTS,"PASS");
  assert.equal(assessment.components.DELEGATED_APPROVAL_CONTRACTS,"PASS");
  assert.equal(assessment.components.WORKSPACE_RESOURCE_SCOPE_CONTRACTS,"PASS");
  assert.equal(assessment.components.SHARED_AUDIT_CONTRACTS,"PASS");
  assert.equal(assessment.canonical.package_version,"0.5.1");
  const snapshot=buildV09ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.publication_authorized,false);
  assert.match(snapshot.truth_boundary,/live multi-user isolation/i);
});

test("forged READY fields cannot replace missing live Team Office evidence",async()=>{
  const {config}=await readAndAssessV09ReleaseReadiness({root});
  const forged=structuredClone(config);
  forged.team_office_decision="PASS"; forged.decision="READY"; forged.release_blockers=[];
  for(const k of Object.keys(forged.evidence.observed))forged.evidence.observed[k]="PASS";
  forged.package_version_hold.bump_authorized=true; forged.promotion.stable_tag_authorized=true; forged.promotion.publication_authorized=true;
  const result=await assessV09ReleaseReadiness(forged,{root});
  assert.equal(result.ok,false);
  assert.equal(result.decision,"BLOCKED");
  assert.ok(result.errors.some(x=>/drift/.test(x)));
});

test("complete live CHAT 29 evidence cannot leapfrog blocked v0.8.1",async()=>{
  const {config}=await readAndAssessV09ReleaseReadiness({root});
  const live={
    schema:1,candidate:"v0.9.0",
    multi_user_isolation:{live_observed:true,workspace_ref:"team-workspace:sha256:"+"a".repeat(64),project_a_ref:"project:alpha",project_b_ref:"project:beta",cross_project_denial_ref:"evidence:deny",rbac_authorization_ref:"team-authorization:sha256:"+"b".repeat(64),data_bleed_observed:false},
    delegated_approval:{live_observed:true,approval_ref:"approval-request:sha256:"+"c".repeat(64),delegation_ref:"approval-delegation:sha256:"+"d".repeat(64),decision_ref:"delegated-approval-decision:sha256:"+"e".repeat(64),exact_scope_enforced:true,owner_impersonation_used:false},
    shared_audit:{live_observed:true,audit_head_ref:"team-audit-event:sha256:"+"f".repeat(64),multiple_human_actors_observed:true,cross_project_events_separated:true,tamper_check_passed:true},
  };
  const changed=structuredClone(config);
  changed.team_office_decision="PASS";
  for(const k of Object.keys(changed.evidence.observed))changed.evidence.observed[k]="PASS";
  changed.release_blockers=[changed.release_blockers.at(-1)];
  const result=await assessV09ReleaseReadiness(changed,{root,liveEvidenceOverride:live,v081Override:{assessment:{decision:"BLOCKED",blockers:["LIVE_LONG_RUNNING_MISSION"]}}});
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(result.team_office_decision,"PASS");
  assert.deepEqual(result.blockers,["V0_8_1_PREREQUISITE"]);
});

test("v0.9.0 release workflow has dedicated fail-closed readiness guard",async()=>{
  const workflow=await readFile(resolve(root,".github/workflows/release.yml"),"utf8");
  assert.match(workflow,/refs\/tags\/v0\.9\.0/);
  assert.match(workflow,/v0\.9:readiness:require-ready/);
});

test("v0.9 readiness CLI validates BLOCKED ledger but require-ready exits 2",()=>{
  const normal=spawnSync(process.execPath,["scripts/v0.9-release-readiness.mjs"],{cwd:root,encoding:"utf8"});
  assert.equal(normal.status,0,normal.stderr||normal.stdout);
  assert.equal(JSON.parse(normal.stdout).assessment.decision,"BLOCKED");
  const required=spawnSync(process.execPath,["scripts/v0.9-release-readiness.mjs","--require-ready"],{cwd:root,encoding:"utf8"});
  assert.equal(required.status,2,required.stderr||required.stdout);
  assert.equal(JSON.parse(required.stdout).snapshot.publication_authorized,false);
});

test("release manifest check surfaces v0.9 Team Office readiness",()=>{
  const result=spawnSync(process.execPath,["scripts/release-manifest.mjs","--check"],{cwd:root,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/v0\.9_team_office=BLOCKED/);
  assert.match(result.stdout,/v0\.9_readiness=BLOCKED\(4\)/);
});
