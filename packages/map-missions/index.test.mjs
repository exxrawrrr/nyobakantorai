import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  normalizePublicSourceRecord,buildBusinessProfile,scoreBusinessProfile,
  verifyBusinessProfileWithSiti,finalizeVerifiedProfile,resolveIdentity,
} from "../geo-intelligence/index.mjs";
import {
  createCrmLeadCandidate,createMapMission,buildDurableMapMissionSummary,buildQualificationVisualization,
  createLeadWatchlist,createWatchlistSchedule,diffLeadCandidate,
  buildCompetitorRadar,createTerritoryPlan,createOutreachDraft,createOutreachApprovalRequest,
  createCrmImportApprovalRequest,createCrmReadyExportPack,
} from "./index.mjs";
import * as mapMissionApi from "./index.mjs";
import { decideApprovalRequest,authorizeWithApproval,materializeScheduledMission } from "../scheduler-approval-center/index.mjs";
import { buildMapMissionViewModel,renderMapMissionMarkup } from "../../office/src/map-mission-view.mjs";

const root=resolve(import.meta.dirname,"../..");
const policy=JSON.parse(await readFile(resolve(root,"config/map-mission-crm-policy.json"),"utf8"));
const geoPolicy=JSON.parse(await readFile(resolve(root,"config/google-places-policy.json"),"utf8"));
const giPolicy=JSON.parse(await readFile(resolve(root,"config/geo-intelligence-policy.json"),"utf8"));
const costPolicy=JSON.parse(await readFile(resolve(root,"config/cost-governor-policy.json"),"utf8"));

async function fixtureBundle({scoreTarget="driver_training"}={}){
  const records=[
    {record_id:"google-alpha",source_ref:"geo-place-id:alpha",source_type:"GOOGLE_PLACES",place_id:"ChIJ-alpha",name:"Alpha Driver Training",website:"https://alpha.example",phone:"+62 812 3456 7890",location:{latitude:-7.25,longitude:112.74},ephemeral_provider_content:true},
    {record_id:"web-alpha",source_ref:"public-record:alpha",source_type:"PUBLIC_WEB",name:"Alpha Driver Training",website:"https://alpha.example/about",phone:"+62 812 3456 7890",location:{latitude:-7.2502,longitude:112.7401}},
  ];
  const resolution=resolveIdentity(records,{policy:giPolicy});
  const cluster=resolution.clusters[0];
  const sources=[
    normalizePublicSourceRecord({
      source_type:"OFFICIAL_WEBSITE",url:"https://alpha.example/about",retrieved_at:"2026-10-02T09:40:00Z",
      claims:[
        {field:"name",value:"Alpha Driver Training"},
        {field:"website",value:"https://alpha.example"},
        {field:"business_type",value:"driver_training"},
        {field:"phone",value:"+62 812 3456 7890"},
        {field:"email",value:"hello@alpha.example"},
        {field:"address",value:"Jl. Alpha 1 Surabaya"},
        {field:"inside_mission_geography",value:true},
        {field:"evidence_fresh",value:true},
      ],
    },{policy:giPolicy}),
    normalizePublicSourceRecord({
      source_type:"PUBLIC_DIRECTORY",url:"https://directory.example/alpha",retrieved_at:"2026-10-02T09:41:00Z",
      claims:[
        {field:"business_type",value:"driver_training"},
        {field:"phone",value:"+62 812 3456 7890"},
        {field:"inside_mission_geography",value:true},
        {field:"evidence_fresh",value:true},
      ],
    },{policy:giPolicy}),
  ];
  const profile=buildBusinessProfile({cluster,public_sources:sources,as_of:"2026-10-02T09:45:00Z"},{policy:giPolicy});
  const score=scoreBusinessProfile(profile,{mission:{target_business_types:[scoreTarget]},policy:giPolicy});
  const verification=await verifyBusinessProfileWithSiti({
    profile,score,author_employee_id:"alex",now:"2026-10-02T09:50:00Z",
    task_id:"chat25-alpha-verification",mission_id:"chat25-map-mission",
  });
  const verified_profile=finalizeVerifiedProfile({profile,score,verification});
  const candidate=createCrmLeadCandidate({profile,score,verification,verified_profile},{policy,created_at:"2026-10-02T10:00:00Z"});
  return {profile,score,verification,verified_profile,candidate,sources};
}

test("verified profile becomes CRM candidate with qualification and without provider-only fields",async()=>{
  const {candidate}=await fixtureBundle();
  assert.equal(candidate.qualification_tier,"A");
  assert.equal(candidate.external_write_state,"NOT_WRITTEN");
  assert.equal(candidate.completeness_claim,false);
  assert.match(candidate.crm_lead_id,/^crm-lead-identity:sha256:[a-f0-9]{64}$/);
  assert.match(candidate.candidate_ref,/^crm-lead-candidate:sha256:[a-f0-9]{64}$/);
  const serialized=JSON.stringify(candidate);
  for(const forbidden of policy.crm.forbidden_fields) assert.equal(serialized.includes('"'+forbidden+'"'),false,forbidden);
});

test("qualification visualization is verified-candidate based and tier counts are deterministic",async()=>{
  const {candidate}=await fixtureBundle();
  const view=buildQualificationVisualization([candidate],{policy});
  assert.equal(view.total,1);
  assert.equal(view.verified_only,true);
  assert.equal(view.tiers.find(x=>x.id==="A").count,1);
  assert.match(view.visualization_ref,/^lead-qualification-view:sha256:[a-f0-9]{64}$/);
});

test("Google Places map location is presentation-only and stripped from durable summary",async()=>{
  const {candidate}=await fixtureBundle();
  const mission=createMapMission({
    mission_id:"map-chat25",title:"Surabaya training prospects",created_at:"2026-10-02T10:05:00Z",
    candidates:[candidate],
    features:[{
      profile_ref:candidate.profile_ref,latitude:-7.25,longitude:112.74,
      source_ref:"geo-place-id:alpha",source_kind:"GOOGLE_PLACES",provider:"google-places-new",
      retention_class:"EPHEMERAL_PROVIDER",google_maps_attribution_required:true,
    }],
  },{policy});
  assert.equal(mission.persistable_view_model,false);
  assert.equal(mission.ephemeral_feature_count,1);
  assert.equal(mission.google_maps_attribution_required,true);
  const durable=buildDurableMapMissionSummary(mission);
  assert.equal(durable.raw_provider_location_persisted,false);
  assert.equal("latitude" in durable.features[0],false);
  assert.equal("longitude" in durable.features[0],false);
  assert.equal(durable.features[0].location_present,true);
});

test("public durable location requires candidate provenance",async()=>{
  const {candidate}=await fixtureBundle();
  assert.throws(()=>createMapMission({
    mission_id:"map-bad",title:"Bad",created_at:"2026-10-02T10:05:00Z",candidates:[candidate],
    features:[{profile_ref:candidate.profile_ref,latitude:-7.25,longitude:112.74,source_ref:"unknown-source",source_kind:"OFFICIAL_WEBSITE",retention_class:"PUBLIC_DURABLE"}],
  },{policy}),/must belong to candidate provenance/);
});

test("Office map view is read-only, attribution-aware, and exposes no write action",async()=>{
  const {candidate}=await fixtureBundle();
  const mission=createMapMission({
    mission_id:"map-ui",title:"UI mission",created_at:"2026-10-02T10:05:00Z",candidates:[candidate],
    features:[{profile_ref:candidate.profile_ref,latitude:-7.25,longitude:112.74,source_ref:"geo-place-id:alpha",source_kind:"GOOGLE_PLACES",provider:"google-places-new",retention_class:"EPHEMERAL_PROVIDER",google_maps_attribution_required:true}],
  },{policy});
  const model=buildMapMissionViewModel(mission,[candidate]);
  assert.equal(model.write_actions_available,false);
  assert.equal(model.completeness_claim,false);
  const html=renderMapMissionMarkup(model);
  assert.match(html,/Google Maps attribution required/);
  assert.match(html,/WRITE ACTIONS: OFF/);
  assert.match(html,/EXHAUSTIVE: NO/);
});

test("CRM-ready export contains verified durable fields only and performs no external write",async()=>{
  const {candidate}=await fixtureBundle();
  const pack=createCrmReadyExportPack({candidates:[candidate],created_at:"2026-10-02T10:10:00Z"},{policy});
  assert.equal(pack.external_write_state,"NOT_WRITTEN");
  assert.equal(pack.outreach_included,false);
  assert.equal(pack.completeness_claim,false);
  assert.match(pack.files["crm-leads.csv"].data,/Alpha Driver Training/);
  assert.equal(pack.files["crm-leads.csv"].data.includes("-7.25"),false);
  assert.equal(Buffer.from(pack.files["crm-leads.xlsx"].data,"base64").subarray(0,2).toString("binary"),"PK");
  const evidence=JSON.parse(pack.files["crm-evidence.json"].data);
  assert.equal(evidence.verified_only,true);
  assert.equal(evidence.external_write_performed,false);
  assert.equal(evidence.outreach_included,false);
});

test("CRM import is approval-gated and scope cannot authorize outreach",async()=>{
  const {candidate}=await fixtureBundle();
  const pack=createCrmReadyExportPack({candidates:[candidate],created_at:"2026-10-02T10:10:00Z"},{policy});
  const request=createCrmImportApprovalRequest(pack,{policy,requested_at:"2026-10-02T10:11:00Z",expires_at:"2026-10-02T11:11:00Z"});
  assert.equal(request.risk_class,"EXTERNAL_WRITE");
  assert.deepEqual(request.scope.actions,["crm.import"]);
  const decision=decideApprovalRequest(request,{actor:"owner",decision:"APPROVED",decided_at:"2026-10-02T10:12:00Z",evidence_ref:"chat25:owner-approval"});
  const good=authorizeWithApproval(request,decision,{action:"crm.import",resource:"crm-dataset:"+pack.crm_export_ref,at:"2026-10-02T10:13:00Z"});
  const bad=authorizeWithApproval(request,decision,{action:"outreach.send.email",resource:"crm-dataset:"+pack.crm_export_ref,at:"2026-10-02T10:13:00Z"});
  assert.equal(good.allowed,true);
  assert.equal(bad.allowed,false);
  assert.equal(bad.reason,"APPROVAL_SCOPE_MISMATCH");
});

test("watchlist stores hashes/refs, not provider raw payloads, and creates normal bounded scheduler work",async()=>{
  const {candidate}=await fixtureBundle();
  const watch=createLeadWatchlist({
    watchlist_id:"chat25-watch",created_at:"2026-10-02T10:20:00Z",interval_days:7,candidates:[candidate],hard_limit_amount:1,
  },{policy});
  assert.equal(watch.raw_provider_content_persisted,false);
  assert.equal(JSON.stringify(watch).includes("Alpha Driver Training"),false);
  assert.match(watch.entries[0].baseline_hashes.name,/^lead-field-value:sha256:/);
  const schedule=createWatchlistSchedule(watch,{policy});
  assert.equal(schedule.risk_class,"READ_ONLY");
  assert.equal(schedule.budget.hard_limit_amount,1);
  assert.ok(schedule.constraints.includes("Do not send outreach."));
  assert.ok(schedule.constraints.includes("Do not write to CRM."));

  const run=materializeScheduledMission({
    schedule,at:"2026-10-09T08:30:00Z",previousRuns:[],costPolicy,costLedger:[],
    estimatedCost:{status:"KNOWN",amount:0.2,currency:"USD"},projectId:"chat25-watch",
    idFactory:(kind,index,label)=>kind+"-"+index+"-"+String(label).replace(/[^a-z0-9]+/gi,"-").toLowerCase(),
  });
  assert.equal(run.dispatched,true);
  assert.equal(run.reason,"NORMAL_MISSION_ENGINE");
  assert.equal(run.cost_decision.action,"ALLOW");
});

test("watchlist diff records bounded changed-field hashes with evidence refs",async()=>{
  const {candidate}=await fixtureBundle();
  const changed={...candidate,phone:"+62 899 1111 2222",candidate_ref:"crm-lead-candidate:changed"};
  const diff=diffLeadCandidate(candidate,changed,{policy,observed_at:"2026-10-03T10:00:00Z"});
  assert.equal(diff.changes.length,1);
  assert.equal(diff.changes[0].field,"phone");
  assert.match(diff.changes[0].before_hash,/^lead-field-value:sha256:/);
  assert.equal(diff.raw_provider_content_persisted,false);
});

test("competitor radar requires evidence for competitor classification",async()=>{
  const {candidate}=await fixtureBundle();
  assert.throws(()=>buildCompetitorRadar({
    candidates:[candidate],created_at:"2026-10-02T10:30:00Z",
    classifications:[{crm_lead_id:candidate.crm_lead_id,role:"COMPETITOR",evidence_refs:[]}],
  },{policy}),/requires evidence/);
  const radar=buildCompetitorRadar({
    candidates:[candidate],created_at:"2026-10-02T10:30:00Z",
    classifications:[{crm_lead_id:candidate.crm_lead_id,role:"COMPETITOR",reason:"Competing training provider in same territory.",evidence_refs:[candidate.verification_ref]}],
  },{policy});
  assert.equal(radar.rows[0].role,"COMPETITOR");
  assert.equal(radar.verified_only,true);
  assert.equal(radar.completeness_claim,false);
});

test("territory planning reuses Geo Core rectangle bounds and returns lead refs without exhaustive claim",async()=>{
  const {candidate}=await fixtureBundle();
  const mission=createMapMission({
    mission_id:"territory-map",title:"Territory map",created_at:"2026-10-02T10:35:00Z",candidates:[candidate],
    features:[{profile_ref:candidate.profile_ref,latitude:-7.25,longitude:112.74,source_ref:"geo-place-id:alpha",source_kind:"GOOGLE_PLACES",provider:"google-places-new",retention_class:"EPHEMERAL_PROVIDER",google_maps_attribution_required:true}],
  },{policy});
  const plan=createTerritoryPlan({
    mission_id:"territory-chat25",map_mission:mission,candidates:[candidate],
    territories:[{id:"west",label:"West Surabaya",area:{kind:"RECTANGLE",low:{latitude:-7.35,longitude:112.60},high:{latitude:-7.15,longitude:112.78}}}],
  },{policy,geo_policy:geoPolicy});
  assert.equal(plan.territories[0].lead_count,1);
  assert.equal(plan.territories[0].leads[0].crm_lead_id,candidate.crm_lead_id);
  assert.equal(plan.completeness_claim,false);
  assert.equal(plan.provider_location_retention_respected,true);
});

test("outreach remains DRAFT_ONLY until exact owner approval; package exports no send function",async()=>{
  const {candidate}=await fixtureBundle();
  const draft=createOutreachDraft({
    candidate,channel:"EMAIL",subject:"Training discussion",body:"Hello, this is a draft only.",created_at:"2026-10-02T10:40:00Z",
  },{policy});
  assert.equal(draft.state,"DRAFT_ONLY");
  assert.equal(draft.automatic_send_allowed,false);
  assert.equal(draft.send_authorized,false);
  const request=createOutreachApprovalRequest(draft,{policy,requested_at:"2026-10-02T10:41:00Z",expires_at:"2026-10-02T11:41:00Z"});
  assert.equal(request.risk_class,"EXTERNAL_WRITE");
  assert.deepEqual(request.scope.actions,["outreach.send.email"]);
  assert.equal(typeof mapMissionApi.sendOutreach,"undefined");
  assert.equal(typeof mapMissionApi.executeOutreach,"undefined");
  assert.equal(typeof mapMissionApi.writeCrm,"undefined");
});

test("outreach approval is exact-draft scoped and cannot authorize another draft/resource",async()=>{
  const {candidate}=await fixtureBundle();
  const draft=createOutreachDraft({candidate,channel:"WHATSAPP",body:"Draft WA message.",created_at:"2026-10-02T10:40:00Z"},{policy});
  const request=createOutreachApprovalRequest(draft,{policy,requested_at:"2026-10-02T10:41:00Z",expires_at:"2026-10-02T11:41:00Z"});
  const decision=decideApprovalRequest(request,{actor:"owner",decision:"APPROVED",decided_at:"2026-10-02T10:42:00Z",evidence_ref:"chat25:owner-outreach"});
  const allowed=authorizeWithApproval(request,decision,{action:"outreach.send.whatsapp",resource:"outreach-draft:"+draft.draft_ref,at:"2026-10-02T10:43:00Z"});
  const other=authorizeWithApproval(request,decision,{action:"outreach.send.whatsapp",resource:"outreach-draft:other",at:"2026-10-02T10:43:00Z"});
  assert.equal(allowed.allowed,true);
  assert.equal(other.allowed,false);
});

test("policy explicitly forbids automatic outreach and requires approval boundary before write",()=>{
  assert.equal(policy.outreach.automatic_send_allowed,false);
  assert.equal(policy.crm.external_write_default,"BLOCKED");
  assert.equal(policy.map_mission.completeness_claim_allowed,false);
  assert.equal(policy.monitoring.raw_provider_content_persistence_allowed,false);
});
