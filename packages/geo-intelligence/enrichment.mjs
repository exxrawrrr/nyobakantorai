import { assert,clean,contentRef,freeze,iso,normalizeDomain,normalizePhone,normalizedText,uniq } from "./common.mjs";

function isPrivateHost(host){
  const h=host.toLowerCase();
  if(h==="localhost"||h.endsWith(".local")) return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h)) return true;
  const m=h.match(/^172\.(\d+)\./); if(m&&Number(m[1])>=16&&Number(m[1])<=31) return true;
  if(h==="::1"||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("fe80:")) return true;
  return false;
}

function normalizePublicUrl(rawInput,cfg){
  const rawUrl=clean(rawInput,3000);
  assert(rawUrl,"Public source URL required.");
  let url; try{url=new URL(rawUrl);}catch{throw new Error("Public source URL invalid.");}
  assert((cfg.allowed_schemes||[]).includes(url.protocol),"Public source URL scheme not allowed.");
  if(cfg.reject_url_userinfo===true) assert(!url.username&&!url.password,"Public source URL userinfo forbidden.");
  if(cfg.reject_private_network_targets===true) assert(!isPrivateHost(url.hostname),"Private/local enrichment target forbidden.");
  url.hash="";
  return url;
}

export function createPublicEnrichmentRequest(input,{policy}={}){
  const cfg=policy.enrichment||{};
  const sourceType=clean(input?.source_type,80).toUpperCase();
  assert((cfg.allowed_source_types||[]).includes(sourceType),"Public source type not allowed.");
  const url=normalizePublicUrl(input?.url,cfg);
  const requestedAt=iso(input?.requested_at,"Public enrichment requested_at");
  const core={
    schema:1,
    mission_id:clean(input?.mission_id,160),
    profile_ref:clean(input?.profile_ref,300),
    source_type:sourceType,
    url:url.toString(),
    requested_at:requestedAt,
    method:"GET",
    access_mode:cfg.access_mode,
    credentials_allowed:false,
    access_control_bypass_allowed:false,
    raw_page_persistence_allowed:false,
    max_response_bytes:Number(cfg.max_response_bytes),
    timeout_ms:Number(cfg.timeout_ms),
  };
  assert(core.mission_id,"Public enrichment mission_id required.");
  assert(core.profile_ref,"Public enrichment profile_ref required.");
  assert(core.access_mode==="PUBLIC_NO_AUTH_READ_ONLY","Public enrichment must be no-auth read-only.");
  assert(core.max_response_bytes>0&&core.max_response_bytes<=2000000,"Public enrichment response bound invalid.");
  assert(core.timeout_ms>0&&core.timeout_ms<=15000,"Public enrichment timeout bound invalid.");
  return freeze({...core,retrieval_ref:contentRef("geo-public-retrieval",core)});
}

export function normalizePublicSourceRecord(input,{policy}={}){
  const cfg=policy.enrichment||{};
  const sourceType=clean(input?.source_type,80).toUpperCase();
  assert((cfg.allowed_source_types||[]).includes(sourceType),"Public source type not allowed.");
  const url=normalizePublicUrl(input?.url,cfg);
  const retrievedAt=iso(input?.retrieved_at,"Public source retrieved_at");
  const claims=[];
  for(const raw of Array.isArray(input?.claims)?input.claims:[]){
    const field=clean(raw?.field,120),value=raw?.value;
    assert(field,"Source claim field required.");
    assert(value!==undefined&&value!==null&&String(value).trim()!=="","Source claim value required.");
    const claim={field,value:typeof value==="boolean"?value:clean(value,2000),confidence:Number(raw?.confidence??1)};
    assert(Number.isFinite(claim.confidence)&&claim.confidence>=0&&claim.confidence<=1,"Source claim confidence out of bounds.");
    claims.push({...claim,claim_ref:contentRef("geo-source-claim",{source_type:sourceType,url:url.toString(),retrieved_at:retrievedAt,...claim})});
  }
  assert(claims.length>0,"Public source requires at least one claim.");
  const core={schema:1,source_type:sourceType,url:url.toString(),retrieved_at:retrievedAt,claims,raw_page_persisted:false,credentials_used:false};
  assert(cfg.raw_page_persistence_allowed===false,"Enrichment policy must forbid raw page persistence.");
  assert(cfg.credentials_allowed===false,"Enrichment policy must forbid credentials.");
  return freeze({...core,source_ref:contentRef("geo-public-source",core)});
}

function valueKey(field,value){
  if(field==="website"||field==="domain") return normalizeDomain(value)||normalizedText(value);
  if(field==="phone") return normalizePhone(value)||normalizedText(value);
  if(typeof value==="boolean") return value?"true":"false";
  return normalizedText(value);
}

function currentness(source,policy,asOf){
  const days=Number(policy.field_confidence?.current_after_days?.[source.source_type]??90);
  return (Date.parse(asOf)-Date.parse(source.retrieved_at))<=days*86400000;
}

export function buildBusinessProfile({cluster,public_sources=[],as_of}, {policy}={}){
  assert(cluster?.schema===1&&Array.isArray(cluster.records),"Identity cluster required.");
  const asOf=iso(as_of,"Profile as_of");
  assert(public_sources.length<=Number(policy.enrichment?.max_sources_per_profile||10),"Public enrichment source count exceeds profile bound.");
  const sources=public_sources.map(x=>normalizePublicSourceRecord(x,{policy}));
  const placeIds=uniq(cluster.records.map(x=>x.place_id).filter(Boolean));
  assert(placeIds.length<=1,"Profile cluster Place ID conflict.");

  const claimsByField=new Map();
  const push=(field,value,sourceRef,sourceType,retrievedAt,confidence=1)=>{
    if(value===null||value===undefined||String(value).trim()==="")return;
    const entry={field,value,source_ref:sourceRef,source_type:sourceType,retrieved_at:retrievedAt,claim_confidence:confidence};
    if(!claimsByField.has(field)) claimsByField.set(field,[]);
    claimsByField.get(field).push(entry);
  };
  if(placeIds[0]) push("place_id",placeIds[0],cluster.cluster_ref,"GOOGLE_PLACES",asOf,1);
  for(const source of sources) for(const claim of source.claims) push(claim.field,claim.value,source.source_ref,source.source_type,source.retrieved_at,claim.confidence);

  const fields={};
  const sourceTrust=policy.field_confidence?.source_trust||{};
  for(const [field,claims] of [...claimsByField.entries()].sort(([a],[b])=>a.localeCompare(b))){
    const groups=new Map();
    for(const c of claims){
      const k=valueKey(field,c.value); if(!k) continue;
      if(!groups.has(k)) groups.set(k,{key:k,value:c.value,claims:[],weight:0});
      const trust=Number(sourceTrust[c.source_type]??0.5);
      const fresh=currentness(c,policy,asOf);
      const weight=trust*Number(c.claim_confidence)*(fresh?1:0.5);
      const g=groups.get(k);g.claims.push({...c,current:fresh,weight});g.weight+=weight;
    }
    const ranked=[...groups.values()].sort((a,b)=>b.weight-a.weight||String(a.key).localeCompare(String(b.key)));
    if(!ranked.length) continue;
    const top=ranked[0],second=ranked[1]||null;
    const conflict=Boolean(second&&second.weight>=top.weight*0.8);
    fields[field]=freeze({
      status:conflict?"CONFLICT":"RESOLVED",
      value:conflict?policy.field_confidence.unresolved_value:top.value,
      confidence:Number(Math.min(1,top.weight/Math.max(1,top.claims.length)).toFixed(4)),
      source_refs:uniq(top.claims.map(x=>x.source_ref)).sort(),
      alternatives:(conflict?ranked:ranked.slice(1)).map(x=>({value:x.value,weight:Number(x.weight.toFixed(4)),source_refs:uniq(x.claims.map(c=>c.source_ref)).sort()})),
      rationale:conflict?"top evidence groups are too close to resolve safely":"highest weighted public-source evidence",
    });
  }

  const sourceTypes=uniq(sources.map(x=>x.source_type)).sort();
  const identityStrong=cluster.records.length===1?Boolean(placeIds[0]):cluster.records.some(r=>r.place_id||r.domain||r.normalized_phone);
  const core={
    schema:1,cluster_ref:cluster.cluster_ref,place_id:placeIds[0]||null,fields,
    source_refs:sources.map(x=>x.source_ref).sort(),
    source_types:sourceTypes,
    as_of:asOf,
    identity_strength:identityStrong?"STRONG":"WEAK",
    completeness_claim:false,
    raw_provider_content_persisted:false,
  };
  return freeze({...core,profile_ref:contentRef("geo-business-profile",core)});
}

export function validateProfileProvenance(profile,{sources=[]}={}){
  assert(profile?.schema===1,"Business profile invalid.");
  const refs=new Set(sources.map(x=>x.source_ref));
  for(const [field,data] of Object.entries(profile.fields||{})){
    assert(["RESOLVED","CONFLICT"].includes(data.status),"Profile field status invalid: "+field);
    for(const ref of data.source_refs||[]) assert(refs.has(ref)||ref===profile.cluster_ref,"Profile field source ref missing: "+ref);
    if(data.status==="RESOLVED") assert(data.value!==null&&data.value!==undefined,"Resolved profile field lacks value: "+field);
    if(data.status==="CONFLICT") assert(data.value===null,"Conflicted profile field must remain unresolved: "+field);
  }
  assert(profile.raw_provider_content_persisted===false,"Business profile may not persist raw provider content.");
  assert(profile.completeness_claim===false,"Business profile may not claim completeness.");
  return true;
}
