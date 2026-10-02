import { createHash } from "node:crypto";
import { containsSecretLikeContent } from "./index.mjs";

export const PROJECT_BRAIN_API = 1;
export const PROJECT_MEMORY_SCOPES = Object.freeze(["PRIVATE","PROJECT","APPROVED_SHARED"]);
export const PROJECT_MEMORY_KINDS = Object.freeze([
  "DECISION",
  "FACT",
  "ASSUMPTION",
  "FAILURE",
  "PREFERENCE",
  "TERMINOLOGY",
  "ARTIFACT",
  "LESSON",
]);

const SENSITIVITIES = Object.freeze(["PUBLIC","INTERNAL","PRIVATE","SECRET_PROHIBITED"]);
const ORIGINS = Object.freeze(["MISSION","TASK","ARTIFACT","USER","IMPORT","LEARNING_EVENT","OTHER"]);
const INDEX_KEY = "project-brain:index:v1";

const clean=(value,max=8000)=>String(value??"").trim().slice(0,max);
const unique=(items=[])=>Object.freeze([...new Set((Array.isArray(items)?items:[]).map((item)=>clean(item,1000)).filter(Boolean))]);
function assert(condition,message){ if(!condition) throw new Error(message); }
function validTime(value){ return Boolean(value) && !Number.isNaN(Date.parse(value)); }
function employeeId(value){ return /^[a-z][a-z0-9-]{1,39}$/.test(clean(value,40)); }
function recordId(value){ return /^[a-z0-9][a-z0-9._-]{5,127}$/.test(clean(value,128)); }
function scopeId(value){ return /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,199}$/.test(clean(value,200)); }

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==="object"){
    const out={};
    for(const key of Object.keys(value).sort()) out[key]=stable(value[key]);
    return out;
  }
  return value;
}

export function canonicalProjectMemoryJson(value){
  return JSON.stringify(stable(value));
}

function sha256Hex(value){
  return createHash("sha256").update(value).digest("hex");
}

function clone(value){ return structuredClone(value); }

function normalizeOwner(owner,{employeeIds=[]}={}){
  const kind=clean(owner?.kind,20).toUpperCase();
  const id=clean(owner?.id,128);
  assert(["EMPLOYEE","HUMAN"].includes(kind),"Project memory owner.kind must be EMPLOYEE or HUMAN.");
  assert(id,"Project memory owner.id is required.");
  if(kind==="EMPLOYEE"){
    assert(employeeId(id),"Project memory employee owner id is invalid.");
    if(employeeIds.length) assert(employeeIds.includes(id),"Project memory employee owner is unknown.");
  }
  return Object.freeze({kind,id});
}

function normalizeProvenance(provenance){
  const origin=clean(provenance?.origin,40).toUpperCase();
  const createdBy=clean(provenance?.created_by,160);
  const originRefs=unique(provenance?.origin_refs);
  const parentRecordRefs=unique(provenance?.parent_record_refs);
  assert(ORIGINS.includes(origin),"Project memory provenance.origin is invalid.");
  assert(createdBy,"Project memory provenance.created_by is required.");
  assert(originRefs.length>0,"Project memory provenance.origin_refs are required.");
  return Object.freeze({
    origin,
    created_by:createdBy,
    origin_refs:originRefs,
    parent_record_refs:parentRecordRefs,
  });
}

function normalizePromotion(promotion){
  if(promotion==null) return null;
  const fromScope=clean(promotion.from_scope,40).toUpperCase();
  const fromRef=clean(promotion.from_record_ref,200);
  const approvedBy=clean(promotion.approved_by,160);
  const approvedAt=clean(promotion.approved_at,80);
  const reason=clean(promotion.reason,1000);
  assert(PROJECT_MEMORY_SCOPES.includes(fromScope),"Project memory promotion.from_scope is invalid.");
  assert(/^memory:sha256:[a-f0-9]{64}$/.test(fromRef),"Project memory promotion.from_record_ref is invalid.");
  assert(approvedBy,"Project memory promotion.approved_by is required.");
  assert(validTime(approvedAt),"Project memory promotion.approved_at is invalid.");
  assert(reason,"Project memory promotion.reason is required.");
  return Object.freeze({
    from_scope:fromScope,
    from_record_ref:fromRef,
    approved_by:approvedBy,
    approved_at:new Date(approvedAt).toISOString(),
    reason,
  });
}

function normalizeBody(input,{employeeIds=[]}={}){
  assert(input?.schema===1,"Project memory schema must be 1.");
  const id=clean(input.record_id,128);
  const scope=clean(input.scope,40).toUpperCase();
  const kind=clean(input.knowledge_type,40).toUpperCase();
  const content=clean(input.content,8000);
  const createdAt=clean(input.created_at,80);
  const project=clean(input.project_id,200)||null;
  const sharedScope=clean(input.shared_scope,200)||null;
  const sensitivity=clean(input.sensitivity,40).toUpperCase();
  const confidence=Number(input.confidence);
  const expiresAt=input.expires_at==null||clean(input.expires_at,80)===""?null:clean(input.expires_at,80);
  const retention=clean(input.retention,80)||"NORMAL";
  const sourceRefs=unique(input.source_refs);
  const evidenceRefs=unique(input.evidence_refs);
  const supersedes=unique(input.supersedes);
  const owner=normalizeOwner(input.owner,{employeeIds});
  const provenance=normalizeProvenance(input.provenance);
  const promotion=normalizePromotion(input.promotion);

  assert(recordId(id),"Project memory record_id is invalid.");
  assert(PROJECT_MEMORY_SCOPES.includes(scope),"Project memory scope is invalid.");
  assert(PROJECT_MEMORY_KINDS.includes(kind),"Project memory knowledge_type is invalid.");
  assert(content,"Project memory content is required.");
  assert(!containsSecretLikeContent(content),"Secret-like content cannot be stored in Project Brain.");
  assert(validTime(createdAt),"Project memory created_at is invalid.");
  assert(Number.isFinite(confidence)&&confidence>=0&&confidence<=1,"Project memory confidence must be between 0 and 1.");
  assert(SENSITIVITIES.includes(sensitivity),"Project memory sensitivity is invalid.");
  assert(sensitivity!=="SECRET_PROHIBITED","SECRET_PROHIBITED cannot be persisted in Project Brain.");
  assert(sourceRefs.length>0,"Project memory source_refs are required.");
  assert(!sourceRefs.some((ref)=>containsSecretLikeContent(ref)),"Secret-like source reference cannot be stored in Project Brain.");
  assert(!evidenceRefs.some((ref)=>containsSecretLikeContent(ref)),"Secret-like evidence reference cannot be stored in Project Brain.");
  assert(!["credentials","api_tokens","passwords","private_keys"].includes(retention.toLowerCase()),"Invalid retention policy.");
  if(expiresAt!=null){
    assert(validTime(expiresAt),"Project memory expires_at is invalid.");
    assert(Date.parse(expiresAt)>Date.parse(createdAt),"Project memory expires_at must be after created_at.");
  }

  if(scope==="PRIVATE"){
    assert(owner.kind==="EMPLOYEE","PRIVATE Project Brain memory must be owned by one employee.");
    assert(promotion==null,"PRIVATE Project Brain memory must not contain promotion metadata.");
    assert(sharedScope==null,"PRIVATE Project Brain memory must not have shared_scope.");
  }

  if(scope==="PROJECT"){
    assert(project&&scopeId(project),"PROJECT memory requires a valid project_id.");
    assert(sharedScope==null,"PROJECT memory must not have shared_scope.");
    assert(promotion!=null&&promotion.from_scope==="PRIVATE","PROJECT memory must be explicitly promoted from PRIVATE.");
    assert(sensitivity!=="PRIVATE","PRIVATE-sensitivity memory cannot be promoted to PROJECT.");
  }

  if(scope==="APPROVED_SHARED"){
    assert(sharedScope&&scopeId(sharedScope),"APPROVED_SHARED memory requires a valid shared_scope.");
    assert(promotion!=null&&promotion.from_scope==="PROJECT","APPROVED_SHARED memory must be explicitly promoted from PROJECT.");
    assert(sensitivity!=="PRIVATE","PRIVATE-sensitivity memory cannot be promoted to APPROVED_SHARED.");
  }

  if(promotion!=null){
    assert(supersedes.includes(promotion.from_record_ref),"Promoted memory must supersede its promotion parent.");
    assert(provenance.parent_record_refs.includes(promotion.from_record_ref),"Promoted memory provenance must attribute its parent record.");
  }

  return Object.freeze({
    schema:1,
    record_id:id,
    scope,
    knowledge_type:kind,
    content,
    confidence,
    created_at:new Date(createdAt).toISOString(),
    expires_at:expiresAt==null?null:new Date(expiresAt).toISOString(),
    retention,
    owner,
    project_id:project,
    shared_scope:sharedScope,
    source_refs:sourceRefs,
    evidence_refs:evidenceRefs,
    sensitivity,
    provenance,
    promotion,
    supersedes,
  });
}

function finalizeBody(body){
  const hash=sha256Hex(canonicalProjectMemoryJson(body));
  return Object.freeze({
    ...clone(body),
    record_sha256:hash,
    record_ref:"memory:sha256:"+hash,
  });
}

export function createProjectMemoryRecord(input,{employeeIds=[]}={}){
  return finalizeBody(normalizeBody(input,{employeeIds}));
}

export function normalizeProjectMemoryRecord(record,{employeeIds=[]}={}){
  assert(record&&typeof record==="object","Project memory record is required.");
  const body=normalizeBody(record,{employeeIds});
  const hash=sha256Hex(canonicalProjectMemoryJson(body));
  assert(clean(record.record_sha256,64)===hash,"Project memory record checksum mismatch.");
  assert(clean(record.record_ref,200)==="memory:sha256:"+hash,"Project memory record_ref mismatch.");
  return Object.freeze({...clone(body),record_sha256:hash,record_ref:"memory:sha256:"+hash});
}

function sameKnowledge(left,right){
  return canonicalProjectMemoryJson({
    knowledge_type:left.knowledge_type,
    content:left.content,
    confidence:left.confidence,
    owner:left.owner,
    source_refs:left.source_refs,
    evidence_refs:left.evidence_refs,
    sensitivity:left.sensitivity,
  })===canonicalProjectMemoryJson({
    knowledge_type:right.knowledge_type,
    content:right.content,
    confidence:right.confidence,
    owner:right.owner,
    source_refs:right.source_refs,
    evidence_refs:right.evidence_refs,
    sensitivity:right.sensitivity,
  });
}

export function assertProjectMemoryPromotionLineage(record,records,{employeeIds=[]}={}){
  const current=normalizeProjectMemoryRecord(record,{employeeIds});
  if(current.scope==="PRIVATE") return current;
  const byRef=records instanceof Map?records:new Map((Array.isArray(records)?records:[]).map((item)=>{
    const normalized=normalizeProjectMemoryRecord(item,{employeeIds});
    return [normalized.record_ref,normalized];
  }));
  const parent=byRef.get(current.promotion.from_record_ref);
  assert(parent,"Project memory promotion parent is missing.");
  assert(parent.scope===current.promotion.from_scope,"Project memory promotion parent scope mismatch.");
  assert(sameKnowledge(parent,current),"Project memory promotion cannot alter the underlying knowledge.");
  if(current.scope==="PROJECT") assert(parent.scope==="PRIVATE","PROJECT memory must descend from PRIVATE memory.");
  if(current.scope==="APPROVED_SHARED") assert(parent.scope==="PROJECT","APPROVED_SHARED memory must descend from PROJECT memory.");
  return current;
}

export function promoteProjectMemory(record,{
  targetScope,
  projectId=null,
  sharedScope=null,
  approved=false,
  reviewer=null,
  approvedAt=null,
  reason=null,
  newRecordId=null,
  employeeIds=[],
}={}){
  const source=normalizeProjectMemoryRecord(record,{employeeIds});
  const target=clean(targetScope,40).toUpperCase();
  const allowed=source.scope==="PRIVATE"&&target==="PROJECT"
    || source.scope==="PROJECT"&&target==="APPROVED_SHARED";
  assert(allowed,"Project Brain scope promotion must follow PRIVATE -> PROJECT -> APPROVED_SHARED.");
  assert(approved===true,"Project Brain scope promotion requires explicit approval.");
  const reviewerId=clean(reviewer,160);
  const when=clean(approvedAt,80);
  const why=clean(reason,1000);
  const id=clean(newRecordId,128);
  assert(reviewerId,"Project Brain scope promotion requires reviewer.");
  assert(validTime(when),"Project Brain scope promotion requires valid approvedAt.");
  assert(why,"Project Brain scope promotion requires reason.");
  assert(recordId(id),"Project Brain scope promotion requires valid newRecordId.");
  assert(source.sensitivity!=="PRIVATE","PRIVATE-sensitivity memory cannot be promoted.");

  const nextProject=target==="PROJECT"?clean(projectId,200):source.project_id;
  const nextShared=target==="APPROVED_SHARED"?clean(sharedScope,200):null;
  if(target==="PROJECT") assert(nextProject&&scopeId(nextProject),"PROJECT promotion requires projectId.");
  if(target==="APPROVED_SHARED") assert(nextShared&&scopeId(nextShared),"APPROVED_SHARED promotion requires sharedScope.");

  return createProjectMemoryRecord({
    ...clone(source),
    record_id:id,
    scope:target,
    created_at:new Date(when).toISOString(),
    project_id:nextProject,
    shared_scope:nextShared,
    promotion:{
      from_scope:source.scope,
      from_record_ref:source.record_ref,
      approved_by:reviewerId,
      approved_at:new Date(when).toISOString(),
      reason:why,
    },
    provenance:{
      ...clone(source.provenance),
      parent_record_refs:[...source.provenance.parent_record_refs,source.record_ref],
    },
    supersedes:[...source.supersedes,source.record_ref],
    record_sha256:undefined,
    record_ref:undefined,
  },{employeeIds});
}

function expired(record,now){
  return record.expires_at!=null && Date.parse(record.expires_at)<=Date.parse(now);
}

export function buildProjectMemoryView({
  records=[],
  employeeId:viewer,
  authorizedProjectIds=[],
  authorizedSharedScopes=[],
  employeeIds=[],
  now=new Date().toISOString(),
}={}){
  const id=clean(viewer,40).toLowerCase();
  assert(employeeId(id),"valid employeeId required for Project Brain view.");
  if(employeeIds.length) assert(employeeIds.includes(id),"unknown employeeId for Project Brain view.");
  assert(validTime(now),"Project Brain view now must be a valid date-time.");

  const projects=new Set((Array.isArray(authorizedProjectIds)?authorizedProjectIds:[]).map((x)=>clean(x,200)).filter(Boolean));
  const shared=new Set((Array.isArray(authorizedSharedScopes)?authorizedSharedScopes:[]).map((x)=>clean(x,200)).filter(Boolean));
  const normalized=[];
  const denied=[];

  for(const input of Array.isArray(records)?records:[]){
    try { normalized.push(normalizeProjectMemoryRecord(input,{employeeIds})); }
    catch(error){
      denied.push(Object.freeze({
        record_ref:clean(input?.record_ref,200)||"unknown-record",
        reason:"INVALID_RECORD",
        details:Object.freeze([clean(error?.message,1000)]),
      }));
    }
  }

  const byRef=new Map(normalized.map((record)=>[record.record_ref,record]));
  const visible=[];

  for(const record of normalized){
    try {
      assertProjectMemoryPromotionLineage(record,byRef,{employeeIds});
    } catch(error){
      denied.push(Object.freeze({
        record_ref:record.record_ref,
        reason:"INVALID_PROMOTION_LINEAGE",
        details:Object.freeze([clean(error?.message,1000)]),
      }));
      continue;
    }

    if(expired(record,now)){
      denied.push(Object.freeze({record_ref:record.record_ref,reason:"EXPIRED",details:Object.freeze([record.expires_at])}));
      continue;
    }

    if(record.scope==="PRIVATE"){
      if(record.owner.kind==="EMPLOYEE"&&record.owner.id===id) visible.push(record);
      else denied.push(Object.freeze({record_ref:record.record_ref,reason:"CROSS_PROFILE_PRIVATE",details:Object.freeze([record.owner.id])}));
      continue;
    }

    if(record.scope==="PROJECT"){
      if(projects.has(record.project_id)) visible.push(record);
      else denied.push(Object.freeze({record_ref:record.record_ref,reason:"PROJECT_NOT_AUTHORIZED",details:Object.freeze([record.project_id])}));
      continue;
    }

    if(shared.has(record.shared_scope)) visible.push(record);
    else denied.push(Object.freeze({record_ref:record.record_ref,reason:"SHARED_SCOPE_NOT_AUTHORIZED",details:Object.freeze([record.shared_scope])}));
  }

  return Object.freeze({
    api:PROJECT_BRAIN_API,
    employee_id:id,
    authorized_project_ids:Object.freeze([...projects].sort()),
    authorized_shared_scopes:Object.freeze([...shared].sort()),
    records:Object.freeze(visible.map((item)=>Object.freeze(clone(item)))),
    denied:Object.freeze(denied),
  });
}

function memoryStorage(){
  const map=new Map();
  return Object.freeze({
    get:key=>map.has(key)?map.get(key):null,
    set:(key,value)=>{ map.set(String(key),String(value)); },
    remove:key=>{ map.delete(key); },
  });
}

function storageAssert(storage){
  assert(storage&&typeof storage.get==="function"&&typeof storage.set==="function"&&typeof storage.remove==="function","Project Brain storage must expose get/set/remove.");
}

function indexBody(refs){
  return {schema:1,format:"nyobakantorai-project-brain",record_refs:[...refs]};
}

function readIndex(storage){
  const raw=storage.get(INDEX_KEY);
  if(raw==null) return Object.freeze({...indexBody([]),index_sha256:sha256Hex(canonicalProjectMemoryJson(indexBody([])))});
  let parsed;
  try { parsed=JSON.parse(raw); } catch { throw new Error("Project Brain index is invalid JSON."); }
  assert(parsed?.schema===1&&parsed?.format==="nyobakantorai-project-brain","Project Brain index format is invalid.");
  assert(Array.isArray(parsed.record_refs)&&new Set(parsed.record_refs).size===parsed.record_refs.length,"Project Brain index record_refs are invalid.");
  const body=indexBody(parsed.record_refs);
  assert(clean(parsed.index_sha256,64)===sha256Hex(canonicalProjectMemoryJson(body)),"Project Brain index checksum mismatch.");
  return Object.freeze({...body,index_sha256:parsed.index_sha256});
}

function writeIndex(storage,refs){
  const body=indexBody(refs);
  storage.set(INDEX_KEY,JSON.stringify({...body,index_sha256:sha256Hex(canonicalProjectMemoryJson(body))}));
}

function recordKey(ref){ return "project-brain:record:"+ref; }

export function createProjectBrainStore({storage=memoryStorage(),employeeIds=[]}={}){
  storageAssert(storage);

  const api={
    put(input){
      const record=normalizeProjectMemoryRecord(input,{employeeIds});
      const index=readIndex(storage);
      const existingById=index.record_refs.map((ref)=>api.get(ref)).find((item)=>item.record_id===record.record_id);
      if(existingById) assert(existingById.record_ref===record.record_ref,"Project Brain record_id is immutable and already exists with different content.");
      if(record.scope!=="PRIVATE"){
        const records=index.record_refs.map((ref)=>api.get(ref));
        assertProjectMemoryPromotionLineage(record,records,{employeeIds});
      }
      const key=recordKey(record.record_ref);
      const existing=storage.get(key);
      if(existing!=null){
        const parsed=JSON.parse(existing);
        const normalized=normalizeProjectMemoryRecord(parsed,{employeeIds});
        assert(normalized.record_ref===record.record_ref,"Project Brain existing record integrity mismatch.");
        return normalized;
      }
      storage.set(key,JSON.stringify(record));
      writeIndex(storage,[...index.record_refs,record.record_ref]);
      return record;
    },
    get(ref){
      const key=recordKey(clean(ref,200));
      const raw=storage.get(key);
      assert(raw!=null,"Project Brain record not found.");
      let parsed;
      try { parsed=JSON.parse(raw); } catch { throw new Error("Project Brain record is invalid JSON."); }
      return normalizeProjectMemoryRecord(parsed,{employeeIds});
    },
    list(){
      const index=readIndex(storage);
      return Object.freeze(index.record_refs.map((ref)=>api.get(ref)));
    },
    view(args={}){
      return buildProjectMemoryView({...args,records:api.list(),employeeIds});
    },
    verify(){
      const records=api.list();
      const byRef=new Map(records.map((record)=>[record.record_ref,record]));
      for(const record of records) assertProjectMemoryPromotionLineage(record,byRef,{employeeIds});
      return Object.freeze({ok:true,record_count:records.length,index_sha256:readIndex(storage).index_sha256});
    },
    storage,
  };

  return Object.freeze(api);
}
