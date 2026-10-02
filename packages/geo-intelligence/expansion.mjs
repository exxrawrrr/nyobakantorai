import { assert,clean,contentRef,freeze,normalizedText,uniq,iso } from "./common.mjs";

export function createSearchExpansionPlan(input,{policy}={}){
  assert(policy?.schema===1,"Geo intelligence policy required.");
  const cfg=policy.search_expansion||{};
  const missionId=clean(input?.mission_id,160);
  assert(missionId,"Expansion mission_id required.");
  const createdAt=iso(input?.created_at,"Expansion created_at");
  const rawKeywords=Array.isArray(input?.keywords)?input.keywords:[];
  const keywordMap=new Map();
  for(const raw of rawKeywords){
    const display=clean(raw,300),key=normalizedText(display);
    if(display&&key&&!keywordMap.has(key)) keywordMap.set(key,display);
  }
  const keywords=[...keywordMap.values()];
  assert(keywords.length>0,"At least one search keyword required.");
  assert(keywords.length<=Number(cfg.max_keywords),"Search keyword bound exceeded.");

  const geographies=[];
  const seenGeo=new Set();
  for(const raw of Array.isArray(input?.geographies)?input.geographies:[]){
    const id=clean(raw?.id,120),label=clean(raw?.label||id,300);
    assert(id&&label,"Expansion geography id/label required.");
    assert(!seenGeo.has(id),"Duplicate expansion geography id: "+id);
    seenGeo.add(id);
    const area=structuredClone(raw.area);
    assert(area&&typeof area==="object","Expansion geography area required.");
    geographies.push({id,label,area});
  }
  assert(geographies.length>0,"At least one bounded geography required.");
  assert(geographies.length<=Number(cfg.max_geographies),"Search geography bound exceeded.");

  const requested=[];
  for(const geo of geographies){
    let count=0;
    for(const keyword of keywords){
      if(requested.length>=Number(cfg.max_queries)) break;
      if(count>=Number(cfg.max_queries_per_geography)) break;
      const query={
        geography_id:geo.id,
        geography_label:geo.label,
        area:structuredClone(geo.area),
        keyword,
        normalized_keyword:normalizedText(keyword),
        ordinal:requested.length+1,
      };
      requested.push({...query,query_ref:contentRef("geo-expansion-query",query)});
      count++;
    }
  }
  assert(requested.length>0,"Expansion produced no queries.");
  const core={
    schema:1,
    mission_id:missionId,
    created_at:createdAt,
    queries:requested,
    completeness_claim:false,
    adaptive_expansion_requires_review:cfg.adaptive_expansion_requires_review===true,
    claim_boundary:policy.claim_boundary,
  };
  return freeze({...core,plan_ref:contentRef("geo-expansion-plan",core)});
}

export function validateExpansionPlan(plan,{policy}={}){
  assert(plan?.schema===1,"Expansion plan schema invalid.");
  assert(plan.completeness_claim===false,"Expansion plan may not claim completeness.");
  assert(Array.isArray(plan.queries)&&plan.queries.length>0,"Expansion queries required.");
  assert(plan.queries.length<=Number(policy.search_expansion.max_queries),"Expansion query count exceeds policy.");
  const perGeo=new Map();
  const refs=new Set();
  for(const q of plan.queries){
    assert(q.query_ref===contentRef("geo-expansion-query",{
      geography_id:q.geography_id,geography_label:q.geography_label,area:q.area,
      keyword:q.keyword,normalized_keyword:q.normalized_keyword,ordinal:q.ordinal,
    }),"Expansion query checksum mismatch.");
    assert(!refs.has(q.query_ref),"Duplicate expansion query ref.");
    refs.add(q.query_ref);
    perGeo.set(q.geography_id,(perGeo.get(q.geography_id)||0)+1);
  }
  for(const count of perGeo.values()) assert(count<=Number(policy.search_expansion.max_queries_per_geography),"Expansion per-geography bound exceeded.");
  const core={schema:1,mission_id:plan.mission_id,created_at:plan.created_at,queries:plan.queries,
    completeness_claim:plan.completeness_claim,adaptive_expansion_requires_review:plan.adaptive_expansion_requires_review,
    claim_boundary:plan.claim_boundary};
  assert(plan.plan_ref===contentRef("geo-expansion-plan",core),"Expansion plan checksum mismatch.");
  return true;
}

export function proposeAdaptiveExpansion({currentPlan,proposedKeywords=[],reason,evidence_refs=[]}={}, {policy}={}){
  validateExpansionPlan(currentPlan,{policy});
  assert(policy.search_expansion.adaptive_expansion_requires_review===true,"Adaptive expansion must require review.");
  const words=uniq(proposedKeywords.map(x=>clean(x,300)).filter(Boolean));
  assert(words.length>0,"Adaptive expansion proposal requires keywords.");
  const proposal={
    schema:1,
    current_plan_ref:currentPlan.plan_ref,
    proposed_keywords:words,
    reason:clean(reason,2000),
    evidence_refs:uniq(evidence_refs.map(x=>clean(x,1000)).filter(Boolean)),
    review_required:true,
    approved:false,
  };
  assert(proposal.reason,"Adaptive expansion reason required.");
  assert(proposal.evidence_refs.length>0,"Adaptive expansion evidence required.");
  return freeze({...proposal,proposal_ref:contentRef("geo-expansion-proposal",proposal)});
}
