import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeGeoPolicy } from "../geo-core/index.mjs";
import { readAndAssessV07ReleaseReadiness } from "../v0.7-release-readiness/index.mjs";

const rootDefault=resolve(import.meta.dirname,"../..");
const clean=(v)=>String(v??"").trim();
const readJson=async(root,path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const validTime=(v)=>Boolean(clean(v))&&!Number.isNaN(Date.parse(v));

function assessLiveGeoEvidence(evidence,{geoPolicy,geoIntelligencePolicy,mapPolicy}){
  const mission=evidence?.mission||{};
  const pipeline=evidence?.pipeline||{};
  const profile=geoPolicy.field_mask_profiles?.[mission.field_profile];

  const boundedMission=Boolean(
    evidence?.schema===1 &&
    evidence?.candidate==="v0.7.1" &&
    mission.live_observed===true &&
    mission.provider===geoPolicy.provider &&
    validTime(mission.observed_at) &&
    /^geo-request:sha256:[a-f0-9]{64}$/.test(clean(mission.request_ref)) &&
    mission.area_explicit===true &&
    Number.isInteger(mission.result_limit) &&
    mission.result_limit>=1 &&
    mission.result_limit<=20 &&
    Number.isInteger(mission.returned_place_count) &&
    mission.returned_place_count>=0 &&
    mission.returned_place_count<=mission.result_limit &&
    mission.completeness_claim===false
  );

  const costFieldMask=Boolean(
    boundedMission &&
    profile &&
    same(mission.requested_fields,profile.fields) &&
    mission.highest_sku===profile.highest_sku &&
    mission.numeric_price_pinned===false &&
    geoPolicy.production?.explicit_field_mask_required===true &&
    geoPolicy.production?.wildcard_field_mask_allowed===false
  );

  const retentionAttribution=Boolean(
    boundedMission &&
    mission.raw_response_persisted===false &&
    same(mission.durable_fields,["place_id"]) &&
    mission.attribution_reviewed===true &&
    mission.provider_attribution_required===(
      geoPolicy.attribution?.google_maps_attribution_required_when_displaying_provider_content===true
    )
  );

  const pipelinePass=Boolean(
    boundedMission &&
    pipeline.live_observed===true &&
    pipeline.dedupe_evidence===true &&
    pipeline.enrichment_evidence===true &&
    Number.isInteger(pipeline.siti_verified_profile_count) &&
    pipeline.siti_verified_profile_count>=1 &&
    pipeline.source_provenance_preserved===true &&
    pipeline.completeness_claim===false &&
    geoIntelligencePolicy.search_expansion?.completeness_claim_allowed===false &&
    mapPolicy.map_mission?.completeness_claim_allowed===false
  );

  return Object.freeze({
    LIVE_BOUNDED_GEO_MISSION:boundedMission?"PASS":"BLOCKED",
    LIVE_COST_FIELD_MASK_EVIDENCE:costFieldMask?"PASS":"BLOCKED",
    LIVE_RETENTION_ATTRIBUTION_AUDIT:retentionAttribution?"PASS":"BLOCKED",
    LIVE_DEDUPE_ENRICHMENT_SITI_EVIDENCE:pipelinePass?"PASS":"BLOCKED",
  });
}

function assessStaticGeoContracts({geoPolicy,geoIntelligencePolicy,mapPolicy}){
  let policyPass=true;
  try{ normalizeGeoPolicy(geoPolicy); }catch{ policyPass=false; }

  const pipelinePass=Boolean(
    geoIntelligencePolicy?.schema===1 &&
    geoIntelligencePolicy.search_expansion?.completeness_claim_allowed===false &&
    geoIntelligencePolicy.search_expansion?.adaptive_expansion_requires_review===true &&
    geoIntelligencePolicy.enrichment?.access_mode==="PUBLIC_NO_AUTH_READ_ONLY" &&
    geoIntelligencePolicy.enrichment?.raw_page_persistence_allowed===false &&
    mapPolicy?.schema===1 &&
    mapPolicy.map_mission?.require_verified_profiles===true &&
    mapPolicy.map_mission?.provider_location_retention==="EPHEMERAL_PRESENTATION_ONLY" &&
    mapPolicy.crm?.require_siti_verified===true &&
    mapPolicy.crm?.external_write_default==="BLOCKED" &&
    mapPolicy.outreach?.artifact_state==="DRAFT_ONLY" &&
    mapPolicy.outreach?.automatic_send_allowed===false
  );

  const coveragePass=Boolean(
    geoIntelligencePolicy.search_expansion?.completeness_claim_allowed===false &&
    mapPolicy.map_mission?.completeness_claim_allowed===false &&
    mapPolicy.territory_planning?.completeness_claim_allowed===false &&
    /No single query or provider response may be described as exhaustive coverage/i.test(clean(geoPolicy.claim_boundary))
  );

  return Object.freeze({
    GEO_POLICY_CONTRACTS:policyPass?"PASS":"BLOCKED",
    GEO_PIPELINE_CONTRACTS:pipelinePass?"PASS":"BLOCKED",
    COVERAGE_CLAIM_BOUNDARY:coveragePass?"PASS":"BLOCKED",
  });
}

export async function assessV071ReleaseReadiness(config,{
  root=rootDefault,
  liveEvidenceOverride=null,
  v07Override=null,
}={}){
  const errors=[];
  if(config?.schema!==1) errors.push("v0.7.1 readiness schema must be 1.");
  if(config?.candidate!=="v0.7.1") errors.push("v0.7.1 readiness candidate must be v0.7.1.");

  const [liveEvidence,geoPolicy,geoIntelligencePolicy,mapPolicy,pkg,v07]=await Promise.all([
    liveEvidenceOverride||readJson(root,"config/v0.7.1-geo-live-evidence.json"),
    readJson(root,"config/google-places-policy.json"),
    readJson(root,"config/geo-intelligence-policy.json"),
    readJson(root,"config/map-mission-crm-policy.json"),
    readJson(root,"package.json"),
    v07Override||readAndAssessV07ReleaseReadiness({root}),
  ]);

  const staticComponents=assessStaticGeoContracts({geoPolicy,geoIntelligencePolicy,mapPolicy});
  const liveComponents=assessLiveGeoEvidence(liveEvidence,{geoPolicy,geoIntelligencePolicy,mapPolicy});
  const components=Object.freeze({...staticComponents,...liveComponents});
  const geoBlockers=Object.entries(components).filter(([,status])=>status!=="PASS").map(([id])=>id);
  const expectedGeoDecision=geoBlockers.length?"BLOCKED":"PASS";
  const v07Decision=v07.assessment?.decision||"UNKNOWN";
  const expectedBlockers=[
    ...geoBlockers,
    ...(v07Decision==="READY"?[]:["V0_7_0_PREREQUISITE"]),
  ];

  const configuredBlockers=(config.release_blockers||[]).map((item)=>item.id);
  if(config.geo_decision!==expectedGeoDecision){
    errors.push("geo_decision drift: configured="+config.geo_decision+" computed="+expectedGeoDecision);
  }
  if(!same(config.geo_evidence?.required_components||[],Object.keys(components))){
    errors.push("geo evidence required component list drift.");
  }
  if(!same(config.geo_evidence?.observed||{},components)){
    errors.push("geo evidence observed status drift.");
  }
  if(!same(configuredBlockers,expectedBlockers)){
    errors.push("release blocker drift: configured="+JSON.stringify(configuredBlockers)+" computed="+JSON.stringify(expectedBlockers));
  }

  const expectedDecision=expectedBlockers.length?"BLOCKED":"READY";
  if(config.decision!==expectedDecision){
    errors.push("decision drift: configured="+config.decision+" computed="+expectedDecision);
  }
  if(config.package_version_hold?.current!==pkg.version){
    errors.push("package version hold current does not match package.json.");
  }
  if(config.package_version_hold?.candidate!=="0.7.1"){
    errors.push("package version hold candidate must be 0.7.1.");
  }
  if(expectedDecision==="BLOCKED"&&config.package_version_hold?.bump_authorized!==false){
    errors.push("package bump cannot be authorized while v0.7.1 is blocked.");
  }
  if(expectedDecision==="BLOCKED"&&config.promotion?.stable_tag_authorized!==false){
    errors.push("stable tag cannot be authorized while v0.7.1 is blocked.");
  }
  if(expectedDecision==="BLOCKED"&&config.promotion?.publication_authorized!==false){
    errors.push("publication cannot be authorized while v0.7.1 is blocked.");
  }
  if(expectedDecision==="READY"&&pkg.version!=="0.7.1"){
    errors.push("READY requires package.json version 0.7.1.");
  }

  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    decision:expectedDecision,
    geo_decision:expectedGeoDecision,
    components,
    blockers:Object.freeze(expectedBlockers),
    canonical:Object.freeze({
      package_version:pkg.version,
      v0_7_prerequisite:v07Decision,
      v0_7_blockers:Object.freeze([...(v07.assessment?.blockers||[])]),
      live_provider_connection_state:liveEvidence.provider_connection?.state||"UNKNOWN",
      live_mission_observed:liveEvidence.mission?.live_observed===true,
      live_pipeline_observed:liveEvidence.pipeline?.live_observed===true,
      coverage_claim:"OBSERVED_BOUNDED_ONLY",
    }),
    live_evidence:liveEvidence,
  });
}

export function buildV071ReadinessSnapshot({config,assessment}={}){
  if(!assessment?.ok) throw new Error("Cannot build v0.7.1 readiness snapshot from invalid assessment.");
  return Object.freeze({
    candidate:"v0.7.1",
    geo_decision:assessment.geo_decision,
    decision:assessment.decision,
    blocker_count:assessment.blockers.length,
    blockers:assessment.blockers,
    components:assessment.components,
    package_version:assessment.canonical.package_version,
    package_bump_authorized:config.package_version_hold.bump_authorized,
    stable_tag_authorized:config.promotion.stable_tag_authorized,
    publication_authorized:config.promotion.publication_authorized,
    coverage_claim:"OBSERVED_BOUNDED_ONLY",
    truth_boundary:"Geo Intelligence release claims are limited to observed bounded coverage. Deterministic policy/pipeline tests do not replace a qualifying live bounded geo mission, live FieldMask/SKU evidence, live retention/attribution audit, live Siti-verified pipeline evidence, or prerequisite release readiness.",
  });
}

export async function readAndAssessV071ReleaseReadiness({root=rootDefault}={}){
  const config=await readJson(root,"config/v0.7.1-release-readiness.json");
  const assessment=await assessV071ReleaseReadiness(config,{root});
  return Object.freeze({config,assessment});
}
