import { createHash } from "node:crypto";

import { createApprovalRequest } from "../scheduler-approval-center/index.mjs";
import { buildProjectMemoryView } from "../memory-learning/project-brain.mjs";

export const TEAM_OFFICE_API=1;
export const HUMAN_USER_STATUSES=Object.freeze(["ACTIVE","SUSPENDED","REVOKED"]);
export const WORKSPACE_STATUSES=Object.freeze(["ACTIVE","SUSPENDED","ARCHIVED"]);
export const MEMBERSHIP_STATUSES=Object.freeze(["ACTIVE","SUSPENDED","REVOKED"]);
export const TEAM_ROLES=Object.freeze(["OWNER","ADMIN","APPROVER","MEMBER","VIEWER"]);

const clean=(value,max=1000)=>String(value??"").trim().slice(0,max);
const ROLE_SET=new Set(TEAM_ROLES);
const USER_STATUS_SET=new Set(HUMAN_USER_STATUSES);
const WORKSPACE_STATUS_SET=new Set(WORKSPACE_STATUSES);
const MEMBERSHIP_STATUS_SET=new Set(MEMBERSHIP_STATUSES);

function assert(condition,message){if(!condition)throw new Error(message);}
function validTime(value){return typeof value==="string"&&value.trim()&&!Number.isNaN(Date.parse(value));}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,stable(value[k])]));
  }
  if(typeof value==="number"&&Object.is(value,-0))return 0;
  return value;
}
function digest(prefix,payload){
  return prefix+":sha256:"+createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}
function sortedUnique(values,max=500){
  return Object.freeze([...new Set((Array.isArray(values)?values:[]).map(v=>clean(v,max)).filter(Boolean))].sort());
}
function immutable(value){return Object.freeze(structuredClone(value));}
function noWildcard(values,label){
  assert(!values.some(v=>v==="*"||v.includes("*")),label+" wildcard scope is forbidden.");
}
function money(value,label){
  const n=Number(value);
  assert(Number.isFinite(n)&&n>=0,label+" must be a non-negative finite number.");
  return Math.round((n+Number.EPSILON)*1e6)/1e6;
}
function normalizePermission(value){
  const permission=clean(value,160).toLowerCase();
  assert(/^[a-z][a-z0-9.-]{1,159}$/.test(permission),"Permission id is invalid.");
  return permission;
}
function canonicalApprovalRequest(request){
  const rebuilt=createApprovalRequest({...request,status:undefined});
  assert(rebuilt.approval_ref===request.approval_ref,"Approval request checksum mismatch.");
  return rebuilt;
}

export function normalizeTeamOfficePolicy(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Team Office policy must be an object.");
  assert(input.schema===TEAM_OFFICE_API,"Team Office policy schema must be 1.");
  const id=clean(input.id,120).toLowerCase();
  assert(/^[a-z][a-z0-9-]{1,119}$/.test(id),"Team Office policy id must be a lowercase slug.");
  const roles={};
  for(const role of TEAM_ROLES){
    const list=sortedUnique(input.roles?.[role],160).map(normalizePermission);
    assert(list.length>0,"Team Office role "+role+" must have permissions.");
    roles[role]=Object.freeze([...list]);
  }
  const delegation=input.delegation||{};
  const maxDuration=Number(delegation.max_duration_minutes);
  assert(Number.isInteger(maxDuration)&&maxDuration>=1&&maxDuration<=10_080,"Delegation max duration must be 1..10080 minutes.");
  assert(delegation.wildcards_allowed===false,"Delegation wildcards must remain disabled.");
  assert(delegation.cross_project_allowed===false,"Cross-project delegation must remain disabled.");
  assert(delegation.cross_workspace_allowed===false,"Cross-workspace delegation must remain disabled.");
  const resources=input.resource_access||{};
  assert(resources.wildcards_allowed===false,"Shared-resource wildcards must remain disabled.");
  const audit=input.audit||{};
  assert(audit.hash_chain_required===true&&audit.actor_required===true&&audit.scope_required===true,"Shared audit must require chain, actor, and scope.");
  const body={
    schema:1,id,roles,
    delegation:Object.freeze({
      max_duration_minutes:maxDuration,
      wildcards_allowed:false,cross_project_allowed:false,cross_workspace_allowed:false,
    }),
    resource_access:Object.freeze({wildcards_allowed:false}),
    audit:Object.freeze({hash_chain_required:true,actor_required:true,scope_required:true}),
  };
  return Object.freeze({...body,policy_ref:digest("team-office-policy",body)});
}

function userBody(input){
  return Object.freeze({
    schema:1,user_id:input.user_id,display_name:input.display_name,status:input.status,
  });
}
export function createHumanUser(input={}){
  assert(input.schema===1,"Human user schema must be 1.");
  const userId=clean(input.user_id,80).toLowerCase();
  const displayName=clean(input.display_name,160);
  const status=clean(input.status||"ACTIVE",40).toUpperCase();
  assert(/^user-[a-z0-9][a-z0-9-]{1,74}$/.test(userId),"Human user id must start with user- and cannot impersonate an employee id.");
  assert(displayName,"Human user display_name is required.");
  assert(USER_STATUS_SET.has(status),"Human user status is invalid.");
  const body=userBody({user_id:userId,display_name:displayName,status});
  return Object.freeze({...body,user_ref:digest("human-user",body)});
}
function normalizeHumanUser(input={}){
  const rebuilt=createHumanUser(input);
  assert(rebuilt.user_ref===input.user_ref,"Human user checksum mismatch.");
  return rebuilt;
}

function workspaceBody(input){
  return Object.freeze({schema:1,workspace_id:input.workspace_id,name:input.name,status:input.status});
}
export function createWorkspace(input={}){
  assert(input.schema===1,"Workspace schema must be 1.");
  const id=clean(input.workspace_id,100).toLowerCase();
  const name=clean(input.name,200);
  const status=clean(input.status||"ACTIVE",40).toUpperCase();
  assert(/^ws-[a-z0-9][a-z0-9-]{1,94}$/.test(id),"Workspace id must start with ws-.");
  assert(name,"Workspace name is required.");
  assert(WORKSPACE_STATUS_SET.has(status),"Workspace status is invalid.");
  const body=workspaceBody({workspace_id:id,name,status});
  return Object.freeze({...body,workspace_ref:digest("team-workspace",body)});
}
function normalizeWorkspace(input={}){
  const rebuilt=createWorkspace(input);
  assert(rebuilt.workspace_ref===input.workspace_ref,"Workspace checksum mismatch.");
  return rebuilt;
}

function membershipBody(input){
  return Object.freeze({
    schema:1,membership_id:input.membership_id,workspace_id:input.workspace_id,project_id:input.project_id,
    user_id:input.user_id,role:input.role,status:input.status,joined_at:input.joined_at,
  });
}
export function createProjectMembership(input={}){
  assert(input.schema===1,"Project membership schema must be 1.");
  const id=clean(input.membership_id,120).toLowerCase();
  const workspaceId=clean(input.workspace_id,100).toLowerCase();
  const projectId=clean(input.project_id,160);
  const userId=clean(input.user_id,80).toLowerCase();
  const role=clean(input.role,40).toUpperCase();
  const status=clean(input.status||"ACTIVE",40).toUpperCase();
  const joined=clean(input.joined_at,80);
  assert(/^[a-z0-9][a-z0-9._-]{2,119}$/.test(id),"Membership id is invalid.");
  assert(/^ws-[a-z0-9][a-z0-9-]{1,94}$/.test(workspaceId),"Membership workspace_id is invalid.");
  assert(projectId&&projectId!=="*"&&!projectId.includes("*"),"Membership project_id must be exact.");
  assert(/^user-[a-z0-9][a-z0-9-]{1,74}$/.test(userId),"Membership user_id is invalid.");
  assert(ROLE_SET.has(role),"Membership role is invalid.");
  assert(MEMBERSHIP_STATUS_SET.has(status),"Membership status is invalid.");
  assert(validTime(joined),"Membership joined_at is invalid.");
  const body=membershipBody({
    membership_id:id,workspace_id:workspaceId,project_id:projectId,user_id:userId,role,status,
    joined_at:new Date(joined).toISOString(),
  });
  return Object.freeze({...body,membership_ref:digest("project-membership",body)});
}
function normalizeMembership(input={}){
  const rebuilt=createProjectMembership(input);
  assert(rebuilt.membership_ref===input.membership_ref,"Project membership checksum mismatch.");
  return rebuilt;
}

function normalizeActors({users=[],workspace,memberships=[]}={}){
  const ws=normalizeWorkspace(workspace);
  const userList=(Array.isArray(users)?users:[]).map(normalizeHumanUser);
  const ids=userList.map(x=>x.user_id);
  assert(new Set(ids).size===ids.length,"Human user ids must be unique.");
  const memberList=(Array.isArray(memberships)?memberships:[]).map(normalizeMembership);
  return {workspace:ws,users:userList,memberships:memberList};
}

export function authorizeProjectAction({
  policy:policyInput,users=[],workspace,memberships=[],user_id,project_id,permission,
}={}){
  const policy=normalizeTeamOfficePolicy(policyInput);
  const ctx=normalizeActors({users,workspace,memberships});
  const userId=clean(user_id,80).toLowerCase();
  const projectId=clean(project_id,160);
  const perm=normalizePermission(permission);
  const user=ctx.users.find(x=>x.user_id===userId);
  let allowed=false,reason="USER_NOT_FOUND",role=null,membershipRef=null;
  if(user){
    if(user.status!=="ACTIVE")reason="USER_NOT_ACTIVE";
    else if(ctx.workspace.status!=="ACTIVE")reason="WORKSPACE_NOT_ACTIVE";
    else{
      const membership=ctx.memberships.find(x=>x.workspace_id===ctx.workspace.workspace_id&&x.project_id===projectId&&x.user_id===userId&&x.status==="ACTIVE");
      if(!membership)reason="NO_ACTIVE_PROJECT_MEMBERSHIP";
      else{
        role=membership.role;
        membershipRef=membership.membership_ref;
        if(!policy.roles[role].includes(perm))reason="ROLE_PERMISSION_DENIED";
        else{allowed=true;reason="RBAC_ALLOWED";}
      }
    }
  }
  const body={schema:1,policy_ref:policy.policy_ref,workspace_id:ctx.workspace.workspace_id,project_id:projectId,user_id:userId,permission:perm,role,membership_ref:membershipRef,allowed,reason};
  return Object.freeze({...body,authorization_ref:digest("team-authorization",body)});
}

function requireAllowed(result,message){
  assert(result.allowed===true,message+" ("+result.reason+")");
  return result;
}

function delegationBody(input){
  return Object.freeze({
    schema:1,delegation_id:input.delegation_id,workspace_id:input.workspace_id,project_id:input.project_id,
    delegator_user_id:input.delegator_user_id,delegate_user_id:input.delegate_user_id,approval_ref:input.approval_ref,
    actions:input.actions,resources:input.resources,delegated_at:input.delegated_at,expires_at:input.expires_at,
    evidence_ref:input.evidence_ref,
  });
}
function normalizeDelegation(input={}){
  assert(input?.schema===1,"Approval delegation schema must be 1.");
  const body=delegationBody({
    delegation_id:clean(input.delegation_id,160),
    workspace_id:clean(input.workspace_id,100).toLowerCase(),
    project_id:clean(input.project_id,160),
    delegator_user_id:clean(input.delegator_user_id,80).toLowerCase(),
    delegate_user_id:clean(input.delegate_user_id,80).toLowerCase(),
    approval_ref:clean(input.approval_ref,1000),
    actions:sortedUnique(input.actions,160),
    resources:sortedUnique(input.resources,500),
    delegated_at:validTime(input.delegated_at)?new Date(input.delegated_at).toISOString():"",
    expires_at:validTime(input.expires_at)?new Date(input.expires_at).toISOString():"",
    evidence_ref:clean(input.evidence_ref,1000),
  });
  assert(body.delegation_id&&body.project_id&&body.approval_ref,"Approval delegation identity fields are required.");
  assert(body.delegator_user_id!==body.delegate_user_id,"Approval delegation requires distinct delegator and delegate.");
  assert(body.actions.length>0&&body.resources.length>0,"Approval delegation scope is required.");
  noWildcard(body.actions,"Approval delegation");
  noWildcard(body.resources,"Approval delegation");
  assert(validTime(body.delegated_at)&&validTime(body.expires_at)&&Date.parse(body.expires_at)>Date.parse(body.delegated_at),"Approval delegation timestamps are invalid.");
  assert(/^[a-z][a-z0-9+.-]*:/i.test(body.evidence_ref),"Approval delegation evidence_ref is required.");
  const expected=digest("approval-delegation",body);
  assert(input.delegation_ref===expected,"Approval delegation checksum mismatch.");
  return Object.freeze({...body,delegation_ref:expected});
}
export function createApprovalDelegation(input={},{
  policy:policyInput,users=[],workspace,memberships=[],request,
}={}){
  const policy=normalizeTeamOfficePolicy(policyInput);
  const req=canonicalApprovalRequest(request);
  const delegator=authorizeProjectAction({policy,users,workspace,memberships,user_id:input.delegator_user_id,project_id:input.project_id,permission:"approval.delegate"});
  const delegate=authorizeProjectAction({policy,users,workspace,memberships,user_id:input.delegate_user_id,project_id:input.project_id,permission:"approval.decide"});
  requireAllowed(delegator,"Delegator lacks approval.delegate");
  requireAllowed(delegate,"Delegate lacks approval.decide");
  const actions=sortedUnique(input.actions,160),resources=sortedUnique(input.resources,500);
  noWildcard(actions,"Approval delegation"); noWildcard(resources,"Approval delegation");
  assert(actions.every(x=>req.scope.actions.includes(x))&&resources.every(x=>req.scope.resources.includes(x)),"Approval delegation scope cannot exceed approval request scope.");
  assert(clean(input.workspace_id,100).toLowerCase()===workspace.workspace_id,"Approval delegation workspace mismatch.");
  assert(clean(input.approval_ref,1000)===req.approval_ref,"Approval delegation approval_ref mismatch.");
  assert(validTime(input.delegated_at)&&validTime(input.expires_at),"Approval delegation timestamps are required.");
  const delegatedAt=new Date(input.delegated_at).toISOString(),expiresAt=new Date(input.expires_at).toISOString();
  assert(Date.parse(delegatedAt)>=Date.parse(req.requested_at),"Approval delegation cannot predate request.");
  assert(Date.parse(expiresAt)<=Date.parse(req.expires_at),"Approval delegation cannot outlive approval request.");
  assert(Date.parse(expiresAt)-Date.parse(delegatedAt)<=policy.delegation.max_duration_minutes*60_000,"Approval delegation exceeds maximum duration.");
  const body=delegationBody({
    delegation_id:clean(input.delegation_id,160),workspace_id:workspace.workspace_id,project_id:clean(input.project_id,160),
    delegator_user_id:clean(input.delegator_user_id,80).toLowerCase(),delegate_user_id:clean(input.delegate_user_id,80).toLowerCase(),
    approval_ref:req.approval_ref,actions,resources,delegated_at:delegatedAt,expires_at:expiresAt,evidence_ref:clean(input.evidence_ref,1000),
  });
  assert(body.delegation_id&&body.evidence_ref,"Approval delegation id and evidence_ref are required.");
  return Object.freeze({...body,delegation_ref:digest("approval-delegation",body)});
}

function delegatedDecisionBody(input){
  return Object.freeze({
    schema:1,approval_ref:input.approval_ref,delegation_ref:input.delegation_ref,actor_user_id:input.actor_user_id,
    decision:input.decision,decided_at:input.decided_at,actions:input.actions,resources:input.resources,evidence_ref:input.evidence_ref,
  });
}
function normalizeDelegatedDecision(input={}){
  const body=delegatedDecisionBody({
    approval_ref:clean(input.approval_ref,1000),delegation_ref:clean(input.delegation_ref,1000),
    actor_user_id:clean(input.actor_user_id,80).toLowerCase(),decision:clean(input.decision,20).toUpperCase(),
    decided_at:validTime(input.decided_at)?new Date(input.decided_at).toISOString():"",
    actions:sortedUnique(input.actions,160),resources:sortedUnique(input.resources,500),evidence_ref:clean(input.evidence_ref,1000),
  });
  assert(["APPROVED","REJECTED"].includes(body.decision),"Delegated approval decision is invalid.");
  assert(validTime(body.decided_at),"Delegated approval decision timestamp is invalid.");
  assert(/^[a-z][a-z0-9+.-]*:/i.test(body.evidence_ref),"Delegated approval decision evidence_ref is required.");
  const expected=digest("delegated-approval-decision",body);
  assert(input.decision_ref===expected,"Delegated approval decision checksum mismatch.");
  return Object.freeze({...body,decision_ref:expected});
}
export function createDelegatedApprovalDecision(request,delegationInput,decision={},{
  policy:policyInput,users=[],workspace,memberships=[],
}={}){
  const req=canonicalApprovalRequest(request);
  const delegation=normalizeDelegation(delegationInput);
  assert(delegation.approval_ref===req.approval_ref,"Delegation does not match approval request.");
  const actor=clean(decision.actor_user_id,80).toLowerCase();
  assert(actor===delegation.delegate_user_id,"Only delegated user may decide delegated approval.");
  requireAllowed(authorizeProjectAction({policy:policyInput,users,workspace,memberships,user_id:actor,project_id:delegation.project_id,permission:"approval.decide"}),"Delegate no longer has approval.decide");
  const at=clean(decision.decided_at,80);
  assert(validTime(at)&&Date.parse(at)>=Date.parse(delegation.delegated_at)&&Date.parse(at)<Date.parse(delegation.expires_at),"Delegated approval decision is outside delegation validity.");
  const d=clean(decision.decision,20).toUpperCase();
  assert(["APPROVED","REJECTED"].includes(d),"Delegated approval decision must be APPROVED or REJECTED.");
  const body=delegatedDecisionBody({
    approval_ref:req.approval_ref,delegation_ref:delegation.delegation_ref,actor_user_id:actor,decision:d,
    decided_at:new Date(at).toISOString(),actions:delegation.actions,resources:delegation.resources,evidence_ref:clean(decision.evidence_ref,1000),
  });
  assert(body.evidence_ref,"Delegated approval decision evidence_ref is required.");
  return Object.freeze({...body,decision_ref:digest("delegated-approval-decision",body)});
}
export function authorizeDelegatedApproval(request,delegationInput,decisionInput,{action,resource,at}={}){
  const req=canonicalApprovalRequest(request);
  const delegation=normalizeDelegation(delegationInput);
  const decision=normalizeDelegatedDecision(decisionInput);
  const a=clean(action,160),r=clean(resource,500);
  assert(validTime(at),"Delegated approval authorization time is invalid.");
  if(delegation.approval_ref!==req.approval_ref||decision.approval_ref!==req.approval_ref||decision.delegation_ref!==delegation.delegation_ref) return Object.freeze({allowed:false,reason:"APPROVAL_BINDING_MISMATCH"});
  if(decision.decision==="REJECTED")return Object.freeze({allowed:false,reason:"APPROVAL_REJECTED"});
  if(Date.parse(at)>=Date.parse(delegation.expires_at))return Object.freeze({allowed:false,reason:"DELEGATION_EXPIRED"});
  if(!delegation.actions.includes(a)||!delegation.resources.includes(r))return Object.freeze({allowed:false,reason:"APPROVAL_SCOPE_MISMATCH"});
  return Object.freeze({allowed:true,reason:"DELEGATED_APPROVAL_VALID",approval_ref:req.approval_ref,delegation_ref:delegation.delegation_ref,decision_ref:decision.decision_ref});
}

function connectorBindingBody(input){
  return Object.freeze({
    schema:1,binding_id:input.binding_id,workspace_id:input.workspace_id,project_id:input.project_id,
    connector_id:input.connector_id,connection_ref:input.connection_ref,created_at:input.created_at,evidence_ref:input.evidence_ref,
  });
}
export function createWorkspaceConnectorBinding(input={}){
  const body=connectorBindingBody({
    binding_id:clean(input.binding_id,160),workspace_id:clean(input.workspace_id,100).toLowerCase(),project_id:clean(input.project_id,160),
    connector_id:clean(input.connector_id,120).toLowerCase(),connection_ref:clean(input.connection_ref,1000),
    created_at:validTime(input.created_at)?new Date(input.created_at).toISOString():"",evidence_ref:clean(input.evidence_ref,1000),
  });
  assert(body.binding_id&&body.workspace_id&&body.project_id&&body.connector_id&&body.connection_ref,"Workspace connector binding fields are required.");
  noWildcard([body.project_id,body.connection_ref],"Workspace connector binding");
  assert(validTime(body.created_at),"Workspace connector binding created_at is invalid.");
  assert(body.evidence_ref,"Workspace connector binding evidence_ref is required.");
  return Object.freeze({...body,binding_ref:digest("workspace-connector-binding",body)});
}
function normalizeConnectorBinding(input={}){
  const rebuilt=createWorkspaceConnectorBinding(input);
  assert(rebuilt.binding_ref===input.binding_ref,"Workspace connector binding checksum mismatch.");
  return rebuilt;
}
export function authorizeWorkspaceConnectorUse({
  policy,users=[],workspace,memberships=[],binding:bindingInput,route={},user_id,project_id,
}={}){
  const binding=normalizeConnectorBinding(bindingInput);
  const auth=authorizeProjectAction({policy,users,workspace,memberships,user_id,project_id,permission:"connector.use"});
  if(!auth.allowed)return Object.freeze({allowed:false,reason:auth.reason,authorization_ref:auth.authorization_ref});
  if(binding.workspace_id!==workspace.workspace_id||binding.project_id!==clean(project_id,160))return Object.freeze({allowed:false,reason:"CONNECTOR_SCOPE_MISMATCH"});
  if(route.allowed!==true)return Object.freeze({allowed:false,reason:"CONNECTOR_ROUTE_NOT_ALLOWED"});
  if(clean(route.connector_id,120).toLowerCase()!==binding.connector_id||clean(route.connection_ref,1000)!==binding.connection_ref)return Object.freeze({allowed:false,reason:"CONNECTOR_BINDING_MISMATCH"});
  const body={schema:1,binding_ref:binding.binding_ref,route_ref:clean(route.route_ref,1000),authorization_ref:auth.authorization_ref,user_id:clean(user_id,80).toLowerCase(),project_id:binding.project_id,allowed:true};
  return Object.freeze({...body,decision_ref:digest("workspace-connector-use",body)});
}

function normalizeBudget(input={},label){
  const amount=money(input.hard_limit_amount,label+" hard_limit_amount");
  const currency=clean(input.currency,3).toUpperCase();
  assert(/^[A-Z]{3}$/.test(currency),label+" currency is required.");
  return Object.freeze({hard_limit_amount:amount,currency});
}
export function assessWorkspaceBudgetAdmission({
  policy,users=[],workspace,memberships=[],user_id,project_id,budgets={},ledger=[],estimate={},
}={}){
  const auth=authorizeProjectAction({policy,users,workspace,memberships,user_id,project_id,permission:"budget.spend"});
  const ws=normalizeWorkspace(workspace);
  const projectId=clean(project_id,160);
  if(!auth.allowed)return Object.freeze({allowed:false,reason_codes:Object.freeze([auth.reason]),authorization_ref:auth.authorization_ref});
  const workspaceBudget=normalizeBudget(budgets.workspace||{},"Workspace budget");
  const projectBudget=normalizeBudget(budgets.project||{},"Project budget");
  assert(workspaceBudget.currency===projectBudget.currency,"Workspace/project budget currency mismatch.");
  const estimated=money(estimate.amount,"Budget estimate");
  const estimateCurrency=clean(estimate.currency,3).toUpperCase();
  assert(estimateCurrency===workspaceBudget.currency,"Budget estimate currency mismatch.");
  let workspaceSpent=0,projectSpent=0;
  const reasons=[];
  for(const item of Array.isArray(ledger)?ledger:[]){
    const itemWorkspace=clean(item.workspace_id,100).toLowerCase();
    if(itemWorkspace!==ws.workspace_id){reasons.push("CROSS_WORKSPACE_LEDGER");continue;}
    const status=clean(item.status,20).toUpperCase();
    const currency=clean(item.currency,3).toUpperCase();
    if(currency!==workspaceBudget.currency){reasons.push("LEDGER_CURRENCY_MISMATCH");continue;}
    if(status==="UNKNOWN"||item.amount==null){reasons.push("UNKNOWN_SPEND");continue;}
    assert(status==="KNOWN","Budget ledger status must be KNOWN or UNKNOWN.");
    const amount=money(item.amount,"Budget ledger amount");
    workspaceSpent+=amount;
    if(clean(item.project_id,160)===projectId)projectSpent+=amount;
  }
  workspaceSpent=money(workspaceSpent,"Workspace spent");
  projectSpent=money(projectSpent,"Project spent");
  const workspaceProjected=money(workspaceSpent+estimated,"Workspace projected spend");
  const projectProjected=money(projectSpent+estimated,"Project projected spend");
  if(workspaceProjected>workspaceBudget.hard_limit_amount)reasons.push("WORKSPACE_BUDGET_EXCEEDED");
  if(projectProjected>projectBudget.hard_limit_amount)reasons.push("PROJECT_BUDGET_EXCEEDED");
  const unique=sortedUnique(reasons,100);
  const body={schema:1,workspace_id:ws.workspace_id,project_id:projectId,user_id:clean(user_id,80).toLowerCase(),authorization_ref:auth.authorization_ref,currency:workspaceBudget.currency,workspace_spent:workspaceSpent,project_spent:projectSpent,estimate_amount:estimated,workspace_projected:workspaceProjected,project_projected:projectProjected,allowed:unique.length===0,reason_codes:unique};
  return Object.freeze({...body,decision_ref:digest("workspace-budget-admission",body)});
}

export function buildTeamProjectMemoryView({
  policy,users=[],workspace,memberships=[],user_id,records=[],employee_id,
}={}, {employeeIds=[]}={}){
  normalizeTeamOfficePolicy(policy);
  const ctx=normalizeActors({users,workspace,memberships});
  const userId=clean(user_id,80).toLowerCase();
  const active=ctx.memberships.filter(m=>m.workspace_id===ctx.workspace.workspace_id&&m.user_id===userId&&m.status==="ACTIVE");
  const authorizedProjectIds=[];
  for(const membership of active){
    if(authorizeProjectAction({policy,users:ctx.users,workspace:ctx.workspace,memberships:ctx.memberships,user_id:userId,project_id:membership.project_id,permission:"memory.read"}).allowed){
      authorizedProjectIds.push(membership.project_id);
    }
  }
  const projects=sortedUnique(authorizedProjectIds,160);
  const sharedScopes=Object.freeze(projects.map(id=>id+":approved"));
  const view=buildProjectMemoryView({
    records,employeeId:employee_id,authorizedProjectIds:projects,authorizedSharedScopes:sharedScopes,employeeIds,
  });
  return Object.freeze({...view,visible:view.records,derived_for_user_id:userId,derived_workspace_id:ctx.workspace.workspace_id});
}

function resourceBindingBody(input){
  return Object.freeze({
    schema:1,binding_id:input.binding_id,workspace_id:input.workspace_id,project_id:input.project_id,
    resource_kind:input.resource_kind,resource_ref:input.resource_ref,required_permission:input.required_permission,created_at:input.created_at,
  });
}
export function createSharedResourceBinding(input={}){
  const body=resourceBindingBody({
    binding_id:clean(input.binding_id,160),workspace_id:clean(input.workspace_id,100).toLowerCase(),project_id:clean(input.project_id,160),
    resource_kind:clean(input.resource_kind,40).toUpperCase(),resource_ref:clean(input.resource_ref,1000),
    required_permission:normalizePermission(input.required_permission),created_at:validTime(input.created_at)?new Date(input.created_at).toISOString():"",
  });
  assert(body.binding_id&&body.workspace_id&&body.project_id&&body.resource_ref,"Shared resource binding fields are required.");
  assert(["ARTIFACT","EVIDENCE"].includes(body.resource_kind),"Shared resource kind must be ARTIFACT or EVIDENCE.");
  noWildcard([body.project_id,body.resource_ref],"Shared resource binding");
  assert(validTime(body.created_at),"Shared resource binding created_at is invalid.");
  return Object.freeze({...body,binding_ref:digest("shared-resource-binding",body)});
}
function normalizeSharedResourceBinding(input={}){
  const rebuilt=createSharedResourceBinding(input);
  assert(rebuilt.binding_ref===input.binding_ref,"Shared resource binding checksum mismatch.");
  return rebuilt;
}
export function authorizeSharedResourceAccess({
  policy,users=[],workspace,memberships=[],binding:bindingInput,user_id,project_id,permission,
}={}){
  const binding=normalizeSharedResourceBinding(bindingInput);
  const requested=normalizePermission(permission);
  if(requested!==binding.required_permission)return Object.freeze({allowed:false,reason:"RESOURCE_PERMISSION_MISMATCH"});
  const auth=authorizeProjectAction({policy,users,workspace,memberships,user_id,project_id,permission:requested});
  if(!auth.allowed)return Object.freeze({allowed:false,reason:auth.reason,authorization_ref:auth.authorization_ref});
  if(binding.workspace_id!==workspace.workspace_id||binding.project_id!==clean(project_id,160))return Object.freeze({allowed:false,reason:"RESOURCE_SCOPE_MISMATCH"});
  const body={schema:1,binding_ref:binding.binding_ref,authorization_ref:auth.authorization_ref,user_id:clean(user_id,80).toLowerCase(),project_id:binding.project_id,permission:requested,allowed:true};
  return Object.freeze({...body,decision_ref:digest("shared-resource-access",body)});
}

function auditBody(input){
  return Object.freeze({
    schema:1,sequence:input.sequence,at:input.at,workspace_id:input.workspace_id,project_id:input.project_id,
    actor_user_id:input.actor_user_id,action:input.action,resource_ref:input.resource_ref,outcome:input.outcome,
    evidence_refs:input.evidence_refs,decision_ref:input.decision_ref,previous_event_ref:input.previous_event_ref,
  });
}
function normalizeAuditInput(input,sequence,previous){
  assert(input?.schema===1,"Team audit event schema must be 1.");
  const at=clean(input.at,80),workspaceId=clean(input.workspace_id,100).toLowerCase(),projectId=clean(input.project_id,160);
  const actor=clean(input.actor_user_id,80).toLowerCase(),action=normalizePermission(input.action),resource=clean(input.resource_ref,1000);
  const outcome=clean(input.outcome,20).toUpperCase();
  assert(validTime(at),"Team audit event timestamp is invalid.");
  assert(workspaceId&&projectId&&actor&&resource,"Team audit event actor/scope/resource are required.");
  assert(["ALLOWED","DENIED","RECORDED"].includes(outcome),"Team audit outcome is invalid.");
  noWildcard([projectId,resource],"Team audit");
  return auditBody({
    schema:1,sequence,at:new Date(at).toISOString(),workspace_id:workspaceId,project_id:projectId,
    actor_user_id:actor,action,resource_ref:resource,outcome,evidence_refs:sortedUnique(input.evidence_refs),
    decision_ref:input.decision_ref==null?null:clean(input.decision_ref,1000)||null,previous_event_ref:previous,
  });
}
export function validateSharedAuditLog(log=[]){
  assert(Array.isArray(log),"Shared audit log must be an array.");
  let previous=null;
  for(let i=0;i<log.length;i++){
    const item=log[i];
    assert(item.sequence===i+1,"Shared audit sequence mismatch.");
    const body=normalizeAuditInput(item,i+1,previous);
    assert(body.previous_event_ref===item.previous_event_ref,"Shared audit chain mismatch.");
    const expected=digest("team-audit-event",body);
    assert(expected===item.event_ref,"Shared audit digest/checksum mismatch.");
    previous=expected;
  }
  return true;
}
export function appendSharedAuditEvent(log=[],input={}){
  validateSharedAuditLog(log);
  const previous=log.length?log[log.length-1].event_ref:null;
  const body=normalizeAuditInput(input,log.length+1,previous);
  const event=Object.freeze({...body,event_ref:digest("team-audit-event",body)});
  return Object.freeze([...log,event]);
}
