import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  assessV07ReleaseReadiness,
  buildV07ReadinessSnapshot,
  readAndAssessV07ReleaseReadiness,
} from "./index.mjs";
import { assessV07ConnectedEvidence } from "../v0.7-connected-evidence/index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical v0.7.0 ledger is valid but publication is blocked by live evidence and v0.6.1 prerequisite",async()=>{
  const {config,assessment}=await readAndAssessV07ReleaseReadiness({root});
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.connected_office_decision,"BLOCKED");
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.blockers,[
    "READ_ONLY_USER_OWNED_CONNECTORS",
    "LIVE_BROWSER",
    "V0_6_1_PREREQUISITE",
  ]);
  assert.equal(assessment.canonical.read_connector_observations,2);
  assert.equal(assessment.canonical.scoped_write_status,"PASS");
  assert.equal(assessment.canonical.scheduled_mission_status,"PASS");
  assert.equal(assessment.canonical.revocation_status,"PASS");
  assert.equal(assessment.canonical.live_browser_status,"BLOCKED");
  assert.equal(assessment.canonical.v0_6_1_prerequisite,"BLOCKED");
  assert.equal(assessment.canonical.package_version,"0.5.1");

  const snapshot=buildV07ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.package_bump_authorized,false);
  assert.equal(snapshot.stable_tag_authorized,false);
  assert.equal(snapshot.publication_authorized,false);
  assert.equal(snapshot.provider_lifecycle_claim,"PARTIAL");
  assert.match(snapshot.truth_boundary,/does not authorize v0\.7\.0 publication/);
});

test("declaring v0.7.0 READY cannot override computed blockers",async()=>{
  const {config}=await readAndAssessV07ReleaseReadiness({root});
  const forged=structuredClone(config);
  forged.connected_office_decision="PASS";
  forged.decision="READY";
  forged.release_blockers=[];
  forged.connected_evidence.observed.READ_ONLY_USER_OWNED_CONNECTORS="PASS";
  forged.connected_evidence.observed.LIVE_BROWSER="PASS";
  forged.package_version_hold.bump_authorized=true;
  forged.promotion.stable_tag_authorized=true;
  forged.promotion.publication_authorized=true;

  const result=await assessV07ReleaseReadiness(forged,{root});
  assert.equal(result.ok,false);
  assert.equal(result.connected_office_decision,"BLOCKED");
  assert.equal(result.decision,"BLOCKED");
  assert.deepEqual(result.blockers,[
    "READ_ONLY_USER_OWNED_CONNECTORS",
    "LIVE_BROWSER",
    "V0_6_1_PREREQUISITE",
  ]);
  assert.ok(result.errors.some(x=>/connected_office_decision drift/.test(x)));
  assert.ok(result.errors.some(x=>/release blocker drift/.test(x)));
  assert.ok(result.errors.some(x=>/decision drift/.test(x)));
  assert.ok(result.errors.some(x=>/package bump cannot be authorized/.test(x)));
  assert.ok(result.errors.some(x=>/stable tag cannot be authorized/.test(x)));
  assert.ok(result.errors.some(x=>/publication cannot be authorized/.test(x)));
});

test("even if v0.6.1 prerequisite were READY, missing read-only/browser evidence would still block v0.7.0",async()=>{
  const {config}=await readAndAssessV07ReleaseReadiness({root});
  const connected=await assessV07ConnectedEvidence({root});
  const fakeV061={
    assessment:{
      decision:"READY",
      blockers:[],
    }
  };
  const changed=structuredClone(config);
  changed.release_blockers=changed.release_blockers.filter(x=>x.id!=="V0_6_1_PREREQUISITE");
  const result=await assessV07ReleaseReadiness(changed,{root,connectedOverride:connected,v061Override:fakeV061});
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(result.decision,"BLOCKED");
  assert.deepEqual(result.blockers,["READ_ONLY_USER_OWNED_CONNECTORS","LIVE_BROWSER"]);
});

test("v0.7 release workflow has a dedicated fail-closed tagged readiness guard",async()=>{
  const workflow=await readFile(resolve(root,".github/workflows/release.yml"),"utf8");
  assert.match(workflow,/refs\/tags\/v0\.7\.0/);
  assert.match(workflow,/v0\.7:readiness:require-ready/);
});

test("v0.7 readiness CLI validates BLOCKED ledger but require-ready exits 2",()=>{
  const normal=spawnSync(process.execPath,["scripts/v0.7-release-readiness.mjs"],{
    cwd:root,
    encoding:"utf8",
  });
  assert.equal(normal.status,0,normal.stderr||normal.stdout);
  const normalPayload=JSON.parse(normal.stdout);
  assert.equal(normalPayload.assessment.ok,true);
  assert.equal(normalPayload.assessment.decision,"BLOCKED");
  assert.deepEqual(normalPayload.assessment.blockers,[
    "READ_ONLY_USER_OWNED_CONNECTORS",
    "LIVE_BROWSER",
    "V0_6_1_PREREQUISITE",
  ]);

  const required=spawnSync(process.execPath,["scripts/v0.7-release-readiness.mjs","--require-ready"],{
    cwd:root,
    encoding:"utf8",
  });
  assert.equal(required.status,2,required.stderr||required.stdout);
  const requiredPayload=JSON.parse(required.stdout);
  assert.equal(requiredPayload.assessment.decision,"BLOCKED");
  assert.equal(requiredPayload.snapshot.publication_authorized,false);
});

test("connected evidence CLI is valid BLOCKED, while require-pass exits 2",()=>{
  const normal=spawnSync(process.execPath,["scripts/v0.7-connected-evidence.mjs"],{
    cwd:root,
    encoding:"utf8",
  });
  assert.equal(normal.status,0,normal.stderr||normal.stdout);
  const payload=JSON.parse(normal.stdout);
  assert.equal(payload.assessment.connected_office_decision,"BLOCKED");

  const required=spawnSync(process.execPath,["scripts/v0.7-connected-evidence.mjs","--require-pass"],{
    cwd:root,
    encoding:"utf8",
  });
  assert.equal(required.status,2,required.stderr||required.stdout);
});
