import { stat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
export const EVIDENCE_CLASSES=Object.freeze(["INTERNAL_UNIT","INTERNAL_INTEGRATION","SELF_OBSERVATION","BLACK_BOX_EXTERNAL_BEHAVIOR","CROSS_IMPLEMENTATION","LIVE_RUNTIME_EVIDENCE","REAL_WORLD_EVIDENCE"]);
export const EVIDENCE_STATUSES=Object.freeze(["VALIDATED","EVALUATED","COLLECTING","BLOCKED","NOT_RUN"]);
export const CLAIM_KINDS=Object.freeze(["STRUCTURAL","BEHAVIORAL","REAL_WORLD"]);
export const CLAIM_STATUSES=Object.freeze(["SUPPORTED","COLLECTING","UNPROVEN"]);
const QUALIFYING=new Set(["VALIDATED","EVALUATED"]);
const NON_SELF=new Set(["BLACK_BOX_EXTERNAL_BEHAVIOR","CROSS_IMPLEMENTATION","LIVE_RUNTIME_EVIDENCE","REAL_WORLD_EVIDENCE"]);
const nonEmpty=(v)=>typeof v==="string"&&v.trim().length>0;
async function exists(root,path){try{await stat(resolve(root,path));return true;}catch{return false;}}
function compute(claim,byId){
 const referenced=(claim.evidence_ids||[]).map((id)=>byId.get(id)).filter(Boolean);
 const qualified=referenced.filter((item)=>QUALIFYING.has(item.status)&&(item.supports_claims||[]).includes(claim.id));
 const classes=new Set(qualified.map((item)=>item.class));
 const classOk=(claim.required_classes||[]).every((cls)=>classes.has(cls));
 const units=qualified.reduce((n,item)=>n+Number(item.units||0),0);
 const minUnits=Math.max(1,Number(claim.minimum_qualifying_units||1));
 const minRecords=Math.max(1,Number(claim.minimum_qualifying_records||1));
 if(classOk&&units>=minUnits&&qualified.length>=minRecords)return{status:"SUPPORTED",qualified,units};
 if(referenced.some((item)=>item.status==="COLLECTING"))return{status:"COLLECTING",qualified,units};
 return{status:"UNPROVEN",qualified,units};
}
export async function validateEvidenceInventory(inventory,{root=resolve(import.meta.dirname,"../..")}={}){
 const errors=[];
 if(inventory?.schema!==1)errors.push("inventory schema must be 1");
 if(!nonEmpty(inventory?.candidate))errors.push("candidate required");
 if(JSON.stringify(inventory?.classes)!==JSON.stringify(EVIDENCE_CLASSES))errors.push("evidence class catalog drift");
 if(!Array.isArray(inventory?.evidence)||!inventory.evidence.length)errors.push("evidence records required");
 if(!Array.isArray(inventory?.claims)||!inventory.claims.length)errors.push("claim mappings required");
 const byId=new Map();
 for(const item of inventory?.evidence||[]){
  if(!nonEmpty(item?.id)){errors.push("evidence id required");continue;}
  if(byId.has(item.id))errors.push("duplicate evidence id "+item.id); byId.set(item.id,item);
  if(!EVIDENCE_CLASSES.includes(item.class))errors.push(item.id+": invalid evidence class");
  if(!EVIDENCE_STATUSES.includes(item.status))errors.push(item.id+": invalid evidence status");
  if(!Number.isFinite(Number(item.units))||Number(item.units)<0)errors.push(item.id+": units must be >= 0");
  if(!Array.isArray(item.source_paths)||!item.source_paths.length)errors.push(item.id+": source_paths required");
  if(!Array.isArray(item.supports_claims))errors.push(item.id+": supports_claims must be an array");
  if(!nonEmpty(item.claim_limit))errors.push(item.id+": claim_limit required");
  for(const path of item.source_paths||[])if(!await exists(root,path))errors.push(item.id+": source path missing: "+path);
 }
 const claimIds=new Set(),claimResults={};
 for(const claim of inventory?.claims||[]){
  if(!nonEmpty(claim?.id)){errors.push("claim id required");continue;}
  if(claimIds.has(claim.id))errors.push("duplicate claim id "+claim.id);claimIds.add(claim.id);
  if(!CLAIM_KINDS.includes(claim.kind))errors.push(claim.id+": invalid claim kind");
  if(!CLAIM_STATUSES.includes(claim.expected_status))errors.push(claim.id+": invalid expected status");
  if(!Array.isArray(claim.required_classes)||!claim.required_classes.length)errors.push(claim.id+": required_classes required");
  for(const cls of claim.required_classes||[])if(!EVIDENCE_CLASSES.includes(cls))errors.push(claim.id+": invalid required class "+cls);
  if(!Array.isArray(claim.evidence_ids))errors.push(claim.id+": evidence_ids required");
  for(const id of claim.evidence_ids||[])if(!byId.has(id))errors.push(claim.id+": unknown evidence id "+id);
  if(!nonEmpty(claim.claim))errors.push(claim.id+": claim text required");
  const result=compute(claim,byId);
  claimResults[claim.id]=Object.freeze({expected_status:claim.expected_status,computed_status:result.status,qualifying_units:result.units,qualifying_evidence:Object.freeze(result.qualified.map((x)=>x.id)),qualifying_classes:Object.freeze([...new Set(result.qualified.map((x)=>x.class))].sort())});
  if(result.status!==claim.expected_status)errors.push(claim.id+": expected "+claim.expected_status+" but computed "+result.status);
  if(claim.kind==="BEHAVIORAL"&&result.status==="SUPPORTED"&&!result.qualified.some((x)=>NON_SELF.has(x.class)))errors.push(claim.id+": behavioral claim cannot be supported only by internal/self-observation evidence");
  if(claim.kind==="REAL_WORLD"&&result.status==="SUPPORTED"&&!result.qualified.some((x)=>x.class==="REAL_WORLD_EVIDENCE"))errors.push(claim.id+": real-world claim requires REAL_WORLD_EVIDENCE");
 }
 for(const item of inventory?.evidence||[])for(const claimId of item.supports_claims||[])if(!claimIds.has(claimId))errors.push(item.id+": references unknown claim "+claimId);
 const growth={};
 for(const cls of ["BLACK_BOX_EXTERNAL_BEHAVIOR","CROSS_IMPLEMENTATION","LIVE_RUNTIME_EVIDENCE"]){
  const entry=inventory?.v0_5_evidence_growth?.[cls];
  if(!entry||!["INCREASED","OPEN_REQUIRED"].includes(entry.state)){errors.push("v0_5_evidence_growth."+cls+" must be INCREASED or OPEN_REQUIRED");continue;}
  const ids=Array.isArray(entry.evidence_ids)?entry.evidence_ids:[];
  if(entry.state==="INCREASED"&&!ids.length)errors.push("v0_5_evidence_growth."+cls+" INCREASED requires evidence_ids");
  for(const id of ids){const item=byId.get(id);if(!item)errors.push("v0_5_evidence_growth."+cls+": unknown evidence "+id);else if(item.class!==cls)errors.push("v0_5_evidence_growth."+cls+": evidence class mismatch for "+id);}
  growth[cls]=Object.freeze({state:entry.state,evidence_ids:Object.freeze(ids),note:entry.note||""});
 }
 const counts=Object.fromEntries(EVIDENCE_CLASSES.map((cls)=>[cls,(inventory?.evidence||[]).filter((x)=>x.class===cls).length]));
 const unmet=Object.entries(growth).filter(([,x])=>x.state!=="INCREASED").map(([cls])=>cls);
 return Object.freeze({ok:!errors.length,errors:Object.freeze(errors),evidence_count:(inventory?.evidence||[]).length,claim_count:(inventory?.claims||[]).length,counts:Object.freeze(counts),claims:Object.freeze(claimResults),v0_5_growth:Object.freeze(growth),v0_5_growth_complete:!unmet.length,v0_5_growth_unmet:Object.freeze(unmet)});
}
export function buildEvidenceClassificationSnapshot({inventory,validation}){
 if(!validation?.ok)throw new Error("cannot snapshot invalid evidence inventory");
 return Object.freeze({schema:1,candidate:inventory.candidate,evidence_count:validation.evidence_count,class_counts:validation.counts,claims:Object.freeze(Object.fromEntries(Object.entries(validation.claims).map(([id,r])=>[id,Object.freeze({status:r.computed_status,qualifying_units:r.qualifying_units,qualifying_classes:r.qualifying_classes})]))),v0_5_growth:Object.freeze({complete:validation.v0_5_growth_complete,unmet:validation.v0_5_growth_unmet,classes:Object.freeze(Object.fromEntries(Object.entries(validation.v0_5_growth).map(([cls,v])=>[cls,v.state])))}),truth_boundary:"test exists != external proof; self-observation != behavioral proof; evaluated case != repeated behavior"});
}
export async function readAndValidateEvidenceInventory({root=resolve(import.meta.dirname,"../..")}={}){
 const inventory=JSON.parse(await readFile(resolve(root,"config/evidence-classification.json"),"utf8"));
 return{inventory,validation:await validateEvidenceInventory(inventory,{root})};
}
