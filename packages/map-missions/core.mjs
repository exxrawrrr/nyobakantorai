import { contentRef,assert,clean,freeze,iso,uniq } from "../geo-intelligence/common.mjs";
import { validateGeoVerificationBinding } from "../geo-intelligence/verification.mjs";
import { finalizeVerifiedProfile } from "../geo-intelligence/scoring.mjs";

function resolved(profile,field){
  const item=profile?.fields?.[field];
  return item?.status==="RESOLVED"?item.value:null;
}
function sourceRefs(profile){
  return uniq([profile.cluster_ref,...(profile.source_refs||[])]).filter(Boolean).sort();
}
export function qualificationTier(score,{policy}={}){
  const tiers=[...(policy?.map_mission?.qualification_tiers||[])].sort((a,b)=>Number(b.min_score)-Number(a.min_score));
  assert(tiers.length>0,"Qualification tiers required.");
  const value=Number(score);
  assert(Number.isFinite(value)&&value>=0&&value<=100,"Qualification score out of bounds.");
  const tier=tiers.find(x=>value>=Number(x.min_score));
  assert(tier,"Qualification tier not found.");
  return freeze({id:clean(tier.id,20),label:clean(tier.label,120),min_score:Number(tier.min_score)});
}

export function validateVerifiedLeadBundle({profile,score,verification,verified_profile}={}){
  assert(profile?.schema===1&&profile?.profile_ref,"Verified lead profile required.");
  assert(score?.profile_ref===profile.profile_ref,"Verified lead score/profile mismatch.");
  assert(verification?.binding&&verification?.verification,"Verified lead Siti binding required.");
  validateGeoVerificationBinding(verification);
  assert(verification.binding.profile_ref===profile.profile_ref,"Verified lead profile verification mismatch.");
  assert(verification.binding.score_ref===score.score_ref,"Verified lead score verification mismatch.");
  const expected=finalizeVerifiedProfile({profile,score,verification});
  assert(verified_profile?.verified_profile_ref===expected.verified_profile_ref,"Verified lead final profile mismatch.");
  assert(verified_profile.status==="VERIFIED_PROFILE","Verified lead final status invalid.");
  return true;
}

export function createCrmLeadCandidate(bundle,{policy,created_at}={}){
  validateVerifiedLeadBundle(bundle);
  const createdAt=iso(created_at,"CRM candidate created_at");
  const {profile,score,verification,verified_profile}=bundle;
  const tier=qualificationTier(score.score,{policy});
  const lead={
    schema:1,
    profile_ref:profile.profile_ref,
    verified_profile_ref:verified_profile.verified_profile_ref,
    place_id:profile.place_id||null,
    name:resolved(profile,"name"),
    website:resolved(profile,"website"),
    business_type:resolved(profile,"business_type"),
    phone:resolved(profile,"phone"),
    email:resolved(profile,"email"),
    address:resolved(profile,"address"),
    score:score.score,
    score_model:score.model_id+"@"+score.model_version,
    qualification_tier:tier.id,
    verification_ref:verification.verification.verification_ref,
    source_refs:sourceRefs(profile),
    source_types:[...(profile.source_types||[])].sort(),
    created_at:createdAt,
    updated_at:createdAt,
    external_write_state:"NOT_WRITTEN",
    completeness_claim:false,
  };
  const crmLeadId=contentRef("crm-lead-identity",{
    verified_profile_ref:lead.verified_profile_ref,
    place_id:lead.place_id,
  });
  const candidate={...lead,crm_lead_id:crmLeadId};
  const allowed=new Set(policy.crm.allowed_fields);
  for(const key of Object.keys(candidate)){
    if(["schema","external_write_state","completeness_claim"].includes(key)) continue;
    assert(allowed.has(key),"CRM candidate contains non-allowlisted field: "+key);
  }
  const forbidden=policy.crm.forbidden_fields||[];
  const serialized=JSON.stringify(candidate);
  for(const field of forbidden) assert(!serialized.includes('"'+field+'"'),"CRM candidate contains forbidden provider field: "+field);
  return freeze({...candidate,candidate_ref:contentRef("crm-lead-candidate",candidate)});
}

function normalizeFeature(input,candidatesByProfile,{policy}={}){
  const profileRef=clean(input?.profile_ref,1000);
  const candidate=candidatesByProfile.get(profileRef);
  assert(candidate,"Map feature profile must map to verified CRM candidate.");
  const latitude=Number(input?.latitude),longitude=Number(input?.longitude);
  assert(Number.isFinite(latitude)&&latitude>=-90&&latitude<=90,"Map feature latitude invalid.");
  assert(Number.isFinite(longitude)&&longitude>=-180&&longitude<=180,"Map feature longitude invalid.");
  const sourceRef=clean(input?.source_ref,1000);
  assert(sourceRef,"Map feature source_ref required.");
  const sourceKind=clean(input?.source_kind,80).toUpperCase();
  const provider=clean(input?.provider,120).toLowerCase();
  const retention=clean(input?.retention_class,80).toUpperCase();
  let persistable=false,googleAttribution=false;
  if(provider==="google-places-new"||sourceKind==="GOOGLE_PLACES"){
    assert(retention==="EPHEMERAL_PROVIDER","Google provider map location must be EPHEMERAL_PROVIDER.");
    assert(input?.google_maps_attribution_required===true,"Google provider map feature requires Google Maps attribution.");
    persistable=false;googleAttribution=true;
  }else{
    assert(candidate.source_refs.includes(sourceRef),"Durable public map feature source must belong to candidate provenance.");
    assert(retention==="PUBLIC_DURABLE","Public map location must explicitly use PUBLIC_DURABLE retention.");
    persistable=true;
  }
  const core={
    schema:1,profile_ref:profileRef,crm_lead_id:candidate.crm_lead_id,
    latitude,longitude,source_ref:sourceRef,source_kind:sourceKind,provider:provider||null,
    retention_class:retention,persistable,google_maps_attribution_required:googleAttribution,
    qualification_tier:candidate.qualification_tier,score:candidate.score,
  };
  return freeze({...core,feature_ref:contentRef("map-mission-feature",core)});
}

export function createMapMission({mission_id,title,created_at,candidates=[],features=[]}={}, {policy}={}){
  const missionId=clean(mission_id,160),missionTitle=clean(title,300);
  assert(missionId&&missionTitle,"Map mission id/title required.");
  assert(candidates.length>0,"Map mission candidates required.");
  assert(candidates.length<=Number(policy.map_mission.max_profiles),"Map mission candidate bound exceeded.");
  assert(features.length<=Number(policy.map_mission.max_features),"Map mission feature bound exceeded.");
  const byProfile=new Map(candidates.map(x=>[x.profile_ref,x]));
  assert(byProfile.size===candidates.length,"Map mission duplicate candidate profile.");
  const normalized=features.map(x=>normalizeFeature(x,byProfile,{policy}));
  const createdAt=iso(created_at,"Map mission created_at");
  const ephemeralCount=normalized.filter(x=>!x.persistable).length;
  const core={
    schema:1,mission_id:missionId,title:missionTitle,created_at:createdAt,
    candidate_refs:candidates.map(x=>x.candidate_ref).sort(),
    feature_refs:normalized.map(x=>x.feature_ref).sort(),
    features:normalized,
    qualification:buildQualificationVisualization(candidates,{policy}),
    completeness_claim:false,
    persistable_view_model:ephemeralCount===0,
    ephemeral_feature_count:ephemeralCount,
    google_maps_attribution_required:normalized.some(x=>x.google_maps_attribution_required),
    claim_boundary:policy.claim_boundary,
  };
  return freeze({...core,map_mission_ref:contentRef("map-mission",core)});
}

export function buildDurableMapMissionSummary(mapMission){
  assert(mapMission?.schema===1&&mapMission?.map_mission_ref,"Map mission required.");
  const features=(mapMission.features||[]).map(f=>f.persistable
    ? {feature_ref:f.feature_ref,profile_ref:f.profile_ref,crm_lead_id:f.crm_lead_id,latitude:f.latitude,longitude:f.longitude,source_ref:f.source_ref,retention_class:f.retention_class,qualification_tier:f.qualification_tier,score:f.score}
    : {feature_ref:f.feature_ref,profile_ref:f.profile_ref,crm_lead_id:f.crm_lead_id,location_present:true,source_ref:f.source_ref,retention_class:f.retention_class,qualification_tier:f.qualification_tier,score:f.score});
  const core={
    schema:1,map_mission_ref:mapMission.map_mission_ref,mission_id:mapMission.mission_id,
    created_at:mapMission.created_at,features,qualification:mapMission.qualification,
    google_maps_attribution_required:mapMission.google_maps_attribution_required,
    completeness_claim:false,raw_provider_location_persisted:false,
  };
  return freeze({...core,summary_ref:contentRef("map-mission-summary",core)});
}

export function buildQualificationVisualization(candidates,{policy}={}){
  const tiers=(policy.map_mission.qualification_tiers||[]).map(x=>({id:x.id,label:x.label,min_score:Number(x.min_score),count:0,lead_refs:[]}));
  const map=new Map(tiers.map(x=>[x.id,x]));
  for(const candidate of candidates){
    const tier=qualificationTier(candidate.score,{policy});
    assert(candidate.qualification_tier===tier.id,"CRM candidate qualification tier drift.");
    const row=map.get(tier.id);row.count++;row.lead_refs.push(candidate.crm_lead_id);
  }
  for(const row of tiers) row.lead_refs.sort();
  const core={schema:1,total:candidates.length,tiers,verified_only:true};
  return freeze({...core,visualization_ref:contentRef("lead-qualification-view",core)});
}
