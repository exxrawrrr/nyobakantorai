import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createProspectingCycle,
  createAdaptiveQueryProposal,
  reviewAdaptiveQueryProposal,
  applyApprovedQueryProposal,
  createCrmLifecycleRecord,
  transitionCrmLifecycle,
  createCompetitorMonitor,
  createTerritoryMonitor,
  createMonitoringLearningSignal,
  createQualifiedOutreachPackage,
} from "./index.mjs";
import { createSearchExpansionPlan } from "../geo-intelligence/index.mjs";
import { buildCompetitorRadar, createMapMission, createTerritoryPlan } from "../map-missions/index.mjs";

const root=resolve(import.meta.dirname,"../..");
const policy=JSON.parse(await readFile(resolve(root,"config/lead-intelligence-policy.json"),"utf8"));
const geoPolicy=JSON.parse(await readFile(resolve(root,"config/google-places-policy.json"),"utf8"));
const geoIntelligencePolicy=JSON.parse(await readFile(resolve(root,"config/geo-intelligence-policy.json"),"utf8"));
const mapPolicy=JSON.parse(await readFile(resolve(root,"config/map-mission-crm-policy.json"),"utf8"));

function candidate(id,{tier="A",score=90}={}){
  return {
    schema:1,
    crm_lead_id:"crm-lead-identity:sha256:"+id.repeat(64).slice(0,64),
    candidate_ref:"crm-lead-candidate:sha256:"+id.repeat(64).slice(0,64),
    profile_ref:"geo-business-profile:sha256:"+id.repeat(64).slice(0,64),
    verified_profile_ref:"geo-verified-profile:sha256:"+id.repeat(64).slice(0,64),
    place_id:"ChIJ-"+id,
    name:"Lead "+id.toUpperCase(),
    website:"https://"+id+".example",
    business_type:"driver_training",
    phone:"+62 812 0000 0000",
    email:id+"@example.test",
    address:"Surabaya",
    score,
    score_model:"geo-business-fit-v1@1.0.0",
    qualification_tier:tier,
    verification_ref:"siti-verification:sha256:"+id.repeat(64).slice(0,64),
    source_refs:["public-record:"+id],
    source_types:["OFFICIAL_WEBSITE"],
    created_at:"2026-10-02T10:00:00Z",
    updated_at:"2026-10-02T10:00:00Z",
    external_write_state:"NOT_WRITTEN",
    completeness_claim:false,
    candidate_ref_legacy:null,
  };
}

function searchPlan(){
  return createSearchExpansionPlan({
    mission_id:"chat27-prospecting",
    created_at:"2026-10-02T10:00:00Z",
    keywords:["defensive driving training"],
    geographies:[{
      id:"surabaya",
      label:"Surabaya bounded area",
      area:{kind:"RECTANGLE",low:{latitude:-7.4,longitude:112.55},high:{latitude:-7.1,longitude:112.9}},
    }],
  },{policy:geoIntelligencePolicy,geo_policy:geoPolicy});
}

test("prospecting cycle preserves DISCOVER -> ENRICH -> SCORE -> VERIFY -> LEARN and only learns from verified attributable inputs",()=>{
  const lead=candidate("a");
  const cycle=createProspectingCycle({
    cycle_id:"chat27-cycle-1",
    created_at:"2026-10-02T10:10:00Z",
    search_plan_ref:searchPlan().plan_ref,
    verified_candidates:[lead],
    learning_evidence_refs:["lead-change:sha256:"+"b".repeat(64)],
  },{policy});
  assert.deepEqual(cycle.stages,["DISCOVER","ENRICH","SCORE","VERIFY","LEARN"]);
  assert.equal(cycle.verified_only,true);
  assert.equal(cycle.completeness_claim,false);
  assert.equal(cycle.adaptive_execution_allowed,false);
  assert.equal(cycle.candidate_refs[0],lead.candidate_ref);
  assert.ok(cycle.learning_evidence_refs.length===1);
});

test("adaptive query proposal is bounded, review-required and cannot execute before exact review",()=>{
  const cycle=createProspectingCycle({
    cycle_id:"chat27-cycle-2",created_at:"2026-10-02T10:10:00Z",
    search_plan_ref:searchPlan().plan_ref,verified_candidates:[candidate("a")],
    learning_evidence_refs:["lead-change:sha256:"+"c".repeat(64)],
  },{policy});
  const proposal=createAdaptiveQueryProposal({
    cycle,proposed_keywords:["fleet safety training","fleet safety training","driver assessment"],
    reason:"Verified observations suggest two adjacent terms.",
    evidence_refs:cycle.learning_evidence_refs,
    created_at:"2026-10-02T10:20:00Z",
  },{policy});
  assert.equal(proposal.state,"PROPOSED");
  assert.equal(proposal.review_required,true);
  assert.equal(proposal.execution_authorized,false);
  assert.deepEqual(proposal.proposed_keywords,["fleet safety training","driver assessment"]);
  assert.throws(()=>applyApprovedQueryProposal({
    current_plan:searchPlan(),proposal,review:null,
  },{policy,geo_intelligence_policy:geoIntelligencePolicy,geo_policy:geoPolicy}),/approved review/i);
});

test("owner review binds exact proposal and approved query change still respects Geo expansion bounds",()=>{
  const current=searchPlan();
  const cycle=createProspectingCycle({
    cycle_id:"chat27-cycle-3",created_at:"2026-10-02T10:10:00Z",search_plan_ref:current.plan_ref,
    verified_candidates:[candidate("a")],learning_evidence_refs:["learning:chat27"],
  },{policy});
  const proposal=createAdaptiveQueryProposal({
    cycle,proposed_keywords:["fleet safety training"],reason:"Verified evidence-backed learning.",
    evidence_refs:["learning:chat27"],created_at:"2026-10-02T10:20:00Z",
  },{policy});
  const review=reviewAdaptiveQueryProposal(proposal,{
    actor:"owner",decision:"APPROVED",reviewed_at:"2026-10-02T10:21:00Z",note:"Approved one bounded addition."
  },{policy});
  const next=applyApprovedQueryProposal({
    current_plan:current,proposal,review,
  },{policy,geo_intelligence_policy:geoIntelligencePolicy,geo_policy:geoPolicy});
  assert.equal(next.adaptive_change_applied,true);
  assert.equal(next.review_ref,review.review_ref);
  assert.equal(next.plan.completeness_claim,false);
  assert.equal(next.plan.queries.length,2);
  assert.ok(next.plan.queries.some(x=>x.keyword==="fleet safety training"));
});

test("CRM lifecycle is deterministic, attributable, internal-only and rejects impossible transitions",()=>{
  const lead=candidate("a",{tier:"A"});
  const record=createCrmLifecycleRecord(lead,{policy,created_at:"2026-10-02T10:30:00Z"});
  assert.equal(record.state,"QUALIFIED");
  assert.equal(record.external_write_performed,false);
  assert.equal(record.verification_ref,lead.verification_ref);
  const review=transitionCrmLifecycle(record,{
    event:"REQUEST_CONTACT",at:"2026-10-02T10:31:00Z",evidence_refs:[lead.verification_ref]
  },{policy});
  assert.equal(review.state,"CONTACT_REVIEW");
  assert.throws(()=>transitionCrmLifecycle(record,{
    event:"CONVERT",at:"2026-10-02T10:32:00Z",evidence_refs:[lead.verification_ref]
  },{policy}),/transition/i);
});

test("competitor monitor and territory monitor reuse bounded watchlists and normal scheduler contracts",()=>{
  const a=candidate("a"),b=candidate("b",{tier:"B",score:70});
  const radar=buildCompetitorRadar({
    candidates:[a,b],created_at:"2026-10-02T10:40:00Z",
    classifications:[
      {crm_lead_id:a.crm_lead_id,role:"COMPETITOR",reason:"Same market segment.",evidence_refs:[a.verification_ref]},
      {crm_lead_id:b.crm_lead_id,role:"TARGET",reason:"Prospect.",evidence_refs:[b.verification_ref]},
    ],
  },{policy:mapPolicy});
  const competitor=createCompetitorMonitor({
    monitor_id:"competitor-surabaya",radar,candidates:[a,b],interval_days:7,created_at:"2026-10-02T01:00:00Z",
  },{policy,map_policy:mapPolicy});
  assert.equal(competitor.kind,"COMPETITOR");
  assert.equal(competitor.schedule.risk_class,"READ_ONLY");
  assert.equal(competitor.raw_provider_content_persisted,false);

  const map=createMapMission({
    mission_id:"chat27-map",title:"Chat 27 territory",created_at:"2026-10-02T10:42:00Z",candidates:[a,b],
    features:[
      {profile_ref:a.profile_ref,latitude:-7.25,longitude:112.74,source_ref:a.source_refs[0],source_kind:"OFFICIAL_WEBSITE",retention_class:"PUBLIC_DURABLE"},
      {profile_ref:b.profile_ref,latitude:-7.27,longitude:112.76,source_ref:b.source_refs[0],source_kind:"OFFICIAL_WEBSITE",retention_class:"PUBLIC_DURABLE"},
    ],
  },{policy:mapPolicy});
  const territory=createTerritoryPlan({
    mission_id:"chat27-territory",map_mission:map,candidates:[a,b],
    territories:[{id:"sby",label:"Surabaya",area:{kind:"RECTANGLE",low:{latitude:-7.4,longitude:112.55},high:{latitude:-7.1,longitude:112.9}}}],
  },{policy:mapPolicy,geo_policy:geoPolicy});
  const monitor=createTerritoryMonitor({
    monitor_id:"territory-surabaya",territory_plan:territory,candidates:[a,b],interval_days:14,created_at:"2026-10-02T01:00:00Z",
  },{policy,map_policy:mapPolicy});
  assert.equal(monitor.kind,"TERRITORY");
  assert.equal(monitor.watchlist.entries.length,2);
  assert.equal(monitor.schedule.risk_class,"READ_ONLY");
});

test("monitoring observation becomes bounded LEARN evidence and cannot claim market completeness",()=>{
  const monitor={
    monitor_ref:"lead-monitor:sha256:"+"d".repeat(64),kind:"COMPETITOR",
    candidate_refs:[candidate("a").candidate_ref],completeness_claim:false,
  };
  const signal=createMonitoringLearningSignal({
    monitor,observed_at:"2026-10-03T10:00:00Z",
    change_refs:["lead-change:sha256:"+"e".repeat(64)],
    evidence_refs:["public-record:a"],
    suggested_keywords:["fleet safety training"],
  },{policy});
  assert.equal(signal.stage,"LEARN");
  assert.equal(signal.completeness_claim,false);
  assert.equal(signal.auto_apply_allowed,false);
  assert.equal(signal.suggested_keywords.length,1);
});

test("qualified outreach package is draft-only and emits exact Approval Center request, never send authority",()=>{
  const lead=candidate("a");
  const record=createCrmLifecycleRecord(lead,{policy,created_at:"2026-10-02T10:30:00Z"});
  const pack=createQualifiedOutreachPackage({
    record,candidate:lead,channel:"EMAIL",subject:"Training discussion",
    body:"Draft only. Please review before any external communication.",
    created_at:"2026-10-02T11:00:00Z",requested_at:"2026-10-02T11:01:00Z",expires_at:"2026-10-02T12:01:00Z",
  },{policy,map_policy:mapPolicy});
  assert.equal(pack.draft.state,"DRAFT_ONLY");
  assert.equal(pack.draft.automatic_send_allowed,false);
  assert.equal(pack.draft.send_authorized,false);
  assert.deepEqual(pack.approval_request.scope.actions,["outreach.send.email"]);
  assert.equal(pack.external_send_performed,false);
  assert.equal(pack.approval_required,true);
});

test("policy keeps adaptive search, CRM writes and outreach fail-closed",()=>{
  assert.equal(policy.adaptive_queries.execution_without_review_allowed,false);
  assert.equal(policy.crm_lifecycle.external_write_default,"BLOCKED");
  assert.equal(policy.outreach.automatic_send_allowed,false);
  assert.equal(policy.outreach.approval_required,true);
});
