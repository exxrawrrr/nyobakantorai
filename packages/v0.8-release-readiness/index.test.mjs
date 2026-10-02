import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  assessV08ReleaseReadiness,
  buildV08ReadinessSnapshot,
  readAndAssessV08ReleaseReadiness,
} from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical v0.8.0 Lead Intelligence ledger is valid but blocked by missing live evidence and v0.7.1 prerequisite",async()=>{
  const {config,assessment}=await readAndAssessV08ReleaseReadiness({root});
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.lead_decision,"BLOCKED");
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.blockers,[
    "LIVE_PROSPECTING_CYCLE",
    "LIVE_MONITORING_OBSERVATION",
    "LIVE_CRM_LIFECYCLE",
    "LIVE_OUTREACH_APPROVAL_EVIDENCE",
    "V0_7_1_PREREQUISITE",
  ]);
  assert.equal(assessment.components.LEAD_LOOP_CONTRACTS,"PASS");
  assert.equal(assessment.components.ADAPTIVE_REVIEW_CONTRACTS,"PASS");
  assert.equal(assessment.components.CRM_LIFECYCLE_CONTRACTS,"PASS");
  assert.equal(assessment.components.MONITORING_CONTRACTS,"PASS");
  assert.equal(assessment.components.OUTREACH_APPROVAL_CONTRACTS,"PASS");
  assert.equal(assessment.canonical.package_version,"0.5.1");
  assert.equal(assessment.canonical.v0_7_1_prerequisite,"BLOCKED");

  const snapshot=buildV08ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.package_bump_authorized,false);
  assert.equal(snapshot.stable_tag_authorized,false);
  assert.equal(snapshot.publication_authorized,false);
  assert.match(snapshot.truth_boundary,/live prospecting/i);
});

test("forging config PASS fields cannot override absent qualifying live Lead Intelligence evidence",async()=>{
  const {config}=await readAndAssessV08ReleaseReadiness({root});
  const forged=structuredClone(config);
  forged.lead_decision="PASS";
  forged.decision="READY";
  forged.release_blockers=[];
  for(const key of Object.keys(forged.lead_evidence.observed)) forged.lead_evidence.observed[key]="PASS";
  forged.package_version_hold.bump_authorized=true;
  forged.promotion.stable_tag_authorized=true;
  forged.promotion.publication_authorized=true;

  const result=await assessV08ReleaseReadiness(forged,{root});
  assert.equal(result.ok,false);
  assert.equal(result.lead_decision,"BLOCKED");
  assert.equal(result.decision,"BLOCKED");
  assert.ok(result.errors.some(x=>/lead_decision drift/.test(x)));
  assert.ok(result.errors.some(x=>/release blocker drift/.test(x)));
});

test("complete live Lead Intelligence evidence still cannot leapfrog blocked v0.7.1 prerequisite",async()=>{
  const {config}=await readAndAssessV08ReleaseReadiness({root});
  const live={
    schema:1,candidate:"v0.8.0",
    prospecting:{live_observed:true,cycle_ref:"lead-prospecting-cycle:sha256:"+"a".repeat(64),verified_candidate_count:2,learn_evidence_count:1,adaptive_change_reviewed:true,provider_execution_automatic:false,completeness_claim:false},
    monitoring:{live_observed:true,monitor_ref:"lead-monitor:sha256:"+"b".repeat(64),kind:"COMPETITOR",change_ref_count:1,normal_scheduler_used:true,cost_governor_used:true,raw_provider_content_persisted:false,completeness_claim:false},
    crm:{live_observed:true,record_ref:"crm-lead-lifecycle:sha256:"+"c".repeat(64),verification_bound:true,attributable_sources:true,external_write_performed:false},
    outreach:{live_observed:true,package_ref:"qualified-outreach-package:sha256:"+"d".repeat(64),draft_only:true,approval_request_created:true,external_send_performed:false,automatic_send_allowed:false}
  };
  const fakeV071={assessment:{decision:"BLOCKED",blockers:["LIVE_BOUNDED_GEO_MISSION"]}};
  const changed=structuredClone(config);
  changed.lead_decision="PASS";
  for(const key of Object.keys(changed.lead_evidence.observed)) changed.lead_evidence.observed[key]="PASS";
  changed.release_blockers=[changed.release_blockers.at(-1)];

  const result=await assessV08ReleaseReadiness(changed,{root,liveEvidenceOverride:live,v071Override:fakeV071});
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(result.lead_decision,"PASS");
  assert.equal(result.decision,"BLOCKED");
  assert.deepEqual(result.blockers,["V0_7_1_PREREQUISITE"]);
});

test("v0.8.0 release workflow has dedicated fail-closed readiness guard",async()=>{
  const workflow=await readFile(resolve(root,".github/workflows/release.yml"),"utf8");
  assert.match(workflow,/refs\/tags\/v0\.8\.0/);
  assert.match(workflow,/v0\.8:readiness:require-ready/);
});

test("v0.8 readiness CLI validates BLOCKED ledger but require-ready exits 2",()=>{
  const normal=spawnSync(process.execPath,["scripts/v0.8-release-readiness.mjs"],{cwd:root,encoding:"utf8"});
  assert.equal(normal.status,0,normal.stderr||normal.stdout);
  const payload=JSON.parse(normal.stdout);
  assert.equal(payload.assessment.ok,true);
  assert.equal(payload.assessment.decision,"BLOCKED");

  const required=spawnSync(process.execPath,["scripts/v0.8-release-readiness.mjs","--require-ready"],{cwd:root,encoding:"utf8"});
  assert.equal(required.status,2,required.stderr||required.stdout);
  const requiredPayload=JSON.parse(required.stdout);
  assert.equal(requiredPayload.assessment.decision,"BLOCKED");
  assert.equal(requiredPayload.snapshot.publication_authorized,false);
});
