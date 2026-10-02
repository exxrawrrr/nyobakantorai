import { readFile } from "node:fs/promises";
import {
  createProjectMemoryRecord,
  promoteProjectMemory,
  buildProjectMemoryView,
} from "../../packages/memory-learning/project-brain.mjs";

const employees=JSON.parse(await readFile(new URL("../../config/employees.json", import.meta.url),"utf8"));
const employeeIds=employees.employees.map((item)=>item.id);

const privateRecord=createProjectMemoryRecord({
  schema:1,
  record_id:"mem.maya.bench01",
  scope:"PRIVATE",
  knowledge_type:"DECISION",
  content:"Project alpha naming convention uses customer then channel then month.",
  confidence:0.98,
  created_at:"2026-10-02T04:30:00.000Z",
  expires_at:null,
  retention:"PROJECT_LIFECYCLE",
  owner:{kind:"EMPLOYEE",id:"maya"},
  project_id:"project-alpha",
  shared_scope:null,
  source_refs:["source://benchmark/project-alpha"],
  evidence_refs:["receipt://benchmark/project-alpha"],
  sensitivity:"INTERNAL",
  provenance:{
    origin:"MISSION",
    created_by:"employee:maya",
    origin_refs:["mission://benchmark-memory-2"],
    parent_record_refs:[],
  },
  promotion:null,
  supersedes:[],
},{employeeIds});

const projectRecord=promoteProjectMemory(privateRecord,{
  targetScope:"PROJECT",
  projectId:"project-alpha",
  approved:true,
  reviewer:"human:owner",
  approvedAt:"2026-10-02T04:31:00.000Z",
  reason:"Approved project knowledge.",
  newRecordId:"mem.maya.bench02",
  employeeIds,
});

const sharedRecord=promoteProjectMemory(projectRecord,{
  targetScope:"APPROVED_SHARED",
  sharedScope:"project-alpha:approved",
  approved:true,
  reviewer:"human:owner",
  approvedAt:"2026-10-02T04:32:00.000Z",
  reason:"Approved exact shared scope.",
  newRecordId:"mem.maya.bench03",
  employeeIds,
});

const all=[privateRecord,projectRecord,sharedRecord];
const cases=[];
function record(case_id,passed,observation){
  cases.push({case_id,passed:Boolean(passed),false_success:!passed,observation});
}

const crossProfile=buildProjectMemoryView({
  records:[privateRecord],
  employeeId:"gugun",
  employeeIds,
  now:"2026-10-02T05:00:00.000Z",
});
record(
  "private-maya-not-visible-to-gugun",
  crossProfile.records.length===0&&crossProfile.denied.some((item)=>item.reason==="CROSS_PROFILE_PRIVATE"),
  crossProfile
);

const projectDenied=buildProjectMemoryView({
  records:all,
  employeeId:"gugun",
  employeeIds,
  now:"2026-10-02T05:00:00.000Z",
});
record(
  "project-memory-requires-project-grant",
  !projectDenied.records.some((item)=>item.record_ref===projectRecord.record_ref)
    && projectDenied.denied.some((item)=>item.record_ref===projectRecord.record_ref&&item.reason==="PROJECT_NOT_AUTHORIZED"),
  projectDenied
);

const projectAllowed=buildProjectMemoryView({
  records:all,
  employeeId:"gugun",
  employeeIds,
  authorizedProjectIds:["project-alpha"],
  now:"2026-10-02T05:00:00.000Z",
});
record(
  "project-grant-does-not-leak-private-or-approved-shared",
  projectAllowed.records.length===1
    && projectAllowed.records[0].record_ref===projectRecord.record_ref
    && !projectAllowed.records.some((item)=>item.record_ref===privateRecord.record_ref)
    && !projectAllowed.records.some((item)=>item.record_ref===sharedRecord.record_ref),
  projectAllowed
);

const sharedAllowed=buildProjectMemoryView({
  records:all,
  employeeId:"gugun",
  employeeIds,
  authorizedSharedScopes:["project-alpha:approved"],
  now:"2026-10-02T05:00:00.000Z",
});
record(
  "shared-scope-is-exact-and-attributable",
  sharedAllowed.records.length===1
    && sharedAllowed.records[0].record_ref===sharedRecord.record_ref
    && sharedAllowed.records[0].promotion.approved_by==="human:owner"
    && sharedAllowed.records[0].promotion.from_record_ref===projectRecord.record_ref,
  sharedAllowed
);

const wrongShared=buildProjectMemoryView({
  records:all,
  employeeId:"gugun",
  employeeIds,
  authorizedSharedScopes:["project-beta:approved"],
  now:"2026-10-02T05:00:00.000Z",
});
record(
  "wrong-shared-scope-does-not-match",
  !wrongShared.records.some((item)=>item.record_ref===sharedRecord.record_ref)
    && wrongShared.denied.some((item)=>item.record_ref===sharedRecord.record_ref&&item.reason==="SHARED_SCOPE_NOT_AUTHORIZED"),
  wrongShared
);

const orphanShared=buildProjectMemoryView({
  records:[sharedRecord],
  employeeId:"gugun",
  employeeIds,
  authorizedSharedScopes:["project-alpha:approved"],
  now:"2026-10-02T05:00:00.000Z",
});
record(
  "shared-record-without-attribution-parent-fails-closed",
  orphanShared.records.length===0&&orphanShared.denied.some((item)=>item.reason==="INVALID_PROMOTION_LINEAGE"),
  orphanShared
);

const summary={
  schema:1,
  benchmark:"deterministic-project-brain-memory-2-isolation",
  deterministic:true,
  live_provider_claim:false,
  cases:cases.length,
  passed:cases.filter((item)=>item.passed).length,
  failed:cases.filter((item)=>!item.passed).length,
  false_successes:cases.filter((item)=>item.false_success).length,
  false_success_rate:cases.length?cases.filter((item)=>item.false_success).length/cases.length:0,
  results:cases,
};

console.log(JSON.stringify(summary,null,2));
if(process.argv.includes("--check")&&summary.failed>0) process.exitCode=1;
