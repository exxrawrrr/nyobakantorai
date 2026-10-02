import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readAndAssessV071ReleaseReadiness } from "../v0.7.1-release-readiness/index.mjs";

const rootDefault=resolve(import.meta.dirname,"../..");
const clean=(v)=>String(v??"").trim();
const readJson=async(root,path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ref=(prefix,v)=>new RegExp("^"+prefix+":sha256:[a-f0-9]{64}$").test(clean(v));

function assessStaticLeadContracts({leadPolicy,mapPolicy,geoPolicy}){
  const leadLoop=Boolean(
    leadPolicy?.schema===1 &&
    same(leadPolicy.prospecting_loop?.stages,["DISCOVER","ENRICH","SCORE","VERIFY","LEARN"]) &&
    leadPolicy.prospecting_loop?.verified_learning_only===true &&
    leadPolicy.prospecting_loop?.adaptive_change_mode==="PROPOSAL_ONLY" &&
    leadPolicy.prospecting_loop?.completeness_claim_allowed===false
  );
  const adaptive=Boolean(
    leadPolicy.adaptive_queries?.execution_without_review_allowed===false &&
    leadPolicy.adaptive_queries?.provider_execution_authorized_by_review===false &&
    leadPolicy.adaptive_queries?.reviewer_actor==="owner" &&
    leadPolicy.adaptive_queries?.require_evidence_refs===true &&
    geoPolicy.search_expansion?.adaptive_expansion_requires_review===true &&
    geoPolicy.search_expansion?.completeness_claim_allowed===false
  );
  const crm=Boolean(
    leadPolicy.crm_lifecycle?.external_write_default==="BLOCKED" &&
    leadPolicy.crm_lifecycle?.evidence_required_for_every_transition===true &&
    Array.isArray(leadPolicy.crm_lifecycle?.states) &&
    leadPolicy.crm_lifecycle.states.includes("QUALIFIED") &&
    leadPolicy.crm_lifecycle.states.includes("CONTACT_REVIEW") &&
    leadPolicy.crm_lifecycle.states.includes("CONTACTED") &&
    mapPolicy.crm?.external_write_default==="BLOCKED" &&
    mapPolicy.crm?.require_siti_verified===true
  );
  const monitoring=Boolean(
    leadPolicy.monitoring?.normal_scheduler_required===true &&
    leadPolicy.monitoring?.cost_governor_required===true &&
    leadPolicy.monitoring?.raw_provider_content_persistence_allowed===false &&
    leadPolicy.monitoring?.completeness_claim_allowed===false &&
    mapPolicy.monitoring?.require_normal_scheduler===true &&
    mapPolicy.monitoring?.require_cost_governor===true &&
    mapPolicy.monitoring?.raw_provider_content_persistence_allowed===false
  );
  const outreach=Boolean(
    leadPolicy.outreach?.draft_only===true &&
    leadPolicy.outreach?.automatic_send_allowed===false &&
    leadPolicy.outreach?.approval_required===true &&
    leadPolicy.outreach?.external_send_performed_by_package===false &&
    mapPolicy.outreach?.artifact_state==="DRAFT_ONLY" &&
    mapPolicy.outreach?.automatic_send_allowed===false
  );
  return Object.freeze({
    LEAD_LOOP_CONTRACTS:leadLoop?"PASS":"BLOCKED",
    ADAPTIVE_REVIEW_CONTRACTS:adaptive?"PASS":"BLOCKED",
    CRM_LIFECYCLE_CONTRACTS:crm?"PASS":"BLOCKED",
    MONITORING_CONTRACTS:monitoring?"PASS":"BLOCKED",
    OUTREACH_APPROVAL_CONTRACTS:outreach?"PASS":"BLOCKED",
  });
}

function assessLiveLeadEvidence(evidence){
  const prospecting=evidence?.prospecting||{};
  const monitoring=evidence?.monitoring||{};
  const crm=evidence?.crm||{};
  const outreach=evidence?.outreach||{};

  const prospectingPass=Boolean(
    evidence?.schema===1 &&
    evidence?.candidate==="v0.8.0" &&
    prospecting.live_observed===true &&
    ref("lead-prospecting-cycle",prospecting.cycle_ref) &&
    Number.isInteger(prospecting.verified_candidate_count) &&
    prospecting.verified_candidate_count>=1 &&
    Number.isInteger(prospecting.learn_evidence_count) &&
    prospecting.learn_evidence_count>=1 &&
    prospecting.adaptive_change_reviewed===true &&
    prospecting.provider_execution_automatic===false &&
    prospecting.completeness_claim===false
  );

  const monitoringPass=Boolean(
    monitoring.live_observed===true &&
    ref("lead-monitor",monitoring.monitor_ref) &&
    ["COMPETITOR","TERRITORY"].includes(clean(monitoring.kind).toUpperCase()) &&
    Number.isInteger(monitoring.change_ref_count) &&
    monitoring.change_ref_count>=1 &&
    monitoring.normal_scheduler_used===true &&
    monitoring.cost_governor_used===true &&
    monitoring.raw_provider_content_persisted===false &&
    monitoring.completeness_claim===false
  );

  const crmPass=Boolean(
    crm.live_observed===true &&
    ref("crm-lead-lifecycle",crm.record_ref) &&
    crm.verification_bound===true &&
    crm.attributable_sources===true &&
    crm.external_write_performed===false
  );

  const outreachPass=Boolean(
    outreach.live_observed===true &&
    ref("qualified-outreach-package",outreach.package_ref) &&
    outreach.draft_only===true &&
    outreach.approval_request_created===true &&
    outreach.external_send_performed===false &&
    outreach.automatic_send_allowed===false
  );

  return Object.freeze({
    LIVE_PROSPECTING_CYCLE:prospectingPass?"PASS":"BLOCKED",
    LIVE_MONITORING_OBSERVATION:monitoringPass?"PASS":"BLOCKED",
    LIVE_CRM_LIFECYCLE:crmPass?"PASS":"BLOCKED",
    LIVE_OUTREACH_APPROVAL_EVIDENCE:outreachPass?"PASS":"BLOCKED",
  });
}

export async function assessV08ReleaseReadiness(config,{
  root=rootDefault,
  liveEvidenceOverride=null,
  v071Override=null,
}={}){
  const errors=[];
  if(config?.schema!==1) errors.push("v0.8 readiness schema must be 1.");
  if(config?.candidate!=="v0.8.0") errors.push("v0.8 readiness candidate must be v0.8.0.");

  const [liveEvidence,leadPolicy,mapPolicy,geoPolicy,pkg,v071]=await Promise.all([
    liveEvidenceOverride||readJson(root,"config/v0.8-lead-live-evidence.json"),
    readJson(root,"config/lead-intelligence-policy.json"),
    readJson(root,"config/map-mission-crm-policy.json"),
    readJson(root,"config/geo-intelligence-policy.json"),
    readJson(root,"package.json"),
    v071Override||readAndAssessV071ReleaseReadiness({root}),
  ]);

  const staticComponents=assessStaticLeadContracts({leadPolicy,mapPolicy,geoPolicy});
  const liveComponents=assessLiveLeadEvidence(liveEvidence);
  const components=Object.freeze({...staticComponents,...liveComponents});
  const leadBlockers=Object.entries(liveComponents).filter(([,status])=>status!=="PASS").map(([id])=>id);
  const staticBlockers=Object.entries(staticComponents).filter(([,status])=>status!=="PASS").map(([id])=>id);
  const expectedLeadDecision=[...staticBlockers,...leadBlockers].length?"BLOCKED":"PASS";
  const v071Decision=v071.assessment?.decision||"UNKNOWN";
  const expectedBlockers=[
    ...staticBlockers,
    ...leadBlockers,
    ...(v071Decision==="READY"?[]:["V0_7_1_PREREQUISITE"]),
  ];

  const configuredBlockers=(config.release_blockers||[]).map((item)=>item.id);
  if(config.lead_decision!==expectedLeadDecision){
    errors.push("lead_decision drift: configured="+config.lead_decision+" computed="+expectedLeadDecision);
  }
  if(!same(config.lead_evidence?.required_components||[],Object.keys(components))){
    errors.push("lead evidence required component list drift.");
  }
  if(!same(config.lead_evidence?.observed||{},components)){
    errors.push("lead evidence observed status drift.");
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
  if(config.package_version_hold?.candidate!=="0.8.0"){
    errors.push("package version hold candidate must be 0.8.0.");
  }
  if(expectedDecision==="BLOCKED"&&config.package_version_hold?.bump_authorized!==false){
    errors.push("package bump cannot be authorized while v0.8.0 is blocked.");
  }
  if(expectedDecision==="BLOCKED"&&config.promotion?.stable_tag_authorized!==false){
    errors.push("stable tag cannot be authorized while v0.8.0 is blocked.");
  }
  if(expectedDecision==="BLOCKED"&&config.promotion?.publication_authorized!==false){
    errors.push("publication cannot be authorized while v0.8.0 is blocked.");
  }
  if(expectedDecision==="READY"&&pkg.version!=="0.8.0"){
    errors.push("READY requires package.json version 0.8.0.");
  }

  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    decision:expectedDecision,
    lead_decision:expectedLeadDecision,
    components,
    blockers:Object.freeze(expectedBlockers),
    canonical:Object.freeze({
      package_version:pkg.version,
      v0_7_1_prerequisite:v071Decision,
      v0_7_1_blockers:Object.freeze([...(v071.assessment?.blockers||[])]),
      live_prospecting_observed:liveEvidence.prospecting?.live_observed===true,
      live_monitoring_observed:liveEvidence.monitoring?.live_observed===true,
      live_crm_observed:liveEvidence.crm?.live_observed===true,
      live_outreach_observed:liveEvidence.outreach?.live_observed===true,
      coverage_claim:"VERIFIED_OBSERVED_BOUNDED_ONLY",
    }),
    live_evidence:liveEvidence,
  });
}

export function buildV08ReadinessSnapshot({config,assessment}={}){
  if(!assessment?.ok) throw new Error("Cannot build v0.8 readiness snapshot from invalid assessment.");
  return Object.freeze({
    candidate:"v0.8.0",
    lead_decision:assessment.lead_decision,
    decision:assessment.decision,
    blocker_count:assessment.blockers.length,
    blockers:assessment.blockers,
    components:assessment.components,
    package_version:assessment.canonical.package_version,
    package_bump_authorized:config.package_version_hold.bump_authorized,
    stable_tag_authorized:config.promotion.stable_tag_authorized,
    publication_authorized:config.promotion.publication_authorized,
    coverage_claim:"VERIFIED_OBSERVED_BOUNDED_ONLY",
    truth_boundary:"Lead Intelligence release claims require qualifying live prospecting, monitoring, CRM lifecycle, and approval-gated outreach evidence. Deterministic tests do not replace live evidence, prerequisite release readiness, or human authorization for external communication.",
  });
}

export async function readAndAssessV08ReleaseReadiness({root=rootDefault}={}){
  const config=await readJson(root,"config/v0.8-release-readiness.json");
  const assessment=await assessV08ReleaseReadiness(config,{root});
  return Object.freeze({config,assessment});
}
