import { createHash } from "node:crypto";

export const GEO_CORE_API=1;
export const GEO_OPERATIONS=Object.freeze(["TEXT_SEARCH","NEARBY_SEARCH","PLACE_DETAILS"]);
const clean=(v,max=4000)=>String(v??"").trim().slice(0,max);
function assert(c,m){if(!c)throw new Error(m);}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function ref(kind,v){return kind+":sha256:"+createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function validTime(v){return typeof v==="string"&&v.trim()&&!Number.isNaN(Date.parse(v));}

export function normalizeGeoPolicy(input={}){
  assert(input?.schema===1,"Geo policy schema must be 1.");
  assert(clean(input.policy_id,120),"Geo policy_id required.");
  assert(clean(input.provider,120),"Geo provider required.");
  assert(input.production?.explicit_field_mask_required===true,"Geo policy must require explicit field masks.");
  assert(input.production?.wildcard_field_mask_allowed===false,"Production wildcard field masks must be forbidden.");
  assert(input.retention?.provider_response==="EPHEMERAL_ONLY","Provider response policy must be EPHEMERAL_ONLY.");
  assert(input.retention?.raw_response_persistence_allowed===false,"Raw provider response persistence must be forbidden.");
  assert(Array.isArray(input.retention?.durable_fields)&&input.retention.durable_fields.length===1&&input.retention.durable_fields[0]==="place_id","Only place_id may be durable provider content.");
  assert(Number(input.retention?.place_id_refresh_after_days)>=1,"Place ID refresh window invalid.");
  const profiles=input.field_mask_profiles||{};
  assert(Object.keys(profiles).length>0,"FieldMask profiles required.");
  for(const [name,p] of Object.entries(profiles)){
    assert(GEO_OPERATIONS.includes(p.operation),name+": invalid operation.");
    assert(Array.isArray(p.fields)&&p.fields.length>0,name+": fields required.");
    assert(!p.fields.includes("*"),name+": wildcard FieldMask forbidden.");
    assert(new Set(p.fields).size===p.fields.length,name+": duplicate fields.");
    assert(clean(p.highest_sku,160),name+": highest_sku required.");
    assert(Array.isArray(p.durable_result_fields)&&p.durable_result_fields.every(x=>x==="place_id"),name+": durable fields may only contain place_id.");
  }
  const b=input.query_bounds||{};
  assert(Number(b.text_page_size_min)>=1&&Number(b.text_page_size_max)<=20&&Number(b.text_page_size_min)<=Number(b.text_page_size_max),"Text page size bounds invalid.");
  assert(Number(b.text_max_pages)>=1,"Text max pages invalid.");
  assert(Number(b.nearby_max_result_count_min)>=1&&Number(b.nearby_max_result_count_max)<=20,"Nearby count bounds invalid.");
  assert(Number(b.nearby_radius_m_max)<=50000&&Number(b.nearby_radius_m_max)>0,"Nearby radius max invalid.");
  assert(Number(b.internal_max_search_area_diagonal_m)>0,"Internal area diagonal bound required.");
  return Object.freeze(structuredClone(input));
}

function profileByName(policy,name){
  const p=policy.field_mask_profiles?.[name];
  assert(p,"Unknown FieldMask profile: "+name);
  return Object.freeze(structuredClone(p));
}

function point(input,label){
  const latitude=Number(input?.latitude),longitude=Number(input?.longitude);
  assert(Number.isFinite(latitude)&&latitude>=-90&&latitude<=90,label+" latitude invalid.");
  assert(Number.isFinite(longitude)&&longitude>=-180&&longitude<=180,label+" longitude invalid.");
  return Object.freeze({latitude,longitude});
}

function haversineMeters(a,b){
  const R=6371008.8,toRad=(x)=>x*Math.PI/180;
  const dLat=toRad(b.latitude-a.latitude),dLon=toRad(b.longitude-a.longitude);
  const lat1=toRad(a.latitude),lat2=toRad(b.latitude);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

function normalizeArea(area,policy,operation){
  assert(area&&typeof area==="object","Geo search requires explicit area.");
  const kind=clean(area.kind,30).toUpperCase();
  const maxDiagonal=Number(policy.query_bounds.internal_max_search_area_diagonal_m);
  if(operation==="NEARBY_SEARCH"){
    assert(kind==="CIRCLE","Nearby Search requires CIRCLE area.");
    const center=point(area.center,"Circle center");
    const radius=Number(area.radius_m);
    assert(Number.isFinite(radius)&&radius>Number(policy.query_bounds.nearby_radius_m_min_exclusive),"Nearby radius must be greater than minimum.");
    assert(radius<=Number(policy.query_bounds.nearby_radius_m_max),"Nearby radius exceeds provider/policy maximum.");
    assert(radius*2<=maxDiagonal,"Nearby search diameter exceeds internal area bound.");
    return Object.freeze({kind:"CIRCLE",center,radius_m:radius,diagonal_m:radius*2});
  }
  assert(kind==="RECTANGLE","Text Search requires RECTANGLE locationRestriction for bounded discovery.");
  const low=point(area.low,"Rectangle low"),high=point(area.high,"Rectangle high");
  assert(low.latitude<high.latitude,"Rectangle latitude range must be non-empty.");
  assert(low.longitude<high.longitude,"Rectangle longitude range must be non-empty and may not cross the antimeridian in Geo Core v1.");
  const diagonal=haversineMeters(low,high);
  assert(diagonal<=maxDiagonal,"Search rectangle exceeds internal area diagonal bound.");
  return Object.freeze({kind:"RECTANGLE",low,high,diagonal_m:Math.round(diagonal)});
}

function requestPayload(x){
  return {
    schema:1,provider:x.provider,operation:x.operation,environment:x.environment,
    field_profile:x.field_profile,fields:x.fields,highest_sku:x.highest_sku,
    query:x.query,place_id:x.place_id,area:x.area,page_size:x.page_size,
    page_number:x.page_number,max_result_count:x.max_result_count,
    mission_request_index:x.mission_request_index,retention_intent:x.retention_intent,
    policy_ref:x.policy_ref,
  };
}

export function normalizeGeoDiscoveryRequest(input,{policy:policyInput}={}){
  const policy=normalizeGeoPolicy(policyInput);
  assert(input?.schema===1,"Geo request schema must be 1.");
  const operation=clean(input.operation,40).toUpperCase();
  assert(GEO_OPERATIONS.includes(operation),"Unsupported geo operation.");
  const environment=clean(input.environment||"production",40).toLowerCase();
  assert(["production","development","test"].includes(environment),"Geo environment invalid.");
  const fieldProfile=clean(input.field_profile,120);
  const profile=profileByName(policy,fieldProfile);
  assert(profile.operation===operation,"FieldMask profile operation mismatch.");
  assert(profile.fields.length>0,"FieldMask cannot be empty.");
  if(environment==="production") assert(!profile.fields.includes("*"),"Production wildcard FieldMask is forbidden.");
  const missionIndex=Number(input.mission_request_index??1);
  assert(Number.isInteger(missionIndex)&&missionIndex>=1&&missionIndex<=Number(policy.query_bounds.mission_max_requests),"Mission request index exceeds bounded request budget.");

  let query=null,placeId=null,area=null,pageSize=null,pageNumber=null,maxResultCount=null;
  if(operation==="TEXT_SEARCH"){
    query=clean(input.query,Number(policy.query_bounds.text_query_max_chars));
    assert(query,"Text Search query required.");
    assert(String(input.query??"").trim().length<=Number(policy.query_bounds.text_query_max_chars),"Text Search query exceeds policy length.");
    area=normalizeArea(input.area,policy,operation);
    pageSize=Number(input.page_size??20);
    pageNumber=Number(input.page_number??1);
    assert(Number.isInteger(pageSize)&&pageSize>=Number(policy.query_bounds.text_page_size_min)&&pageSize<=Number(policy.query_bounds.text_page_size_max),"Text Search page_size out of bounds.");
    assert(Number.isInteger(pageNumber)&&pageNumber>=1&&pageNumber<=Number(policy.query_bounds.text_max_pages),"Text Search page_number out of bounds.");
    assert(pageSize*pageNumber<=Number(policy.query_bounds.text_max_results_per_mission),"Text Search mission result bound exceeded.");
  }else if(operation==="NEARBY_SEARCH"){
    area=normalizeArea(input.area,policy,operation);
    maxResultCount=Number(input.max_result_count??20);
    assert(Number.isInteger(maxResultCount)&&maxResultCount>=Number(policy.query_bounds.nearby_max_result_count_min)&&maxResultCount<=Number(policy.query_bounds.nearby_max_result_count_max),"Nearby Search max_result_count out of bounds.");
  }else{
    placeId=clean(input.place_id,500);
    assert(placeId,"Place Details requires exact place_id.");
    assert(!input.area&&!input.query,"Place Details must not carry search query/area.");
  }

  const policyRef=ref("geo-policy:",{
    policy_id:policy.policy_id,provider:policy.provider,source_checked_at:policy.source_checked_at,
    production:policy.production,field_mask_profiles:policy.field_mask_profiles,
    pricing_policy:policy.pricing_policy,query_bounds:policy.query_bounds,
    retention:policy.retention,attribution:policy.attribution,
  });
  const payload={
    schema:1,provider:policy.provider,operation,environment,
    field_profile:fieldProfile,fields:Object.freeze([...profile.fields]),highest_sku:profile.highest_sku,
    query,place_id:placeId,area,page_size:pageSize,page_number:pageNumber,max_result_count:maxResultCount,
    mission_request_index:missionIndex,retention_intent:"EPHEMERAL_PROVIDER_CONTENT",
    policy_ref:policyRef,
  };
  return Object.freeze({...payload,request_ref:ref("geo-request:",requestPayload(payload))});
}

export function pricingMetadataForRequest(request,{policy:policyInput}={}){
  const policy=normalizeGeoPolicy(policyInput);
  const normalized=normalizeGeoDiscoveryRequest(request,{policy});
  return Object.freeze({
    provider:policy.provider,
    field_profile:normalized.field_profile,
    highest_sku:normalized.highest_sku,
    numeric_price_pinned:false,
    billing_rule:policy.pricing_policy.billing_rule,
    source_checked_at:policy.source_checked_at,
  });
}

export function createDurablePlaceIdRecord(placeId,{policy:policyInput,observedAt}={}){
  const policy=normalizeGeoPolicy(policyInput);
  const id=clean(placeId,500);
  assert(id,"Durable Place ID required.");
  assert(validTime(observedAt),"Place ID observedAt invalid.");
  const seen=new Date(observedAt);
  const refresh=new Date(seen.getTime()+Number(policy.retention.place_id_refresh_after_days)*86400000);
  const policyRef=ref("geo-policy:",{
    policy_id:policy.policy_id,provider:policy.provider,source_checked_at:policy.source_checked_at,
    production:policy.production,field_mask_profiles:policy.field_mask_profiles,
    pricing_policy:policy.pricing_policy,query_bounds:policy.query_bounds,
    retention:policy.retention,attribution:policy.attribution,
  });
  const record={
    provider:policy.provider,
    place_id:id,
    first_seen_at:seen.toISOString(),
    refresh_due_at:refresh.toISOString(),
    policy_ref:policyRef,
  };
  return Object.freeze({...record,record_ref:ref("geo-place-id:",record)});
}

export function validateDurableGeoArtifact(input,{policy:policyInput}={}){
  const policy=normalizeGeoPolicy(policyInput);
  assert(input&&typeof input==="object","Durable geo artifact required.");
  const allowed=new Set([...policy.retention.durable_record_metadata,"record_ref"]);
  for(const key of Object.keys(input)) assert(allowed.has(key),"Provider data field is not allowed in durable geo storage: "+key);
  assert(input.provider===policy.provider,"Durable geo provider mismatch.");
  assert(clean(input.place_id,500),"Durable place_id required.");
  assert(validTime(input.first_seen_at)&&validTime(input.refresh_due_at),"Durable Place ID timestamps invalid.");
  assert(/^geo-policy:sha256:[a-f0-9]{64}$/.test(clean(input.policy_ref,200)),"Durable geo policy_ref invalid.");
  const core={
    provider:input.provider,place_id:input.place_id,first_seen_at:input.first_seen_at,
    refresh_due_at:input.refresh_due_at,policy_ref:input.policy_ref,
  };
  assert(ref("geo-place-id:",core)===input.record_ref,"Durable geo record checksum mismatch.");
  return true;
}

export function processGeoProviderResponse(response,{request,policy:policyInput,observedAt}={}){
  const policy=normalizeGeoPolicy(policyInput);
  const normalized=normalizeGeoDiscoveryRequest(request,{policy});
  assert(validTime(observedAt),"Geo response observedAt invalid.");
  assert(response&&typeof response==="object","Geo provider response must be an object.");
  const places=Array.isArray(response.places)?response.places:(normalized.operation==="PLACE_DETAILS"?[response]:[]);
  const durable=[];
  for(const place of places){
    const id=clean(place?.id,500);
    if(id) durable.push(createDurablePlaceIdRecord(id,{policy,observedAt}));
  }
  const thirdPartyAttributions=places.flatMap(place=>Array.isArray(place?.attributions)?place.attributions:[]).map(item=>({
    provider:clean(item?.provider,500),providerUri:clean(item?.providerUri,1000),
  })).filter(x=>x.provider||x.providerUri);
  const displayRequirements=Object.freeze({
    google_maps_attribution_required:policy.attribution.google_maps_attribution_required_when_displaying_provider_content===true,
    third_party_attributions_required:thirdPartyAttributions.length>0,
    third_party_attributions:Object.freeze(thirdPartyAttributions),
  });
  return Object.freeze({
    schema:1,
    provider:policy.provider,
    request_ref:normalized.request_ref,
    observed_at:new Date(observedAt).toISOString(),
    storage_policy:"EPHEMERAL_ONLY",
    ephemeral_provider_content:structuredClone(response),
    durable_place_ids:Object.freeze(durable),
    display_requirements:displayRequirements,
    evidence_summary:Object.freeze({
      returned_place_count:places.length,
      retained_place_id_count:durable.length,
      field_profile:normalized.field_profile,
      highest_sku:normalized.highest_sku,
      raw_response_persisted:false,
    }),
  });
}

export function buildDurableGeoEvidence(processed,{policy:policyInput}={}){
  const policy=normalizeGeoPolicy(policyInput);
  assert(processed?.storage_policy==="EPHEMERAL_ONLY","Processed geo response must be ephemeral.");
  for(const record of processed.durable_place_ids||[]) validateDurableGeoArtifact(record,{policy});
  return Object.freeze({
    schema:1,
    provider:policy.provider,
    request_ref:processed.request_ref,
    observed_at:processed.observed_at,
    place_id_records:Object.freeze([...(processed.durable_place_ids||[])]),
    returned_place_count:processed.evidence_summary?.returned_place_count??0,
    field_profile:processed.evidence_summary?.field_profile??null,
    highest_sku:processed.evidence_summary?.highest_sku??null,
    raw_response_persisted:false,
    attribution_required:processed.display_requirements?.google_maps_attribution_required===true,
  });
}

export function assertProductionFieldMask(fields){
  assert(Array.isArray(fields)&&fields.length>0,"Production FieldMask required.");
  assert(!fields.includes("*"),"Production wildcard FieldMask is forbidden.");
  assert(fields.every(x=>clean(x,500)&&!/s/.test(x)),"FieldMask entries must be explicit and contain no spaces.");
  return true;
}
