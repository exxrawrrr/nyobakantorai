import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createSearchExpansionPlan,
  validateExpansionPlan,
  proposeAdaptiveExpansion,
  normalizeDiscoveryRecord,
  compareIdentity,
  resolveIdentity,
  normalizePublicSourceRecord,
  buildBusinessProfile,
  validateProfileProvenance,
  scoreBusinessProfile,
  finalizeVerifiedProfile,
  verifyBusinessProfileWithSiti,
  validateGeoVerificationBinding,
  createGeoResearchExportPack,
} from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");
const policy=JSON.parse(await readFile(resolve(root,"config/geo-intelligence-policy.json"),"utf8"));
const geoPolicy=JSON.parse(await readFile(resolve(root,"config/google-places-policy.json"),"utf8"));

function plan(){
  return createSearchExpansionPlan({
    mission_id:"mission-chat24-fixture",
    created_at:"2026-10-02T09:00:00.000Z",
    keywords:["driver training","driving school","Driver Training"],
    geographies:[
      {id:"surabaya-west",label:"Surabaya West",area:{kind:"RECTANGLE",low:{latitude:-7.35,longitude:112.60},high:{latitude:-7.15,longitude:112.78}}},
      {id:"surabaya-east",label:"Surabaya East",area:{kind:"RECTANGLE",low:{latitude:-7.35,longitude:112.78},high:{latitude:-7.15,longitude:112.95}}},
    ],
  },{policy,geo_policy:geoPolicy});
}

function discoveryRecords(){
  return [
    {
      record_id:"r-google-alpha",
      source_ref:"geo-place-id:alpha",
      source_type:"GOOGLE_PLACES",
      place_id:"ChIJ-alpha",
      name:"Alpha Driver Training Center",
      website:"https://alpha.example/",
      phone:"+62 812 3456 7890",
      address:"Jl. Example 1 Surabaya",
      location:{latitude:-7.25,longitude:112.74},
      ephemeral_provider_content:true,
    },
    {
      record_id:"r-web-alpha",
      source_ref:"public-source:alpha",
      source_type:"PUBLIC_WEB",
      name:"Alpha Driver Training Centre",
      website:"https://www.alpha.example/training",
      phone:"0812-3456-7890",
      address:"Jl Example 1 Surabaya",
      location:{latitude:-7.2504,longitude:112.7402},
    },
    {
      record_id:"r-beta",
      source_ref:"geo-place-id:beta",
      source_type:"GOOGLE_PLACES",
      place_id:"ChIJ-beta",
      name:"Alpha Driving Academy",
      website:"https://beta.example/",
      phone:"+62 811 2222 3333",
      address:"Jl Different 99 Surabaya",
      location:{latitude:-7.251,longitude:112.741},
      ephemeral_provider_content:true,
    },
  ];
}

function sourceFixtures(){
  return [
    {
      source_type:"OFFICIAL_WEBSITE",
      url:"https://alpha.example/about",
      retrieved_at:"2026-10-02T09:10:00.000Z",
      claims:[
        {field:"name",value:"Alpha Driver Training Center"},
        {field:"website",value:"https://alpha.example/"},
        {field:"business_type",value:"driver_training"},
        {field:"phone",value:"+62 812 3456 7890"},
        {field:"email",value:"training@alpha.example"},
        {field:"address",value:"Jl. Example 1 Surabaya"},
        {field:"inside_mission_geography",value:true},
        {field:"evidence_fresh",value:true},
      ],
    },
    {
      source_type:"PUBLIC_DIRECTORY",
      url:"https://directory.example/alpha-driver-training",
      retrieved_at:"2026-10-02T09:11:00.000Z",
      claims:[
        {field:"name",value:"Alpha Driver Training Center"},
        {field:"business_type",value:"driver_training"},
        {field:"phone",value:"+62 812 3456 7890"},
        {field:"inside_mission_geography",value:true},
        {field:"evidence_fresh",value:true},
      ],
    },
  ];
}

function buildFixtureProfile(){
  const resolved=resolveIdentity(discoveryRecords(),{policy});
  const alpha=resolved.clusters.find(c=>c.place_id==="ChIJ-alpha");
  const sources=sourceFixtures().map(x=>normalizePublicSourceRecord(x,{policy}));
  const profile=buildBusinessProfile({cluster:alpha,public_sources:sources,as_of:"2026-10-02T09:20:00.000Z"},{policy});
  return {resolved,alpha,sources,profile};
}

test("bounded search expansion deduplicates keywords and never claims completeness",()=>{
  const p=plan();
  assert.equal(validateExpansionPlan(p,{policy,geo_policy:geoPolicy}),true);
  assert.equal(p.completeness_claim,false);
  assert.equal(p.queries.length,4);
  assert.deepEqual([...new Set(p.queries.map(x=>x.normalized_keyword))].sort(),["driver training","driving school"]);
  assert.ok(p.queries.every(x=>/^geo-expansion-query:sha256:[a-f0-9]{64}$/.test(x.query_ref)));
  assert.match(p.plan_ref,/^geo-expansion-plan:sha256:[a-f0-9]{64}$/);
  assert.throws(()=>createSearchExpansionPlan({
    mission_id:"too-many",created_at:"2026-10-02T09:00:00.000Z",
    keywords:Array.from({length:13},(_,i)=>"keyword "+i),
    geographies:[{id:"one",label:"One",area:{kind:"RECTANGLE"}}],
  },{policy}),/keyword bound exceeded/);
});

test("adaptive search expansion is proposal-only and evidence-backed",()=>{
  const proposal=proposeAdaptiveExpansion({
    currentPlan:plan(),
    proposedKeywords:["fleet safety training","commercial driver course"],
    reason:"Observed public sites use alternate category language.",
    evidence_refs:["public-source:alpha"],
  },{policy,geo_policy:geoPolicy});
  assert.equal(proposal.review_required,true);
  assert.equal(proposal.approved,false);
  assert.match(proposal.proposal_ref,/^geo-expansion-proposal:sha256:[a-f0-9]{64}$/);
  assert.throws(()=>proposeAdaptiveExpansion({
    currentPlan:plan(),proposedKeywords:["x"],reason:"because",evidence_refs:[],
  },{policy,geo_policy:geoPolicy}),/evidence required/);
});

test("identity resolution merges strong duplicate evidence but never merges fuzzy-name-only records",()=>{
  const records=discoveryRecords().map(normalizeDiscoveryRecord);
  const pair=compareIdentity(records[0],records[1],{policy});
  assert.equal(pair.decision,"MERGE");
  assert.ok(pair.rationale.includes("same_domain"));
  assert.ok(pair.rationale.includes("same_phone"));

  const fuzzy=compareIdentity(
    normalizeDiscoveryRecord({record_id:"f1",source_ref:"s:f1",source_type:"PUBLIC_WEB",name:"Bintang Driver Training"}),
    normalizeDiscoveryRecord({record_id:"f2",source_ref:"s:f2",source_type:"PUBLIC_WEB",name:"Bintang Driving Training"}),
    {policy},
  );
  assert.notEqual(fuzzy.decision,"MERGE");

  const resolved=resolveIdentity(records,{policy});
  assert.equal(resolved.input_record_count,3);
  assert.equal(resolved.cluster_count,2);
  const alpha=resolved.clusters.find(c=>c.place_id==="ChIJ-alpha");
  assert.equal(alpha.record_count,2);
  assert.deepEqual(alpha.source_record_refs.sort(),[records[0].record_ref,records[1].record_ref].sort());
  assert.equal(resolved.completeness_claim,false);
});

test("different non-empty Place IDs are a hard identity conflict even with similar name/location",()=>{
  const [a,,b]=discoveryRecords().map(normalizeDiscoveryRecord);
  const result=compareIdentity(a,b,{policy});
  assert.equal(result.hard_conflict,true);
  assert.equal(result.decision,"KEEP_SEPARATE");
  assert.ok(result.rationale.includes("different_place_id"));
});

test("public enrichment rejects private/local targets, credentials, and raw-page assumptions",()=>{
  assert.throws(()=>normalizePublicSourceRecord({
    source_type:"OFFICIAL_WEBSITE",url:"http://127.0.0.1/admin",retrieved_at:"2026-10-02T09:00:00Z",
    claims:[{field:"name",value:"x"}],
  },{policy}),/Private\/local/);
  assert.throws(()=>normalizePublicSourceRecord({
    source_type:"OFFICIAL_WEBSITE",url:"https://user:pass@example.com/",retrieved_at:"2026-10-02T09:00:00Z",
    claims:[{field:"name",value:"x"}],
  },{policy}),/userinfo forbidden/);
  const source=normalizePublicSourceRecord(sourceFixtures()[0],{policy});
  assert.equal(source.raw_page_persisted,false);
  assert.equal(source.credentials_used,false);
  assert.match(source.source_ref,/^geo-public-source:sha256:[a-f0-9]{64}$/);
  assert.ok(source.claims.every(c=>/^geo-source-claim:sha256:[a-f0-9]{64}$/.test(c.claim_ref)));
});

test("business profile keeps provider raw content out, preserves source provenance, and resolves corroborated fields",()=>{
  const {profile,sources}=buildFixtureProfile();
  assert.equal(validateProfileProvenance(profile,{sources}),true);
  assert.equal(profile.place_id,"ChIJ-alpha");
  assert.equal(profile.raw_provider_content_persisted,false);
  assert.equal(profile.completeness_claim,false);
  assert.equal(profile.fields.name.status,"RESOLVED");
  assert.equal(profile.fields.website.status,"RESOLVED");
  assert.equal(profile.fields.business_type.value,"driver_training");
  assert.equal(profile.source_types.includes("OFFICIAL_WEBSITE"),true);
  assert.equal(profile.source_types.includes("PUBLIC_DIRECTORY"),true);
  const serialized=JSON.stringify(profile);
  assert.equal(serialized.includes("ephemeral_provider_content"),false);
  assert.equal(serialized.includes("Alpha Driving Academy"),false);
});

test("close competing public claims remain an explicit conflict instead of silent overwrite",()=>{
  const resolved=resolveIdentity(discoveryRecords(),{policy});
  const alpha=resolved.clusters.find(c=>c.place_id==="ChIJ-alpha");
  const sources=[
    normalizePublicSourceRecord({
      source_type:"OFFICIAL_WEBSITE",url:"https://alpha.example/contact",retrieved_at:"2026-10-02T09:00:00Z",
      claims:[{field:"phone",value:"+62 812 1111 1111"}],
    },{policy}),
    normalizePublicSourceRecord({
      source_type:"PUBLIC_ORG_PAGE",url:"https://association.example/alpha",retrieved_at:"2026-10-02T09:01:00Z",
      claims:[{field:"phone",value:"+62 812 9999 9999"}],
    },{policy}),
  ];
  const profile=buildBusinessProfile({cluster:alpha,public_sources:sources,as_of:"2026-10-02T09:20:00Z"},{policy});
  assert.equal(profile.fields.phone.status,"CONFLICT");
  assert.equal(profile.fields.phone.value,null);
  assert.equal(profile.fields.phone.alternatives.length,2);
  assert.ok(profile.fields.phone.alternatives.every(x=>x.source_refs.length===1));
});

test("versioned scoring is explainable, capped, and every positive point has evidence",()=>{
  const {profile}=buildFixtureProfile();
  const score=scoreBusinessProfile(profile,{
    mission:{target_business_types:["driver_training"]},
    policy,
  });
  assert.equal(score.model_id,"geo-business-fit-v1");
  assert.equal(score.model_version,"1.0.0");
  assert.equal(score.score,100);
  assert.equal(score.max_score,100);
  assert.equal(score.final_status,"PENDING_VERIFICATION");
  assert.equal(score.explainable,true);
  assert.equal(score.contributions.reduce((n,x)=>n+x.points,0),100);
  for(const c of score.contributions.filter(x=>x.points>0)) assert.ok(c.evidence_refs.length>0,c.criterion_id);
  assert.match(score.score_ref,/^geo-business-score:sha256:[a-f0-9]{64}$/);
});

test("Siti independently verifies a fully evidenced profile and exact profile-score binding",async()=>{
  const {profile}=buildFixtureProfile();
  const score=scoreBusinessProfile(profile,{mission:{target_business_types:["driver_training"]},policy});
  const verified=await verifyBusinessProfileWithSiti({
    profile,score,author_employee_id:"alex",now:"2026-10-02T09:30:00.000Z",
    task_id:"task-chat24-alpha",mission_id:"mission-chat24",
  });
  assert.equal(validateGeoVerificationBinding(verified),true);
  assert.equal(verified.verification.review_state,"PASS");
  assert.equal(verified.verification.decision,"VERIFIED");
  assert.equal(verified.verification.verifier_id,"siti");
  assert.equal(verified.verification.independent,true);
  assert.equal(verified.binding.profile_ref,profile.profile_ref);
  assert.equal(verified.binding.score_ref,score.score_ref);
  assert.match(verified.binding.binding_ref,/^geo-profile-verification:sha256:[a-f0-9]{64}$/);

  const final=finalizeVerifiedProfile({profile,score,verification:verified});
  assert.equal(final.status,"VERIFIED_PROFILE");
  assert.equal(final.verification_ref,verified.verification.verification_ref);
});

test("Siti refuses self-authored or conflicted profiles instead of softening them into VERIFIED",async()=>{
  const {profile}=buildFixtureProfile();
  const score=scoreBusinessProfile(profile,{mission:{target_business_types:["driver_training"]},policy});
  await assert.rejects(()=>verifyBusinessProfileWithSiti({
    profile,score,author_employee_id:"siti",now:"2026-10-02T09:30:00.000Z",
  }),/may not author/);

  const resolved=resolveIdentity(discoveryRecords(),{policy});
  const alpha=resolved.clusters.find(c=>c.place_id==="ChIJ-alpha");
  const conflictSources=[
    normalizePublicSourceRecord({
      source_type:"OFFICIAL_WEBSITE",url:"https://alpha.example",retrieved_at:"2026-10-02T09:00:00Z",
      claims:[{field:"business_type",value:"driver_training"},{field:"phone",value:"+62 812 1111 1111"}],
    },{policy}),
    normalizePublicSourceRecord({
      source_type:"PUBLIC_ORG_PAGE",url:"https://association.example/alpha",retrieved_at:"2026-10-02T09:01:00Z",
      claims:[{field:"phone",value:"+62 812 9999 9999"}],
    },{policy}),
  ];
  const conflicted=buildBusinessProfile({cluster:alpha,public_sources:conflictSources,as_of:"2026-10-02T09:20:00Z"},{policy});
  const conflictScore=scoreBusinessProfile(conflicted,{mission:{target_business_types:["driver_training"]},policy});
  const result=await verifyBusinessProfileWithSiti({
    profile:conflicted,score:conflictScore,author_employee_id:"alex",now:"2026-10-02T09:30:00Z",
    task_id:"task-chat24-conflict",
  });
  assert.notEqual(result.verification.review_state,"PASS");
  assert.equal(result.verification.decision,"NOT_VERIFIED");
  assert.throws(()=>finalizeVerifiedProfile({profile:conflicted,score:conflictScore,verification:result}),/Siti PASS/);
});

test("tampered verification binding is rejected before export/finalization",async()=>{
  const {profile}=buildFixtureProfile();
  const score=scoreBusinessProfile(profile,{mission:{target_business_types:["driver_training"]},policy});
  const verified=await verifyBusinessProfileWithSiti({
    profile,score,author_employee_id:"alex",now:"2026-10-02T09:30:00Z",task_id:"task-chat24-tamper",
  });
  const tampered={...verified,binding:{...verified.binding,profile_ref:"geo-business-profile:sha256:"+"0".repeat(64)}};
  assert.throws(()=>validateGeoVerificationBinding(tampered),/checksum mismatch/);
});

test("export pack produces CSV, actual XLSX zip, Markdown report, and provenance evidence without exhaustive/raw-provider claims",async()=>{
  const p=plan();
  const {profile,sources}=buildFixtureProfile();
  const score=scoreBusinessProfile(profile,{mission:{target_business_types:["driver_training"]},policy});
  const verification=await verifyBusinessProfileWithSiti({
    profile,score,author_employee_id:"alex",now:"2026-10-02T09:30:00Z",task_id:"task-chat24-export",
  });
  const pack=createGeoResearchExportPack({
    expansion_plan:p,profiles:[profile],scores:[score],verifications:[verification],sources,
    created_at:"2026-10-02T09:35:00Z",
  });
  assert.match(pack.pack_ref,/^geo-export-pack:sha256:[a-f0-9]{64}$/);
  assert.equal(pack.completeness_claim,false);
  assert.deepEqual(Object.keys(pack.files).sort(),["evidence.json","profiles.csv","profiles.xlsx","report.md"]);
  assert.match(pack.files["profiles.csv"].data,/Alpha Driver Training Center/);
  assert.match(pack.files["profiles.csv"].data,/PASS/);
  assert.match(pack.files["report.md"].data,/does not claim exhaustive market coverage/);
  const xlsx=Buffer.from(pack.files["profiles.xlsx"].data,"base64");
  assert.equal(xlsx.subarray(0,2).toString("binary"),"PK");
  assert.ok(xlsx.includes(Buffer.from("xl/worksheets/sheet1.xml")));
  assert.ok(xlsx.includes(Buffer.from("Alpha Driver Training Center")));
  const evidence=JSON.parse(pack.files["evidence.json"].data);
  assert.equal(evidence.completeness_claim,false);
  assert.equal(evidence.raw_provider_content_included,false);
  assert.equal(evidence.verifications[0].profile_ref,profile.profile_ref);
  assert.equal(evidence.verifications[0].review_state,"PASS");
  assert.equal(JSON.stringify(evidence).includes("ephemeral_provider_content"),false);
});

test("final export rejects unverified profiles unless draft mode is explicitly requested",()=>{
  const p=plan();
  const {profile,sources}=buildFixtureProfile();
  const score=scoreBusinessProfile(profile,{mission:{target_business_types:["driver_training"]},policy});
  assert.throws(()=>createGeoResearchExportPack({
    expansion_plan:p,profiles:[profile],scores:[score],verifications:[],sources,created_at:"2026-10-02T09:35:00Z",
  }),/requires Siti PASS/);
  const draft=createGeoResearchExportPack({
    expansion_plan:p,profiles:[profile],scores:[score],verifications:[],sources,created_at:"2026-10-02T09:35:00Z",
    require_all_verified:false,
  });
  assert.equal(draft.completeness_claim,false);
  assert.match(draft.files["profiles.csv"].data,/NOT_RUN/);
});

test("export fails closed on mismatched score/profile binding",async()=>{
  const p=plan();
  const {profile,sources}=buildFixtureProfile();
  const score=scoreBusinessProfile(profile,{mission:{target_business_types:["driver_training"]},policy});
  const wrong={...score,profile_ref:"geo-business-profile:sha256:"+"1".repeat(64)};
  assert.throws(()=>createGeoResearchExportPack({
    expansion_plan:p,profiles:[profile],scores:[wrong],verifications:[],sources,created_at:"2026-10-02T09:35:00Z",
  }),/score binding missing/);
});
