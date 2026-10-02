import { assert,clean,contentRef,freeze,uniq } from "./common.mjs";

function resolved(profile,field){
  const item=profile?.fields?.[field];
  return item?.status==="RESOLVED"?item:null;
}
function evidenceRefs(...items){
  return uniq(items.flatMap(x=>x?.source_refs||[]).filter(Boolean)).sort();
}
export function scoreBusinessProfile(profile,{mission={},policy}={}){
  assert(profile?.schema===1,"Business profile required.");
  const scoring=policy?.scoring;
  assert(scoring?.model_id&&scoring?.version,"Scoring policy required.");
  const criteria=new Map((scoring.criteria||[]).map(x=>[x.id,x]));
  const contributions=[];
  const add=(id,points,rationale,refs=[])=>{
    const def=criteria.get(id); assert(def,"Unknown scoring criterion: "+id);
    assert(points>=0&&points<=Number(def.max_points),"Score contribution out of bounds: "+id);
    contributions.push({
      criterion_id:id,
      points,
      max_points:Number(def.max_points),
      rationale:clean(rationale,1200),
      evidence_refs:uniq(refs).sort(),
    });
  };

  const identityRefs=[profile.cluster_ref,...(resolved(profile,"place_id")?.source_refs||[])];
  add("identity_strength",profile.identity_strength==="STRONG"?20:0,
    profile.identity_strength==="STRONG"?"Strong identity evidence survives conservative resolution.":"Identity evidence is not strong enough.",identityRefs);

  const sourceClasses=uniq(profile.source_types||[]);
  add("source_diversity",sourceClasses.length>=2?15:sourceClasses.length===1?5:0,
    sourceClasses.length>=2?"Multiple public source classes support the profile.":"Limited independent source diversity.",profile.source_refs);

  const website=resolved(profile,"website");
  const official=sourceClasses.includes("OFFICIAL_WEBSITE")&&website;
  add("official_web_presence",official?15:0,
    official?"Official website evidence is resolved.":"No resolved official website evidence.",evidenceRefs(website));

  const type=resolved(profile,"business_type");
  const targets=new Set((mission.target_business_types||[]).map(x=>clean(x,500).toLowerCase()).filter(Boolean));
  const typeMatch=Boolean(type&&targets.has(clean(type.value,500).toLowerCase()));
  add("business_type_fit",typeMatch?20:0,
    typeMatch?"Resolved business type matches the mission target list.":"Business type is missing, conflicted, or outside the target list.",evidenceRefs(type));

  const contact=resolved(profile,"phone")||resolved(profile,"email")||resolved(profile,"contact_url");
  add("contactability",contact?10:0,
    contact?"A public evidence-backed contact channel is resolved.":"No resolved public contact channel.",evidenceRefs(contact));

  const geo=resolved(profile,"inside_mission_geography");
  add("geographic_fit",geo?.value===true||String(geo?.value).toLowerCase()==="true"?10:0,
    geo?.value===true||String(geo?.value).toLowerCase()==="true"?"Profile is evidenced inside the bounded mission geography.":"Geographic fit is missing, conflicted, or outside scope.",evidenceRefs(geo));

  const freshness=resolved(profile,"evidence_fresh");
  add("evidence_freshness",freshness?.value===true||String(freshness?.value).toLowerCase()==="true"?10:0,
    freshness?.value===true||String(freshness?.value).toLowerCase()==="true"?"Material evidence is within configured freshness windows.":"Freshness is unresolved or stale.",evidenceRefs(freshness));

  const total=contributions.reduce((sum,x)=>sum+x.points,0);
  assert(total<=Number(scoring.max_score),"Score exceeds model maximum.");
  for(const item of contributions){
    if(item.points>0) assert(item.evidence_refs.length>0,"Positive score lacks provenance: "+item.criterion_id);
  }
  const core={
    schema:1,profile_ref:profile.profile_ref,model_id:scoring.model_id,model_version:scoring.version,
    score:total,max_score:Number(scoring.max_score),contributions,
    final_status:"PENDING_VERIFICATION",
    explainable:true,
  };
  return freeze({...core,score_ref:contentRef("geo-business-score",core)});
}

export function finalizeVerifiedProfile({profile,score,verification}={}){
  assert(profile?.profile_ref===score?.profile_ref,"Profile/score mismatch.");
  const record=verification?.verification||verification;
  const binding=verification?.binding||null;
  if(binding){
    assert(binding.profile_ref===profile.profile_ref&&binding.score_ref===score.score_ref,"Profile/score verification binding mismatch.");
    assert(binding.verification_ref===record?.verification_ref,"Verification binding ref mismatch.");
  }
  assert(record?.review_state==="PASS"&&record?.decision==="VERIFIED","Siti PASS verification required.");
  assert(record?.verifier_id==="siti"&&record?.independent===true,"Final profile requires independent Siti verification.");
  const result={
    schema:1,profile_ref:profile.profile_ref,score_ref:score.score_ref,
    verification_ref:record.verification_ref,
    score:score.score,max_score:score.max_score,status:"VERIFIED_PROFILE",
  };
  return freeze({...result,verified_profile_ref:contentRef("geo-verified-profile",result)});
}
