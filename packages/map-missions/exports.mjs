import { contentRef,assert,freeze,iso,stable } from "../geo-intelligence/common.mjs";
import { buildCsv } from "../geo-intelligence/exports.mjs";
import { buildXlsxBuffer } from "../geo-intelligence/xlsx.mjs";

function row(candidate){
  return {
    crm_lead_id:candidate.crm_lead_id,
    profile_ref:candidate.profile_ref,
    verified_profile_ref:candidate.verified_profile_ref,
    place_id:candidate.place_id||"",
    name:candidate.name||"",
    website:candidate.website||"",
    business_type:candidate.business_type||"",
    phone:candidate.phone||"",
    email:candidate.email||"",
    address:candidate.address||"",
    score:candidate.score,
    score_model:candidate.score_model,
    qualification_tier:candidate.qualification_tier,
    verification_ref:candidate.verification_ref,
    source_refs:(candidate.source_refs||[]).join("|"),
    source_types:(candidate.source_types||[]).join("|"),
    created_at:candidate.created_at,
    updated_at:candidate.updated_at,
  };
}
export function createCrmReadyExportPack({candidates=[],created_at}={}, {policy}={}){
  assert(candidates.length>0,"CRM export candidates required.");
  const createdAt=iso(created_at,"CRM export created_at");
  const rows=candidates.map(candidate=>{
    assert(candidate?.candidate_ref&&candidate?.verification_ref,"CRM export requires verified candidate.");
    assert(candidate.external_write_state==="NOT_WRITTEN","CRM export candidate external-write state invalid.");
    assert(candidate.completeness_claim===false,"CRM export candidate may not claim completeness.");
    for(const field of policy.crm.forbidden_fields||[]) assert(!(field in candidate),"CRM export contains forbidden field: "+field);
    return row(candidate);
  });
  const ids=new Set(rows.map(x=>x.crm_lead_id));assert(ids.size===rows.length,"CRM export duplicate lead identity.");
  const evidence={
    schema:1,created_at:createdAt,
    candidate_refs:candidates.map(x=>x.candidate_ref).sort(),
    verification_refs:candidates.map(x=>x.verification_ref).sort(),
    source_refs:[...new Set(candidates.flatMap(x=>x.source_refs||[]))].sort(),
    lead_count:rows.length,verified_only:true,outreach_included:false,
    external_write_performed:false,completeness_claim:false,
  };
  const core={schema:1,created_at:createdAt,lead_count:rows.length,
    candidate_refs:evidence.candidate_refs,verification_refs:evidence.verification_refs,
    evidence_ref:contentRef("crm-export-evidence",evidence),
    external_write_state:"NOT_WRITTEN",outreach_included:false,completeness_claim:false};
  return freeze({...core,crm_export_ref:contentRef("crm-ready-export",core),files:{
    "crm-leads.csv":{media_type:"text/csv",encoding:"utf8",data:buildCsv(rows)},
    "crm-leads.xlsx":{media_type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",encoding:"base64",data:buildXlsxBuffer(rows,{sheet_name:"CRM Leads"}).toString("base64")},
    "crm-evidence.json":{media_type:"application/json",encoding:"utf8",data:JSON.stringify(stable(evidence),null,2)+"\n"},
  }});
}
