import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PROJECT_MEMORY_KINDS,
  PROJECT_MEMORY_SCOPES,
  createProjectMemoryRecord,
  normalizeProjectMemoryRecord,
  promoteProjectMemory,
  buildProjectMemoryView,
  createProjectBrainStore,
  assertProjectMemoryPromotionLineage,
} from "./project-brain.mjs";
import { createDirectoryProjectBrainStorage } from "./project-brain-node-storage.mjs";

const employees=JSON.parse(readFileSync(new URL("../../config/employees.json", import.meta.url),"utf8"));
const employeeIds=employees.employees.map((item)=>item.id);
const schema=JSON.parse(readFileSync(new URL("../../schemas/project-memory-record.schema.json", import.meta.url),"utf8"));

function privateInput(overrides={}){
  return {
    schema:1,
    record_id:"mem.maya.0001",
    scope:"PRIVATE",
    knowledge_type:"LESSON",
    content:"Verified project naming rule uses customer then channel then month.",
    confidence:0.94,
    created_at:"2026-10-02T04:30:00.000Z",
    expires_at:null,
    retention:"PROJECT_LIFECYCLE",
    owner:{kind:"EMPLOYEE",id:"maya"},
    project_id:"project-alpha",
    shared_scope:null,
    source_refs:["source://mission/M-100/task/T-2"],
    evidence_refs:["receipt://mission/M-100/task/T-2"],
    sensitivity:"INTERNAL",
    provenance:{
      origin:"MISSION",
      created_by:"employee:maya",
      origin_refs:["mission://M-100","task://T-2"],
      parent_record_refs:[],
    },
    promotion:null,
    supersedes:[],
    ...overrides,
  };
}

function chain(){
  const privateRecord=createProjectMemoryRecord(privateInput(),{employeeIds});
  const projectRecord=promoteProjectMemory(privateRecord,{
    targetScope:"PROJECT",
    projectId:"project-alpha",
    approved:true,
    reviewer:"human:owner",
    approvedAt:"2026-10-02T04:31:00.000Z",
    reason:"Useful to every worker assigned to project alpha.",
    newRecordId:"mem.maya.project1",
    employeeIds,
  });
  const sharedRecord=promoteProjectMemory(projectRecord,{
    targetScope:"APPROVED_SHARED",
    sharedScope:"project-alpha:approved",
    approved:true,
    reviewer:"human:owner",
    approvedAt:"2026-10-02T04:32:00.000Z",
    reason:"Approved for explicit cross-project/shared consumption.",
    newRecordId:"mem.maya.shared1",
    employeeIds,
  });
  return {privateRecord,projectRecord,sharedRecord};
}

test("Project Brain exposes the three required scopes and eight knowledge classes",()=>{
  assert.deepEqual(PROJECT_MEMORY_SCOPES,["PRIVATE","PROJECT","APPROVED_SHARED"]);
  assert.deepEqual(PROJECT_MEMORY_KINDS,[
    "DECISION","FACT","ASSUMPTION","FAILURE","PREFERENCE","TERMINOLOGY","ARTIFACT","LESSON",
  ]);
  assert.deepEqual(schema.properties.scope.enum,PROJECT_MEMORY_SCOPES);
  assert.deepEqual(schema.properties.knowledge_type.enum,PROJECT_MEMORY_KINDS);
});

test("private memory is content-addressed and validates source confidence time owner and provenance",()=>{
  const record=createProjectMemoryRecord(privateInput(),{employeeIds});
  assert.match(record.record_sha256,/^[a-f0-9]{64}$/);
  assert.equal(record.record_ref,"memory:sha256:"+record.record_sha256);
  assert.equal(record.owner.id,"maya");
  assert.equal(record.confidence,0.94);
  assert.equal(record.source_refs.length,1);
  assert.equal(record.provenance.created_by,"employee:maya");
  assert.equal(normalizeProjectMemoryRecord(record,{employeeIds}).record_ref,record.record_ref);
});

test("private profile memory cannot leak into another employee",()=>{
  const {privateRecord}=chain();
  const maya=buildProjectMemoryView({records:[privateRecord],employeeId:"maya",employeeIds,now:"2026-10-02T05:00:00.000Z"});
  const gugun=buildProjectMemoryView({records:[privateRecord],employeeId:"gugun",employeeIds,now:"2026-10-02T05:00:00.000Z"});
  assert.deepEqual(maya.records.map((item)=>item.record_ref),[privateRecord.record_ref]);
  assert.equal(gugun.records.length,0);
  assert.equal(gugun.denied[0].reason,"CROSS_PROFILE_PRIVATE");
});

test("PROJECT memory requires explicit project authorization and keeps private source hidden",()=>{
  const {privateRecord,projectRecord}=chain();
  const denied=buildProjectMemoryView({
    records:[privateRecord,projectRecord],
    employeeId:"gugun",
    employeeIds,
    now:"2026-10-02T05:00:00.000Z",
  });
  assert.equal(denied.records.length,0);
  assert.ok(denied.denied.some((item)=>item.record_ref===projectRecord.record_ref&&item.reason==="PROJECT_NOT_AUTHORIZED"));

  const allowed=buildProjectMemoryView({
    records:[privateRecord,projectRecord],
    employeeId:"gugun",
    employeeIds,
    authorizedProjectIds:["project-alpha"],
    now:"2026-10-02T05:00:00.000Z",
  });
  assert.deepEqual(allowed.records.map((item)=>item.record_ref),[projectRecord.record_ref]);
  assert.equal(allowed.records.some((item)=>item.record_ref===privateRecord.record_ref),false);
});

test("APPROVED_SHARED requires exact shared scope and remains attributable to its promotion chain",()=>{
  const {privateRecord,projectRecord,sharedRecord}=chain();
  assert.equal(sharedRecord.promotion.from_record_ref,projectRecord.record_ref);
  assert.equal(projectRecord.promotion.from_record_ref,privateRecord.record_ref);
  assert.equal(sharedRecord.promotion.approved_by,"human:owner");
  assert.ok(sharedRecord.provenance.parent_record_refs.includes(projectRecord.record_ref));

  const withoutScope=buildProjectMemoryView({
    records:[privateRecord,projectRecord,sharedRecord],
    employeeId:"gugun",
    employeeIds,
    authorizedProjectIds:[],
    authorizedSharedScopes:[],
    now:"2026-10-02T05:00:00.000Z",
  });
  assert.equal(withoutScope.records.length,0);
  assert.ok(withoutScope.denied.some((item)=>item.record_ref===sharedRecord.record_ref&&item.reason==="SHARED_SCOPE_NOT_AUTHORIZED"));

  const withScope=buildProjectMemoryView({
    records:[privateRecord,projectRecord,sharedRecord],
    employeeId:"gugun",
    employeeIds,
    authorizedSharedScopes:["project-alpha:approved"],
    now:"2026-10-02T05:00:00.000Z",
  });
  assert.deepEqual(withScope.records.map((item)=>item.record_ref),[sharedRecord.record_ref]);
});

test("scope widening is monotonic, explicit, reviewed, and creates immutable new records",()=>{
  const privateRecord=createProjectMemoryRecord(privateInput(),{employeeIds});
  assert.throws(()=>promoteProjectMemory(privateRecord,{
    targetScope:"APPROVED_SHARED",
    sharedScope:"project-alpha:approved",
    approved:true,
    reviewer:"human:owner",
    approvedAt:"2026-10-02T04:31:00.000Z",
    reason:"skip",
    newRecordId:"mem.maya.bad001",
    employeeIds,
  }),/PRIVATE -> PROJECT -> APPROVED_SHARED/);
  assert.throws(()=>promoteProjectMemory(privateRecord,{
    targetScope:"PROJECT",
    projectId:"project-alpha",
    approved:false,
    reviewer:"human:owner",
    approvedAt:"2026-10-02T04:31:00.000Z",
    reason:"not approved",
    newRecordId:"mem.maya.bad002",
    employeeIds,
  }),/explicit approval/);
  const promoted=promoteProjectMemory(privateRecord,{
    targetScope:"PROJECT",
    projectId:"project-alpha",
    approved:true,
    reviewer:"human:owner",
    approvedAt:"2026-10-02T04:31:00.000Z",
    reason:"reviewed",
    newRecordId:"mem.maya.good01",
    employeeIds,
  });
  assert.notEqual(promoted.record_ref,privateRecord.record_ref);
  assert.equal(privateRecord.scope,"PRIVATE");
  assert.equal(promoted.scope,"PROJECT");
});

test("direct forged shared/project records fail closed without promotion lineage",()=>{
  assert.throws(()=>createProjectMemoryRecord(privateInput({
    record_id:"mem.maya.direct1",
    scope:"PROJECT",
    project_id:"project-alpha",
  }),{employeeIds}),/explicitly promoted/);

  const {sharedRecord}=chain();
  const view=buildProjectMemoryView({
    records:[sharedRecord],
    employeeId:"gugun",
    employeeIds,
    authorizedSharedScopes:["project-alpha:approved"],
    now:"2026-10-02T05:00:00.000Z",
  });
  assert.equal(view.records.length,0);
  assert.equal(view.denied[0].reason,"INVALID_PROMOTION_LINEAGE");
});

test("promotion cannot alter the underlying knowledge while laundering scope",()=>{
  const {privateRecord,projectRecord}=chain();
  const forged=createProjectMemoryRecord({
    ...structuredClone(projectRecord),
    record_id:"mem.maya.forged1",
    scope:"APPROVED_SHARED",
    content:"Altered claim that never existed in the approved project record.",
    created_at:"2026-10-02T04:33:00.000Z",
    shared_scope:"project-alpha:approved",
    promotion:{
      from_scope:"PROJECT",
      from_record_ref:projectRecord.record_ref,
      approved_by:"human:owner",
      approved_at:"2026-10-02T04:33:00.000Z",
      reason:"attempted laundering",
    },
    provenance:{
      ...structuredClone(projectRecord.provenance),
      parent_record_refs:[...projectRecord.provenance.parent_record_refs,projectRecord.record_ref],
    },
    supersedes:[...projectRecord.supersedes,projectRecord.record_ref],
    record_sha256:undefined,
    record_ref:undefined,
  },{employeeIds});
  assert.throws(()=>assertProjectMemoryPromotionLineage(forged,[privateRecord,projectRecord],{employeeIds}),/cannot alter/);
});

test("secret-like content and private-sensitivity promotion fail closed",()=>{
  assert.throws(()=>createProjectMemoryRecord(privateInput({
    record_id:"mem.maya.secret1",
    content:"api_key=supersecretvalue123456789",
  }),{employeeIds}),/Secret-like/);

  const privateSensitive=createProjectMemoryRecord(privateInput({
    record_id:"mem.maya.private1",
    sensitivity:"PRIVATE",
  }),{employeeIds});
  assert.throws(()=>promoteProjectMemory(privateSensitive,{
    targetScope:"PROJECT",
    projectId:"project-alpha",
    approved:true,
    reviewer:"human:owner",
    approvedAt:"2026-10-02T04:31:00.000Z",
    reason:"should remain private",
    newRecordId:"mem.maya.private2",
    employeeIds,
  }),/PRIVATE-sensitivity/);
});

test("expired project memory is not injected even with authorization",()=>{
  const privateRecord=createProjectMemoryRecord(privateInput({
    record_id:"mem.maya.expire1",
    expires_at:"2026-10-02T04:45:00.000Z",
  }),{employeeIds});
  const projectRecord=promoteProjectMemory(privateRecord,{
    targetScope:"PROJECT",
    projectId:"project-alpha",
    approved:true,
    reviewer:"human:owner",
    approvedAt:"2026-10-02T04:31:00.000Z",
    reason:"temporary project rule",
    newRecordId:"mem.maya.expire2",
    employeeIds,
  });
  const view=buildProjectMemoryView({
    records:[privateRecord,projectRecord],
    employeeId:"gugun",
    employeeIds,
    authorizedProjectIds:["project-alpha"],
    now:"2026-10-02T05:00:00.000Z",
  });
  assert.equal(view.records.length,0);
  assert.ok(view.denied.some((item)=>item.record_ref===projectRecord.record_ref&&item.reason==="EXPIRED"));
});

function inMemoryStorage(){
  const map=new Map();
  return {
    get:key=>map.has(key)?map.get(key):null,
    set:(key,value)=>map.set(String(key),String(value)),
    remove:key=>map.delete(key),
    map,
  };
}

test("Project Brain store is immutable, verifies ancestry, and detects payload tamper",()=>{
  const storage=inMemoryStorage();
  const store=createProjectBrainStore({storage,employeeIds});
  const {privateRecord,projectRecord,sharedRecord}=chain();
  store.put(privateRecord);
  store.put(projectRecord);
  store.put(sharedRecord);
  assert.equal(store.verify().record_count,3);

  const conflicting=createProjectMemoryRecord(privateInput({
    content:"Different content under the same record id.",
  }),{employeeIds});
  assert.throws(()=>store.put(conflicting),/record_id is immutable/);

  const key="project-brain:record:"+privateRecord.record_ref;
  const tampered=JSON.parse(storage.get(key));
  tampered.content="tampered";
  storage.set(key,JSON.stringify(tampered));
  assert.throws(()=>store.get(privateRecord.record_ref),/checksum mismatch/);
});

test("Project Brain index checksum detects missing/reordered reference tamper",()=>{
  const storage=inMemoryStorage();
  const store=createProjectBrainStore({storage,employeeIds});
  const {privateRecord}=chain();
  store.put(privateRecord);
  const key="project-brain:index:v1";
  const index=JSON.parse(storage.get(key));
  index.record_refs=[];
  storage.set(key,JSON.stringify(index));
  assert.throws(()=>store.list(),/index checksum mismatch/);
});

test("directory-backed Project Brain survives process/store reopen with the same grants",()=>{
  const root=mkdtempSync(join(tmpdir(),"nyoba-project-brain-"));
  try{
    const storage=createDirectoryProjectBrainStorage(root);
    const first=createProjectBrainStore({storage,employeeIds});
    const {privateRecord,projectRecord,sharedRecord}=chain();
    first.put(privateRecord);
    first.put(projectRecord);
    first.put(sharedRecord);
    assert.equal(first.verify().ok,true);

    const reopened=createProjectBrainStore({
      storage:createDirectoryProjectBrainStorage(root),
      employeeIds,
    });
    assert.equal(reopened.verify().record_count,3);
    const view=reopened.view({
      employeeId:"gugun",
      authorizedSharedScopes:["project-alpha:approved"],
      now:"2026-10-02T05:00:00.000Z",
    });
    assert.deepEqual(view.records.map((item)=>item.record_ref),[sharedRecord.record_ref]);
  } finally {
    rmSync(root,{recursive:true,force:true});
  }
});
