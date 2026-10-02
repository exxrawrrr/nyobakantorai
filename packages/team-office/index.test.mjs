import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  normalizeTeamOfficePolicy,
  createHumanUser,
  createWorkspace,
  createProjectMembership,
  authorizeProjectAction,
  createApprovalDelegation,
  createDelegatedApprovalDecision,
  authorizeDelegatedApproval,
  createWorkspaceConnectorBinding,
  authorizeWorkspaceConnectorUse,
  assessWorkspaceBudgetAdmission,
  buildTeamProjectMemoryView,
  createSharedResourceBinding,
  authorizeSharedResourceAccess,
  appendSharedAuditEvent,
  validateSharedAuditLog,
} from "./index.mjs";
import { createApprovalRequest } from "../scheduler-approval-center/index.mjs";
import {
  createConnectorConnection,
  transitionConnectorConnection,
  createConnectorGrant,
  authorizeConnectorAction,
} from "../connector-center/index.mjs";
import { createProjectMemoryRecord, promoteProjectMemory } from "../memory-learning/project-brain.mjs";

const root=new URL("../../",import.meta.url);
const policy=JSON.parse(await readFile(new URL("config/v0.9-team-office-policy.json",root),"utf8"));
const connectorRegistry=JSON.parse(await readFile(new URL("config/connector-registry.json",root),"utf8"));

const users={
  owner:createHumanUser({schema:1,user_id:"user-owner",display_name:"Owner",status:"ACTIVE"}),
  alice:createHumanUser({schema:1,user_id:"user-alice",display_name:"Alice",status:"ACTIVE"}),
  bob:createHumanUser({schema:1,user_id:"user-bob",display_name:"Bob",status:"ACTIVE"}),
  eve:createHumanUser({schema:1,user_id:"user-eve",display_name:"Eve",status:"ACTIVE"}),
};
const workspace=createWorkspace({schema:1,workspace_id:"ws-main",name:"Main Workspace",status:"ACTIVE"});
const memberships=[
  createProjectMembership({schema:1,membership_id:"m-owner-alpha",workspace_id:"ws-main",project_id:"alpha",user_id:"user-owner",role:"OWNER",status:"ACTIVE",joined_at:"2026-10-02T12:00:00.000Z"}),
  createProjectMembership({schema:1,membership_id:"m-alice-alpha",workspace_id:"ws-main",project_id:"alpha",user_id:"user-alice",role:"APPROVER",status:"ACTIVE",joined_at:"2026-10-02T12:00:00.000Z"}),
  createProjectMembership({schema:1,membership_id:"m-bob-alpha",workspace_id:"ws-main",project_id:"alpha",user_id:"user-bob",role:"MEMBER",status:"ACTIVE",joined_at:"2026-10-02T12:00:00.000Z"}),
  createProjectMembership({schema:1,membership_id:"m-eve-beta",workspace_id:"ws-main",project_id:"beta",user_id:"user-eve",role:"MEMBER",status:"ACTIVE",joined_at:"2026-10-02T12:00:00.000Z"}),
];

function auth(userId,projectId,permission){
  return authorizeProjectAction({policy,users:Object.values(users),workspace,memberships,user_id:userId,project_id:projectId,permission});
}

function validConnectorRoute(){
  const resource={resource_type:"google_ads_customer",resource_id:"customers/1234567890"};
  const initial=createConnectorConnection({
    registry:connectorRegistry,connectionId:"conn-google-ads-team-001",connectorId:"google-ads-readonly",
  });
  const connection=transitionConnectorConnection(initial,"CONNECT",{
    registry:connectorRegistry,at:"2026-10-02T12:00:00.000Z",
    evidenceRef:"connector-evidence:team",
    credentialRef:"connector-secret://google-ads/team",
    expiresAt:"2026-10-03T12:00:00.000Z",
  });
  const grant=createConnectorGrant({
    schema:1,grant_id:"connector-grant-team-001",employee_id:"gugun",
    connector_id:"google-ads-readonly",capability_id:"ads.google.read",access_modes:["READ"],
    actions:["list-campaigns"],resources:[resource],
    issued_at:"2026-10-02T11:59:00.000Z",expires_at:"2026-10-03T11:59:00.000Z",
    evidence_ref:"connector-grant-evidence:team",
  },{registry:connectorRegistry});
  return authorizeConnectorAction({
    registry:connectorRegistry,connections:[connection],grants:[grant],
    employeeId:"gugun",connectorId:"google-ads-readonly",capabilityId:"ads.google.read",
    accessMode:"READ",action:"list-campaigns",resource,now:"2026-10-02T12:10:00.000Z",
  });
}

test("canonical team policy is bounded, role-owned, and content-addressed",()=>{
  const p=normalizeTeamOfficePolicy(policy);
  assert.equal(p.roles.OWNER.includes("project.manage"),true);
  assert.equal(p.roles.APPROVER.includes("approval.decide"),true);
  assert.equal(p.roles.MEMBER.includes("approval.decide"),false);
  assert.equal(p.roles.VIEWER.includes("project.execute"),false);
  assert.match(p.policy_ref,/^team-office-policy:sha256:[a-f0-9]{64}$/);
});

test("human identity, workspace and membership are content-addressed and human users stay distinct from employees",()=>{
  assert.match(users.alice.user_ref,/^human-user:sha256:[a-f0-9]{64}$/);
  assert.match(workspace.workspace_ref,/^team-workspace:sha256:[a-f0-9]{64}$/);
  assert.match(memberships[1].membership_ref,/^project-membership:sha256:[a-f0-9]{64}$/);
  assert.equal(users.alice.user_id,"user-alice");
  assert.throws(()=>createHumanUser({schema:1,user_id:"siti",display_name:"Siti",status:"ACTIVE"}),/human user id/i);
});

test("RBAC derives exact project authority and blocks horizontal project bleed",()=>{
  assert.equal(auth("user-bob","alpha","project.execute").allowed,true);
  assert.equal(auth("user-bob","alpha","approval.decide").allowed,false);
  assert.equal(auth("user-eve","alpha","project.read").allowed,false);
  assert.equal(auth("user-alice","alpha","approval.decide").allowed,true);
  assert.equal(auth("user-alice","beta","approval.decide").allowed,false);
});

test("stale, forged, cross-workspace, and role-spoofed membership cannot authorize",()=>{
  const forged={...memberships[2],role:"OWNER"};
  assert.throws(()=>authorizeProjectAction({policy,users:Object.values(users),workspace,memberships:[forged],user_id:"user-bob",project_id:"alpha",permission:"project.manage"}),/checksum/i);
  const inactive=createProjectMembership({schema:1,membership_id:"m-bob-old",workspace_id:"ws-main",project_id:"alpha",user_id:"user-bob",role:"MEMBER",status:"SUSPENDED",joined_at:"2026-09-01T00:00:00.000Z"});
  const result=authorizeProjectAction({policy,users:Object.values(users),workspace,memberships:[inactive],user_id:"user-bob",project_id:"alpha",permission:"project.read"});
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"NO_ACTIVE_PROJECT_MEMBERSHIP");
});

test("approval delegation is exact, bounded, time-limited and cannot widen requested scope",()=>{
  const request=createApprovalRequest({
    schema:1,approval_id:"approval-team-1",target:{type:"OUTREACH_DRAFT",id:"draft-1"},
    risk_class:"EXTERNAL_WRITE",budget:{hard_limit_amount:null,currency:null},
    reason:"Approve one draft.",evidence_refs:["evidence:draft-1"],preview:"Draft text",
    scope:{actions:["outreach.send"],resources:["draft:1"]},
    requested_at:"2026-10-02T12:00:00.000Z",expires_at:"2026-10-02T13:00:00.000Z",
  });
  const delegation=createApprovalDelegation({
    schema:1,delegation_id:"deleg-1",workspace_id:"ws-main",project_id:"alpha",
    delegator_user_id:"user-owner",delegate_user_id:"user-alice",approval_ref:request.approval_ref,
    actions:["outreach.send"],resources:["draft:1"],
    delegated_at:"2026-10-02T12:05:00.000Z",expires_at:"2026-10-02T12:45:00.000Z",
    evidence_ref:"evidence:deleg-1",
  },{policy,users:Object.values(users),workspace,memberships,request});
  const decision=createDelegatedApprovalDecision(request,delegation,{
    actor_user_id:"user-alice",decision:"APPROVED",decided_at:"2026-10-02T12:10:00.000Z",
    evidence_ref:"evidence:human-click",
  },{policy,users:Object.values(users),workspace,memberships});
  assert.equal(authorizeDelegatedApproval(request,delegation,decision,{action:"outreach.send",resource:"draft:1",at:"2026-10-02T12:20:00.000Z"}).allowed,true);
  assert.equal(authorizeDelegatedApproval(request,delegation,decision,{action:"outreach.send",resource:"draft:2",at:"2026-10-02T12:20:00.000Z"}).allowed,false);
  assert.throws(()=>createApprovalDelegation({
    schema:1,delegation_id:"deleg-bad",workspace_id:"ws-main",project_id:"alpha",
    delegator_user_id:"user-owner",delegate_user_id:"user-alice",approval_ref:request.approval_ref,
    actions:["crm.write"],resources:["*"],delegated_at:"2026-10-02T12:05:00.000Z",
    expires_at:"2026-10-02T12:45:00.000Z",evidence_ref:"evidence:bad",
  },{policy,users:Object.values(users),workspace,memberships,request}),/scope|wildcard/i);
});

test("workspace connector binding requires RBAC plus exact workspace/project and cryptographically valid route",()=>{
  const route=validConnectorRoute();
  const binding=createWorkspaceConnectorBinding({
    schema:1,binding_id:"conn-bind-1",workspace_id:"ws-main",project_id:"alpha",
    connector_id:"google-ads-readonly",connection_ref:route.connection.connection_ref,
    created_at:"2026-10-02T12:00:00.000Z",evidence_ref:"evidence:connector-binding",
  });
  const allowed=authorizeWorkspaceConnectorUse({policy,users:Object.values(users),workspace,memberships,binding,route,user_id:"user-bob",project_id:"alpha"});
  assert.equal(allowed.allowed,true);
  assert.equal(authorizeWorkspaceConnectorUse({policy,users:Object.values(users),workspace,memberships,binding,route,user_id:"user-eve",project_id:"beta"}).allowed,false);
  const forged={...route,action:"tampered-action"};
  const forgedDecision=authorizeWorkspaceConnectorUse({policy,users:Object.values(users),workspace,memberships,binding,route:forged,user_id:"user-bob",project_id:"alpha"});
  assert.equal(forgedDecision.allowed,false);
  assert.equal(forgedDecision.reason,"INVALID_CONNECTOR_ROUTE");
});

test("workspace/project budget admission fails closed on cross-scope, unknown spend and hard ceilings",()=>{
  const budgets={
    workspace:{hard_limit_amount:100,currency:"USD"},
    project:{hard_limit_amount:25,currency:"USD"},
  };
  const ledger=[
    {workspace_id:"ws-main",project_id:"alpha",amount:20,currency:"USD",status:"KNOWN"},
    {workspace_id:"ws-main",project_id:"beta",amount:30,currency:"USD",status:"KNOWN"},
  ];
  const ok=assessWorkspaceBudgetAdmission({policy,users:Object.values(users),workspace,memberships,user_id:"user-bob",project_id:"alpha",budgets,ledger,estimate:{amount:4,currency:"USD"}});
  assert.equal(ok.allowed,true);
  const over=assessWorkspaceBudgetAdmission({policy,users:Object.values(users),workspace,memberships,user_id:"user-bob",project_id:"alpha",budgets,ledger,estimate:{amount:6,currency:"USD"}});
  assert.equal(over.allowed,false);
  assert.ok(over.reason_codes.includes("PROJECT_BUDGET_EXCEEDED"));
  const unknown=assessWorkspaceBudgetAdmission({policy,users:Object.values(users),workspace,memberships,user_id:"user-bob",project_id:"alpha",budgets,ledger:[...ledger,{workspace_id:"ws-main",project_id:"alpha",amount:null,currency:"USD",status:"UNKNOWN"}],estimate:{amount:1,currency:"USD"}});
  assert.equal(unknown.allowed,false);
  assert.ok(unknown.reason_codes.includes("UNKNOWN_SPEND"));
});

test("Project Brain visibility is derived from memberships and caller cannot inject another project",()=>{
  const privateRecord=createProjectMemoryRecord({
    schema:1,record_id:"mem.siti.private1",scope:"PRIVATE",knowledge_type:"FACT",
    content:"Verified alpha fact.",confidence:0.9,created_at:"2026-10-02T12:00:00.000Z",
    expires_at:null,retention:"PROJECT_LIFECYCLE",owner:{kind:"EMPLOYEE",id:"siti"},
    project_id:"alpha",shared_scope:null,source_refs:["source://alpha"],
    evidence_refs:["evidence://alpha"],sensitivity:"INTERNAL",
    provenance:{origin:"MISSION",created_by:"employee:siti",origin_refs:["mission://alpha"],parent_record_refs:[]},
    promotion:null,supersedes:[],
  },{employeeIds:["siti"]});
  const projectRecord=promoteProjectMemory(privateRecord,{
    targetScope:"PROJECT",projectId:"alpha",approved:true,reviewer:"owner",
    approvedAt:"2026-10-02T12:01:00.000Z",reason:"Project knowledge",newRecordId:"mem-project-1",
  },{employeeIds:["siti"]});
  const view=buildTeamProjectMemoryView({
    policy,users:Object.values(users),workspace,memberships,user_id:"user-bob",
    records:[privateRecord,projectRecord],employee_id:"siti",
  },{employeeIds:["siti"]});
  assert.equal(view.visible.some(x=>x.record_ref===projectRecord.record_ref),true);
  assert.equal(view.visible.some(x=>x.record_ref===privateRecord.record_ref),false);
  assert.equal(view.denied.some(x=>x.record_ref===privateRecord.record_ref&&x.reason==="PRIVATE_EMPLOYEE_MEMORY_NOT_TEAM_VISIBLE"),true);
  const eveView=buildTeamProjectMemoryView({
    policy,users:Object.values(users),workspace,memberships,user_id:"user-eve",
    records:[privateRecord,projectRecord],employee_id:"siti",
  },{employeeIds:["siti"]});
  assert.equal(eveView.visible.some(x=>x.record_ref===projectRecord.record_ref),false);
});

test("shared artifact/evidence bindings prevent IDOR and cross-project reads",()=>{
  const binding=createSharedResourceBinding({
    schema:1,binding_id:"artifact-bind-1",workspace_id:"ws-main",project_id:"alpha",
    resource_kind:"ARTIFACT",resource_ref:"artifact:report:v1:sha256:"+"d".repeat(64),
    required_permission:"artifact.read",created_at:"2026-10-02T12:00:00.000Z",
  });
  assert.equal(authorizeSharedResourceAccess({policy,users:Object.values(users),workspace,memberships,binding,user_id:"user-bob",project_id:"alpha",permission:"artifact.read"}).allowed,true);
  assert.equal(authorizeSharedResourceAccess({policy,users:Object.values(users),workspace,memberships,binding,user_id:"user-eve",project_id:"beta",permission:"artifact.read"}).allowed,false);
  assert.equal(authorizeSharedResourceAccess({policy,users:Object.values(users),workspace,memberships,binding,user_id:"user-bob",project_id:"alpha",permission:"evidence.read"}).allowed,false);
});

test("shared audit is append-only, hash-chained, workspace/project bound, and tamper evident",()=>{
  let log=[];
  log=appendSharedAuditEvent(log,{schema:1,at:"2026-10-02T12:00:00.000Z",workspace_id:"ws-main",project_id:"alpha",actor_user_id:"user-bob",action:"project.execute",resource_ref:"mission:1",outcome:"ALLOWED",evidence_refs:["evidence:1"]});
  log=appendSharedAuditEvent(log,{schema:1,at:"2026-10-02T12:01:00.000Z",workspace_id:"ws-main",project_id:"alpha",actor_user_id:"user-alice",action:"approval.decide",resource_ref:"approval:1",outcome:"ALLOWED",evidence_refs:["evidence:2"]});
  assert.equal(validateSharedAuditLog(log),true);
  assert.match(log[1].event_ref,/^team-audit-event:sha256:[a-f0-9]{64}$/);
  assert.throws(()=>validateSharedAuditLog([{...log[0],outcome:"DENIED"},log[1]]),/digest|checksum/i);
  assert.throws(()=>validateSharedAuditLog([log[1],log[0]]),/sequence|chain/i);
});


test("human/workspace/membership/audit schemas preserve the public identity and role catalogs",async()=>{
  const human=JSON.parse(await readFile(new URL("../../schemas/human-user.schema.json",import.meta.url),"utf8"));
  const ws=JSON.parse(await readFile(new URL("../../schemas/team-workspace.schema.json",import.meta.url),"utf8"));
  const membership=JSON.parse(await readFile(new URL("../../schemas/project-membership.schema.json",import.meta.url),"utf8"));
  const audit=JSON.parse(await readFile(new URL("../../schemas/team-audit-event.schema.json",import.meta.url),"utf8"));
  assert.deepEqual(human.properties.status.enum,["ACTIVE","SUSPENDED","REVOKED"]);
  assert.deepEqual(ws.properties.status.enum,["ACTIVE","SUSPENDED","ARCHIVED"]);
  assert.deepEqual(membership.properties.role.enum,["OWNER","ADMIN","APPROVER","MEMBER","VIEWER"]);
  assert.deepEqual(audit.properties.outcome.enum,["ALLOWED","DENIED","RECORDED"]);
});
