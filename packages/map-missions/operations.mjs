import { contentRef,assert,clean,freeze,iso,uniq } from "../geo-intelligence/common.mjs";
import { normalizeGeoDiscoveryRequest } from "../geo-core/index.mjs";
import { createApprovalRequest } from "../scheduler-approval-center/index.mjs";

export function buildCompetitorRadar({candidates=[],classifications=[],created_at}={}, {policy}={}){
  assert(candidates.length>0,"Competitor radar candidates required.");
  assert(candidates.length<=Number(policy.competitor_radar.max_entities),"Competitor radar entity bound exceeded.");
  const byId=new Map(candidates.map(x=>[x.crm_lead_id,x]));
  const rows=[];
  for(const item of classifications){
    const lead=byId.get(clean(item?.crm_lead_id,1000));
    assert(lead,"Competitor classification lead not found.");
    const role=clean(item?.role,30).toUpperCase();
    assert(policy.competitor_radar.allowed_roles.includes(role),"Competitor role invalid.");
    const refs=uniq((item?.evidence_refs||[]).map(x=>clean(x,1000)).filter(Boolean));
    if(role==="COMPETITOR"&&policy.competitor_radar.competitor_classification_requires_evidence===true) assert(refs.length>0,"Competitor classification requires evidence.");
    rows.push(freeze({
      crm_lead_id:lead.crm_lead_id,candidate_ref:lead.candidate_ref,profile_ref:lead.profile_ref,
      role,score:lead.score,qualification_tier:lead.qualification_tier,
      reason:clean(item?.reason,1200)||null,evidence_refs:refs.sort(),
    }));
  }
  const createdAt=iso(created_at,"Competitor radar created_at");
  const core={schema:1,created_at:createdAt,rows:rows.sort((a,b)=>b.score-a.score||a.crm_lead_id.localeCompare(b.crm_lead_id)),
    verified_only:true,completeness_claim:false};
  return freeze({...core,radar_ref:contentRef("competitor-radar",core)});
}

function inside(point,rect){
  return point.latitude>=rect.low.latitude&&point.latitude<=rect.high.latitude&&
    point.longitude>=rect.low.longitude&&point.longitude<=rect.high.longitude;
}
export function createTerritoryPlan({mission_id,territories=[],map_mission,candidates=[]}={}, {policy,geo_policy}={}){
  assert(map_mission?.map_mission_ref,"Territory plan requires map mission.");
  assert(territories.length>0&&territories.length<=Number(policy.territory_planning.max_territories),"Territory count out of bounds.");
  const byProfile=new Map(candidates.map(x=>[x.profile_ref,x]));
  const normalized=territories.map((t,index)=>{
    const id=clean(t?.id,120),label=clean(t?.label||id,240);
    assert(id&&label,"Territory id/label required.");
    const probe=normalizeGeoDiscoveryRequest({
      schema:1,operation:"TEXT_SEARCH",environment:"production",field_profile:"TEXT_SEARCH_IDENTITY",
      query:"territory-bound-validation",area:t.area,page_size:1,page_number:1,mission_request_index:index+1,
    },{policy:geo_policy});
    return {id,label,area:probe.area};
  });
  const rows=normalized.map(t=>{
    const leads=[];
    for(const feature of map_mission.features||[]){
      if(!Number.isFinite(feature.latitude)||!Number.isFinite(feature.longitude)) continue;
      if(!inside(feature,t.area)) continue;
      const lead=byProfile.get(feature.profile_ref);
      if(lead) leads.push({crm_lead_id:lead.crm_lead_id,profile_ref:lead.profile_ref,score:lead.score,qualification_tier:lead.qualification_tier});
    }
    assert(leads.length<=Number(policy.territory_planning.max_profiles_per_territory),"Territory profile bound exceeded.");
    return freeze({territory_id:t.id,label:t.label,area:t.area,lead_count:leads.length,
      leads:leads.sort((a,b)=>b.score-a.score||a.crm_lead_id.localeCompare(b.crm_lead_id))});
  });
  const core={schema:1,mission_id:clean(mission_id,160),map_mission_ref:map_mission.map_mission_ref,
    territories:rows,completeness_claim:false,provider_location_retention_respected:true};
  assert(core.mission_id,"Territory mission_id required.");
  return freeze({...core,territory_plan_ref:contentRef("territory-plan",core)});
}

export function createOutreachDraft({candidate,channel,subject,body,created_at}={}, {policy}={}){
  assert(candidate?.candidate_ref&&candidate?.verification_ref,"Outreach draft requires verified CRM candidate.");
  const ch=clean(channel,40).toUpperCase();
  assert(policy.outreach.allowed_channels.includes(ch),"Outreach channel invalid.");
  const core={
    schema:1,crm_lead_id:candidate.crm_lead_id,candidate_ref:candidate.candidate_ref,
    channel:ch,subject:clean(subject,500)||null,body:clean(body,8000),
    created_at:iso(created_at,"Outreach draft created_at"),
    state:policy.outreach.artifact_state,automatic_send_allowed:false,send_authorized:false,
    verification_ref:candidate.verification_ref,source_refs:[...(candidate.source_refs||[])],
  };
  assert(core.body,"Outreach draft body required.");
  assert(core.state==="DRAFT_ONLY"&&policy.outreach.automatic_send_allowed===false,"Outreach policy must remain draft-only.");
  return freeze({...core,draft_ref:contentRef("outreach-draft",core)});
}

export function createOutreachApprovalRequest(draft,{policy,requested_at,expires_at}={}){
  assert(draft?.state==="DRAFT_ONLY"&&draft?.send_authorized===false,"Only unsent draft may request outreach approval.");
  const action=policy.outreach.approval_action_prefix+draft.channel.toLowerCase();
  const resource="outreach-draft:"+draft.draft_ref;
  return createApprovalRequest({
    schema:1,approval_id:"approval-"+draft.draft_ref.slice(-24),
    target:{type:"OUTREACH_SEND",id:draft.draft_ref},
    risk_class:policy.outreach.external_send_risk_class,
    budget:{hard_limit_amount:null,currency:null},
    reason:"Review and authorize one bounded outreach draft. Approval is permission only and does not prove delivery.",
    evidence_refs:[draft.draft_ref,draft.verification_ref],
    preview:(draft.subject?draft.subject+"\n\n":"")+draft.body,
    scope:{actions:[action],resources:[resource]},
    requested_at,expires_at,
  });
}

export function createCrmImportApprovalRequest(exportPack,{policy,requested_at,expires_at}={}){
  assert(exportPack?.crm_export_ref,"CRM export pack required.");
  const resource="crm-dataset:"+exportPack.crm_export_ref;
  return createApprovalRequest({
    schema:1,approval_id:"approval-"+exportPack.crm_export_ref.slice(-24),
    target:{type:"CRM_IMPORT",id:exportPack.crm_export_ref},
    risk_class:policy.crm.write_risk_class,
    budget:{hard_limit_amount:null,currency:null},
    reason:"Review and authorize one CRM import of Siti-verified lead candidates.",
    evidence_refs:[exportPack.crm_export_ref,...(exportPack.verification_refs||[])],
    preview:"Import "+exportPack.lead_count+" verified CRM-ready lead(s). No outreach is included.",
    scope:{actions:[policy.crm.write_action],resources:[resource]},
    requested_at,expires_at,
  });
}
