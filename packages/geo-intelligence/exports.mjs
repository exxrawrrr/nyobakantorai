import { assert,clean,contentRef,freeze,iso,stable } from "./common.mjs";
import { buildXlsxBuffer } from "./xlsx.mjs";
import { validateGeoVerificationBinding } from "./verification.mjs";

function csvEscape(v){
  const s=String(v??"");
  return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function fieldValue(profile,name){
  const f=profile?.fields?.[name];
  return f?.status==="RESOLVED"?f.value:"";
}
function rowsFor(profiles,scores,verifications){
  const scoreBy=new Map(scores.map(x=>[x.profile_ref,x]));
  const verBy=new Map();
  for(const bound of verifications){
    validateGeoVerificationBinding(bound);
    verBy.set(bound.binding.profile_ref,bound);
  }
  return profiles.map(profile=>{
    const score=scoreBy.get(profile.profile_ref);
    assert(score&&score.profile_ref===profile.profile_ref,"Export profile score binding missing: "+profile.profile_ref);
    const bound=verBy.get(profile.profile_ref)||null;
    if(bound) assert(bound.binding.score_ref===score.score_ref,"Export verification/score binding mismatch: "+profile.profile_ref);
    const verification=bound?.verification||null;
    return {
      profile_ref:profile.profile_ref,
      place_id:profile.place_id||"",
      name:fieldValue(profile,"name"),
      website:fieldValue(profile,"website"),
      business_type:fieldValue(profile,"business_type"),
      phone:fieldValue(profile,"phone"),
      email:fieldValue(profile,"email"),
      address:fieldValue(profile,"address"),
      score:score?.score??"",
      score_model:score?score.model_id+"@"+score.model_version:"",
      verification_state:verification?.review_state||"NOT_RUN",
      verification_ref:verification?.verification_ref||"",
      source_count:(profile.source_refs||[]).length,
      source_types:(profile.source_types||[]).join("|"),
      completeness_claim:false,
    };
  });
}
export function buildCsv(rows){
  assert(Array.isArray(rows)&&rows.length>0,"CSV rows required.");
  const columns=Object.keys(rows[0]);
  return [columns.join(","),...rows.map(r=>columns.map(c=>csvEscape(r[c])).join(","))].join("\n")+"\n";
}
export function createGeoResearchExportPack({expansion_plan,profiles=[],scores=[],verifications=[],sources=[],created_at,require_all_verified=true}={}){
  assert(expansion_plan?.completeness_claim===false,"Export requires bounded non-complete expansion plan.");
  assert(profiles.length>0,"Export profiles required.");
  assert(scores.length===profiles.length,"Each exported profile requires a score.");
  const createdAt=iso(created_at,"Export created_at");
  for(const p of profiles){
    assert(p.raw_provider_content_persisted===false,"Export may not include profile with raw provider content.");
    assert(p.completeness_claim===false,"Export profile may not claim completeness.");
  }
  const rows=rowsFor(profiles,scores,verifications);
  if(require_all_verified){
    assert(rows.every(row=>row.verification_state==="PASS"),"Final geo research export requires Siti PASS for every profile.");
  }
  const csv=buildCsv(rows);
  const xlsx=buildXlsxBuffer(rows,{sheet_name:"Geo Profiles"});
  const verified=verifications.filter(v=>v.verification?.review_state==="PASS"&&v.verification?.decision==="VERIFIED").length;
  const report=[
    "# Geo Intelligence Research Report",
    "",
    `Generated: ${createdAt}`,
    `Expansion plan: ${expansion_plan.plan_ref}`,
    `Observed query count: ${expansion_plan.queries.length}`,
    `Profile count: ${profiles.length}`,
    `Siti verified: ${verified}/${profiles.length}`,
    "",
    "> Coverage is bounded and observed only. This report does not claim exhaustive market coverage.",
    "",
    "## Profiles",
    ...rows.map(r=>`- ${r.name||r.place_id||r.profile_ref} — score ${r.score}/100 — verification ${r.verification_state}`),
    "",
  ].join("\n");
  const evidence={
    schema:1,created_at:createdAt,expansion_plan_ref:expansion_plan.plan_ref,
    query_refs:expansion_plan.queries.map(x=>x.query_ref),
    profiles:profiles.map(p=>({profile_ref:p.profile_ref,cluster_ref:p.cluster_ref,source_refs:p.source_refs,source_types:p.source_types,completeness_claim:false})),
    scores:scores.map(s=>({score_ref:s.score_ref,profile_ref:s.profile_ref,model_id:s.model_id,model_version:s.model_version,score:s.score,contributions:s.contributions})),
    verifications:verifications.map(v=>({binding_ref:v.binding.binding_ref,profile_ref:v.binding.profile_ref,score_ref:v.binding.score_ref,verification_ref:v.verification.verification_ref,review_state:v.verification.review_state,decision:v.verification.decision,verifier_id:v.verification.verifier_id,independent:v.verification.independent})),
    sources:sources.map(s=>({source_ref:s.source_ref,source_type:s.source_type,url:s.url,retrieved_at:s.retrieved_at,claim_refs:(s.claims||[]).map(c=>c.claim_ref)})),
    completeness_claim:false,raw_provider_content_included:false,require_all_verified:require_all_verified===true,
  };
  const packCore={
    schema:1,created_at:createdAt,plan_ref:expansion_plan.plan_ref,
    profile_refs:profiles.map(x=>x.profile_ref),score_refs:scores.map(x=>x.score_ref),
    verification_refs:verifications.map(x=>x.verification.verification_ref),
    evidence_pack_ref:contentRef("geo-evidence-pack",evidence),
    completeness_claim:false,
  };
  const packRef=contentRef("geo-export-pack",packCore);
  return freeze({
    ...packCore,pack_ref:packRef,
    files:{
      "profiles.csv":{media_type:"text/csv",encoding:"utf8",data:csv},
      "profiles.xlsx":{media_type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",encoding:"base64",data:xlsx.toString("base64")},
      "report.md":{media_type:"text/markdown",encoding:"utf8",data:report},
      "evidence.json":{media_type:"application/json",encoding:"utf8",data:JSON.stringify(stable(evidence),null,2)+"\n"},
    },
  });
}
