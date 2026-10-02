import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readAndAssessV081ReleaseReadiness } from "../v0.8.1-release-readiness/index.mjs";
import {
  normalizeTeamOfficePolicy,
  createHumanUser,
  createProjectMembership,
  authorizeProjectAction,
  createApprovalDelegation,
  authorizeWorkspaceConnectorUse,
  assessWorkspaceBudgetAdmission,
  buildTeamProjectMemoryView,
  authorizeSharedResourceAccess,
  validateSharedAuditLog,
} from "../team-office/index.mjs";

const rootDefault=resolve(import.meta.dirname,"../..");
const readJson=async(root,path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
const readText=async(root,path)=>readFile(resolve(root,path),"utf8");
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clean=(v)=>String(v??"").trim();
const ref=(prefix,v)=>new RegExp("^"+prefix+":sha256:[a-f0-9]{64}$").test(clean(v));

function assessStatic({policy,threatModel}){
  let normalized=null;
  try{normalized=normalizeTeamOfficePolicy(policy);}catch{}
  const rbac=Boolean(
    normalized &&
    normalized.roles.OWNER.includes("project.manage") &&
    normalized.roles.APPROVER.includes("approval.decide") &&
    !normalized.roles.MEMBER.includes("approval.decide") &&
    !normalized.roles.VIEWER.includes("project.execute") &&
    typeof createHumanUser==="function" &&
    typeof createProjectMembership==="function" &&
    typeof authorizeProjectAction==="function"
  );
  const delegation=Boolean(
    normalized &&
    normalized.delegation.wildcards_allowed===false &&
    normalized.delegation.cross_project_allowed===false &&
    normalized.delegation.cross_workspace_allowed===false &&
    typeof createApprovalDelegation==="function"
  );
  const workspaceScope=Boolean(
    normalized &&
    normalized.resource_access.wildcards_allowed===false &&
    typeof authorizeWorkspaceConnectorUse==="function" &&
    typeof assessWorkspaceBudgetAdmission==="function" &&
    typeof buildTeamProjectMemoryView==="function" &&
    typeof authorizeSharedResourceAccess==="function"
  );
  const audit=Boolean(
    normalized &&
    normalized.audit.hash_chain_required===true &&
    normalized.audit.actor_required===true &&
    normalized.audit.scope_required===true &&
    typeof validateSharedAuditLog==="function" &&
    /Horizontal project access/i.test(threatModel) &&
    /Owner impersonation/i.test(threatModel) &&
    /Audit rewriting/i.test(threatModel)
  );
  return Object.freeze({
    TEAM_IDENTITY_RBAC_CONTRACTS:rbac?"PASS":"BLOCKED",
    DELEGATED_APPROVAL_CONTRACTS:delegation?"PASS":"BLOCKED",
    WORKSPACE_RESOURCE_SCOPE_CONTRACTS:workspaceScope?"PASS":"BLOCKED",
    SHARED_AUDIT_CONTRACTS:audit?"PASS":"BLOCKED",
  });
}

function assessLive(evidence){
  const isolation=evidence?.multi_user_isolation||{};
  const approval=evidence?.delegated_approval||{};
  const audit=evidence?.shared_audit||{};
  const isolationPass=Boolean(
    evidence?.schema===1&&evidence?.candidate==="v0.9.0"&&
    isolation.live_observed===true&&
    ref("team-workspace",isolation.workspace_ref)&&
    clean(isolation.project_a_ref)&&clean(isolation.project_b_ref)&&
    ref("team-authorization",isolation.rbac_authorization_ref)&&
    clean(isolation.cross_project_denial_ref)&&
    isolation.data_bleed_observed===false
  );
  const approvalPass=Boolean(
    approval.live_observed===true&&
    ref("approval-request",approval.approval_ref)&&
    ref("approval-delegation",approval.delegation_ref)&&
    ref("delegated-approval-decision",approval.decision_ref)&&
    approval.exact_scope_enforced===true&&
    approval.owner_impersonation_used===false
  );
  const auditPass=Boolean(
    audit.live_observed===true&&
    ref("team-audit-event",audit.audit_head_ref)&&
    audit.multiple_human_actors_observed===true&&
    audit.cross_project_events_separated===true&&
    audit.tamper_check_passed===true
  );
  return Object.freeze({
    LIVE_MULTI_USER_ISOLATION:isolationPass?"PASS":"BLOCKED",
    LIVE_DELEGATED_APPROVAL:approvalPass?"PASS":"BLOCKED",
    LIVE_SHARED_AUDIT_OBSERVATION:auditPass?"PASS":"BLOCKED",
  });
}

export async function assessV09ReleaseReadiness(config,{root=rootDefault,liveEvidenceOverride=null,v081Override=null}={}){
  const errors=[];
  if(config?.schema!==1)errors.push("v0.9 readiness schema must be 1.");
  if(config?.candidate!=="v0.9.0")errors.push("v0.9 readiness candidate must be v0.9.0.");
  const [evidence,policy,threatModel,pkg,v081]=await Promise.all([
    liveEvidenceOverride||readJson(root,"config/v0.9-live-evidence.json"),
    readJson(root,"config/v0.9-team-office-policy.json"),
    readText(root,"docs/V0.9-MULTI-USER-THREAT-MODEL.md"),
    readJson(root,"package.json"),
    v081Override||readAndAssessV081ReleaseReadiness({root}),
  ]);
  const staticComponents=assessStatic({policy,threatModel});
  const liveComponents=assessLive(evidence);
  const components=Object.freeze({...staticComponents,...liveComponents});
  const staticBlockers=Object.entries(staticComponents).filter(([,v])=>v!=="PASS").map(([k])=>k);
  const liveBlockers=Object.entries(liveComponents).filter(([,v])=>v!=="PASS").map(([k])=>k);
  const teamDecision=[...staticBlockers,...liveBlockers].length?"BLOCKED":"PASS";
  const v081Decision=v081.assessment?.decision||"UNKNOWN";
  const blockers=[...staticBlockers,...liveBlockers,...(v081Decision==="READY"?[]:["V0_8_1_PREREQUISITE"])];
  const configured=(config.release_blockers||[]).map(x=>x.id);
  if(config.team_office_decision!==teamDecision)errors.push("team_office_decision drift.");
  if(!same(config.evidence?.required_components||[],Object.keys(components)))errors.push("required component list drift.");
  if(!same(config.evidence?.observed||{},components))errors.push("observed component status drift.");
  if(!same(configured,blockers))errors.push("release blocker drift.");
  const decision=blockers.length?"BLOCKED":"READY";
  if(config.decision!==decision)errors.push("decision drift.");
  if(config.package_version_hold?.current!==pkg.version)errors.push("package version hold current does not match package.json.");
  if(config.package_version_hold?.candidate!=="0.9.0")errors.push("package version hold candidate must be 0.9.0.");
  if(decision==="BLOCKED"&&config.package_version_hold?.bump_authorized!==false)errors.push("package bump cannot be authorized while blocked.");
  if(decision==="BLOCKED"&&config.promotion?.stable_tag_authorized!==false)errors.push("stable tag cannot be authorized while blocked.");
  if(decision==="BLOCKED"&&config.promotion?.publication_authorized!==false)errors.push("publication cannot be authorized while blocked.");
  if(decision==="READY"&&pkg.version!=="0.9.0")errors.push("READY requires package.json version 0.9.0.");
  return Object.freeze({
    ok:errors.length===0,errors:Object.freeze(errors),decision,team_office_decision:teamDecision,
    components,blockers:Object.freeze(blockers),
    canonical:Object.freeze({package_version:pkg.version,v0_8_1_prerequisite:v081Decision,claim_boundary:"REPOSITORY_LEVEL_TEAM_GOVERNANCE_ONLY"}),
    live_evidence:evidence,
  });
}

export function buildV09ReadinessSnapshot({config,assessment}={}){
  if(!assessment?.ok)throw new Error("Cannot build v0.9 readiness snapshot from invalid assessment.");
  return Object.freeze({
    candidate:"v0.9.0",team_office_decision:assessment.team_office_decision,
    decision:assessment.decision,blocker_count:assessment.blockers.length,blockers:assessment.blockers,
    components:assessment.components,package_version:assessment.canonical.package_version,
    package_bump_authorized:config.package_version_hold.bump_authorized,
    stable_tag_authorized:config.promotion.stable_tag_authorized,
    publication_authorized:config.promotion.publication_authorized,
    claim_boundary:assessment.canonical.claim_boundary,
    truth_boundary:"Repository-level RBAC, delegated approval, scoped resources, and hash-chained audit tests do not replace qualifying live multi-user isolation, authentication, tenant-storage isolation, or prerequisite release evidence.",
  });
}

export async function readAndAssessV09ReleaseReadiness({root=rootDefault}={}){
  const config=await readJson(root,"config/v0.9-release-readiness.json");
  const assessment=await assessV09ReleaseReadiness(config,{root});
  return Object.freeze({config,assessment});
}
