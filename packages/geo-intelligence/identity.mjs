import { assert,clean,contentRef,freeze,jaccard,normalizeDomain,normalizePhone,normalizedText,distanceMeters,uniq } from "./common.mjs";

function normalizePlaceId(v){const x=clean(v,500);return x||null;}
function normalizeAddress(v){return normalizedText(v)||null;}
function recordCore(input){
  return {
    record_id:clean(input.record_id,160),
    source_ref:clean(input.source_ref,1000),
    source_type:clean(input.source_type,80).toUpperCase(),
    place_id:normalizePlaceId(input.place_id),
    name:clean(input.name,500)||null,
    website:clean(input.website,1500)||null,
    domain:normalizeDomain(input.website),
    phone:clean(input.phone,200)||null,
    normalized_phone:normalizePhone(input.phone),
    address:clean(input.address,1000)||null,
    normalized_address:normalizeAddress(input.address),
    location:input.location?{latitude:Number(input.location.latitude),longitude:Number(input.location.longitude)}:null,
    ephemeral_provider_content:input.ephemeral_provider_content===true,
  };
}
export function normalizeDiscoveryRecord(input){
  const core=recordCore(input||{});
  assert(core.record_id,"Discovery record_id required.");
  assert(core.source_ref,"Discovery source_ref required.");
  assert(core.source_type,"Discovery source_type required.");
  assert(core.name||core.place_id||core.domain||core.normalized_phone,"Discovery record needs at least one identity signal.");
  if(core.location) assert([core.location.latitude,core.location.longitude].every(Number.isFinite),"Discovery location invalid.");
  const rec={schema:1,...core};
  return freeze({...rec,record_ref:contentRef("geo-discovery-record",rec)});
}

export function compareIdentity(aInput,bInput,{policy}={}){
  const a=normalizeDiscoveryRecord(aInput),b=normalizeDiscoveryRecord(bInput);
  const weights=policy.identity_resolution?.evidence_weights||{};
  const conflicts=policy.identity_resolution?.conflict_weights||{};
  const rationale=[];
  let score=0,hardConflict=false,strongSignals=0;
  if(a.place_id&&b.place_id){
    if(a.place_id===b.place_id){score+=Number(weights.same_place_id||0);rationale.push("same_place_id");strongSignals++;}
    else{score+=Number(conflicts.different_place_id||-200);rationale.push("different_place_id");hardConflict=true;}
  }
  if(a.domain&&b.domain){
    if(a.domain===b.domain){score+=Number(weights.same_domain||0);rationale.push("same_domain");strongSignals++;}
    else{score+=Number(conflicts.different_domain||0);rationale.push("different_domain");}
  }
  if(a.normalized_phone&&b.normalized_phone){
    if(a.normalized_phone===b.normalized_phone){score+=Number(weights.same_phone||0);rationale.push("same_phone");strongSignals++;}
    else{score+=Number(conflicts.different_phone||0);rationale.push("different_phone");}
  }
  if(a.normalized_address&&b.normalized_address&&a.normalized_address===b.normalized_address){
    score+=Number(weights.same_address||0);rationale.push("same_address");strongSignals++;
  }
  const nameSimilarity=a.name&&b.name?jaccard(a.name,b.name):0;
  if(nameSimilarity>=0.8){score+=Number(weights.name_similarity_high||0);rationale.push("name_similarity_high");}
  const distance=distanceMeters(a.location,b.location);
  if(Number.isFinite(distance)&&distance<=150){score+=Number(weights.location_within_150m||0);rationale.push("location_within_150m");strongSignals++;}

  const mergeThreshold=Number(policy.identity_resolution?.merge_threshold||70);
  const reviewThreshold=Number(policy.identity_resolution?.review_threshold||45);
  let decision="KEEP_SEPARATE";
  if(!hardConflict&&score>=mergeThreshold&&strongSignals>0) decision="MERGE";
  else if(!hardConflict&&score>=reviewThreshold) decision="REVIEW";
  if(strongSignals===0&&rationale.every(x=>x==="name_similarity_high")) decision="REVIEW";

  const result={schema:1,left_ref:a.record_ref,right_ref:b.record_ref,score,decision,hard_conflict:hardConflict,strong_signal_count:strongSignals,
    name_similarity:Number(nameSimilarity.toFixed(4)),distance_m:Number.isFinite(distance)?Math.round(distance):null,rationale};
  return freeze({...result,comparison_ref:contentRef("geo-identity-comparison",result)});
}

function clusterHasPlaceIdConflict(records){
  const ids=uniq(records.map(x=>x.place_id).filter(Boolean));
  return ids.length>1;
}

export function resolveIdentity(recordsInput,{policy}={}){
  assert(Array.isArray(recordsInput)&&recordsInput.length>0,"Identity resolution requires records.");
  const records=recordsInput.map(normalizeDiscoveryRecord).sort((a,b)=>a.record_ref.localeCompare(b.record_ref));
  const parent=records.map((_,i)=>i);
  const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const members=root=>records.filter((_,i)=>find(i)===root);
  const union=(a,b)=>{
    let ra=find(a),rb=find(b);if(ra===rb)return true;
    const combined=[...members(ra),...members(rb)];
    if(clusterHasPlaceIdConflict(combined)) return false;
    if(ra>rb)[ra,rb]=[rb,ra];
    parent[rb]=ra;return true;
  };
  const comparisons=[];
  for(let i=0;i<records.length;i++) for(let j=i+1;j<records.length;j++) comparisons.push({i,j,c:compareIdentity(records[i],records[j],{policy})});
  comparisons.sort((x,y)=>y.c.score-x.c.score||x.c.comparison_ref.localeCompare(y.c.comparison_ref));
  const decisions=[];
  for(const item of comparisons){
    let applied=false;
    if(item.c.decision==="MERGE") applied=union(item.i,item.j);
    decisions.push({...item.c,merge_applied:applied});
  }
  const roots=[...new Set(records.map((_,i)=>find(i)))].sort((a,b)=>a-b);
  const clusters=roots.map(root=>{
    const group=members(root).sort((a,b)=>a.record_ref.localeCompare(b.record_ref));
    const refs=group.map(x=>x.record_ref);
    const placeIds=uniq(group.map(x=>x.place_id).filter(Boolean));
    assert(placeIds.length<=1,"Identity cluster contains conflicting Place IDs.");
    const core={schema:1,source_record_refs:refs,place_id:placeIds[0]||null,record_count:group.length};
    return freeze({...core,cluster_ref:contentRef("geo-identity-cluster",core),records:group});
  });
  return freeze({schema:1,clusters,decisions:decisions.map(freeze),input_record_count:records.length,cluster_count:clusters.length,
    completeness_claim:false,identity_resolution_ref:contentRef("geo-identity-resolution",{clusters:clusters.map(x=>({cluster_ref:x.cluster_ref,source_record_refs:x.source_record_refs})),decisions})});
}
