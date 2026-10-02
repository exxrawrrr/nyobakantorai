import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  assessV071ReleaseReadiness,
  buildV071ReadinessSnapshot,
  readAndAssessV071ReleaseReadiness,
} from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical v0.7.1 geo ledger is valid but publication is blocked by missing live geo evidence and v0.7.0 prerequisite",async()=>{
  const {config,assessment}=await readAndAssessV071ReleaseReadiness({root});
  assert.equal(assessment.ok,true,assessment.errors.join("\n"));
  assert.equal(assessment.geo_decision,"BLOCKED");
  assert.equal(assessment.decision,"BLOCKED");
  assert.deepEqual(assessment.blockers,[
    "LIVE_BOUNDED_GEO_MISSION",
    "LIVE_COST_FIELD_MASK_EVIDENCE",
    "LIVE_RETENTION_ATTRIBUTION_AUDIT",
    "LIVE_DEDUPE_ENRICHMENT_SITI_EVIDENCE",
    "V0_7_0_PREREQUISITE",
  ]);
  assert.equal(assessment.components.GEO_POLICY_CONTRACTS,"PASS");
  assert.equal(assessment.components.GEO_PIPELINE_CONTRACTS,"PASS");
  assert.equal(assessment.components.COVERAGE_CLAIM_BOUNDARY,"PASS");
  assert.equal(assessment.canonical.package_version,"0.5.1");
  assert.equal(assessment.canonical.v0_7_prerequisite,"BLOCKED");

  const snapshot=buildV071ReadinessSnapshot({config,assessment});
  assert.equal(snapshot.package_bump_authorized,false);
  assert.equal(snapshot.stable_tag_authorized,false);
  assert.equal(snapshot.publication_authorized,false);
  assert.match(snapshot.truth_boundary,/observed bounded coverage/);
});

test("forging live PASS fields cannot override absent qualifying live evidence",async()=>{
  const {config}=await readAndAssessV071ReleaseReadiness({root});
  const forged=structuredClone(config);
  forged.geo_decision="PASS";
  forged.decision="READY";
  forged.release_blockers=[];
  for(const key of Object.keys(forged.geo_evidence.observed)) forged.geo_evidence.observed[key]="PASS";
  forged.package_version_hold.bump_authorized=true;
  forged.promotion.stable_tag_authorized=true;
  forged.promotion.publication_authorized=true;

  const result=await assessV071ReleaseReadiness(forged,{root});
  assert.equal(result.ok,false);
  assert.equal(result.geo_decision,"BLOCKED");
  assert.equal(result.decision,"BLOCKED");
  assert.ok(result.errors.some(x=>/geo_decision drift/.test(x)));
  assert.ok(result.errors.some(x=>/release blocker drift/.test(x)));
  assert.ok(result.errors.some(x=>/decision drift/.test(x)));
});

test("even complete geo live evidence cannot leapfrog blocked v0.7.0 prerequisite",async()=>{
  const {config}=await readAndAssessV071ReleaseReadiness({root});
  const live={
    schema:1,
    candidate:"v0.7.1",
    mission:{
      live_observed:true,
      provider:"google-places-new",
      observed_at:"2026-10-02T10:16:42.834Z",
      request_ref:"geo-request:sha256:"+"a".repeat(64),
      field_profile:"TEXT_SEARCH_IDENTITY",
      requested_fields:["places.id","places.name"],
      highest_sku:"TEXT_SEARCH_ESSENTIALS_ID_ONLY",
      numeric_price_pinned:false,
      area_explicit:true,
      result_limit:5,
      returned_place_count:3,
      completeness_claim:false,
      raw_response_persisted:false,
      durable_fields:["place_id"],
      attribution_reviewed:true,
      provider_attribution_required:true
    },
    pipeline:{
      live_observed:true,
      dedupe_evidence:true,
      enrichment_evidence:true,
      siti_verified_profile_count:1,
      source_provenance_preserved:true,
      completeness_claim:false
    }
  };
  const fakeV07={assessment:{decision:"BLOCKED",blockers:["LIVE_BROWSER"]}};
  const changed=structuredClone(config);
  changed.geo_decision="PASS";
  changed.geo_evidence.observed.LIVE_BOUNDED_GEO_MISSION="PASS";
  changed.geo_evidence.observed.LIVE_COST_FIELD_MASK_EVIDENCE="PASS";
  changed.geo_evidence.observed.LIVE_RETENTION_ATTRIBUTION_AUDIT="PASS";
  changed.geo_evidence.observed.LIVE_DEDUPE_ENRICHMENT_SITI_EVIDENCE="PASS";
  changed.release_blockers=[changed.release_blockers.at(-1)];

  const result=await assessV071ReleaseReadiness(changed,{root,liveEvidenceOverride:live,v07Override:fakeV07});
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(result.geo_decision,"PASS");
  assert.equal(result.decision,"BLOCKED");
  assert.deepEqual(result.blockers,["V0_7_0_PREREQUISITE"]);
});

test("v0.7.1 release workflow has a dedicated fail-closed tagged readiness guard",async()=>{
  const workflow=await readFile(resolve(root,".github/workflows/release.yml"),"utf8");
  assert.match(workflow,/refs\/tags\/v0\.7\.1/);
  assert.match(workflow,/v0\.7\.1:readiness:require-ready/);
});

test("v0.7.1 readiness CLI validates BLOCKED ledger but require-ready exits 2",()=>{
  const normal=spawnSync(process.execPath,["scripts/v0.7.1-release-readiness.mjs"],{cwd:root,encoding:"utf8"});
  assert.equal(normal.status,0,normal.stderr||normal.stdout);
  const payload=JSON.parse(normal.stdout);
  assert.equal(payload.assessment.ok,true);
  assert.equal(payload.assessment.decision,"BLOCKED");

  const required=spawnSync(process.execPath,["scripts/v0.7.1-release-readiness.mjs","--require-ready"],{cwd:root,encoding:"utf8"});
  assert.equal(required.status,2,required.stderr||required.stdout);
  const requiredPayload=JSON.parse(required.stdout);
  assert.equal(requiredPayload.assessment.decision,"BLOCKED");
  assert.equal(requiredPayload.snapshot.publication_authorized,false);
});
