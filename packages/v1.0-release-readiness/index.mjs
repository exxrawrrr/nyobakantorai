import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readAndValidateEvidenceInventory } from "../evidence-classification/index.mjs";
import { readMaturityInputs, validateMaturityModel } from "../maturity-model/index.mjs";
import { readAndAssessV09ReleaseReadiness } from "../v0.9-release-readiness/index.mjs";

const rootDefault=resolve(import.meta.dirname,"../..");
const readJson=async(root,path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha40=(v)=>/^[a-f0-9]{40}$/.test(String(v??"").trim());
const sha256=(v)=>/^[a-f0-9]{64}$/.test(String(v??"").trim());
const contentRef=(prefix,v)=>new RegExp("^"+prefix+":sha256:[a-f0-9]{64}$").test(String(v??"").trim());

function assessRealWorld(status,baselinePolicy,policy){
  return Boolean(
    status?.status===baselinePolicy?.prepare?.ready_state &&
    status?.claim_state===baselinePolicy?.prepare?.ready_claim_state &&
    status?.publication_gate_passed===policy?.real_world_workflow?.require_publication_gate &&
    Number(status?.eligible_cases)>=Number(baselinePolicy?.minimum_cases) &&
    Number(status?.false_successes)<=Number(policy?.real_world_workflow?.max_false_successes)
  );
}

function assessRecovery(evidence,policy){
  const e=evidence?.representative_recovery||{};
  const p=policy?.representative_recovery||{};
  return Boolean(
    e.live_observed===true &&
    sha40(e.source_commit) &&
    Number(e.mission_count)>=Number(p.minimum_missions) &&
    (!p.require_observed_failure||Number(e.failure_cases)>=1) &&
    (!p.require_verified_recovery||Number(e.verified_recoveries)>=1) &&
    Number(e.false_successes)<=Number(p.max_false_successes) &&
    (!p.require_budget_scope||e.budget_scope_observed===true) &&
    (!p.require_permission_scope||e.permission_scope_observed===true) &&
    contentRef("recovery-convergence",e.evidence_ref)
  );
}

function assessInstallMatrix(evidence,policy){
  const e=evidence?.install_matrix||{};
  const required=policy?.install_matrix?.required_modes||[];
  return Boolean(
    e.live_observed===true &&
    sha40(e.source_commit) &&
    (!policy?.install_matrix?.require_clean_source||e.clean_source===true) &&
    (!policy?.install_matrix?.require_isolated_python_env||e.isolated_python_env===true) &&
    required.every((mode)=>e[mode]===true) &&
    sha256(e.log_sha256)
  );
}

function assessSecurity({sandbox,team,recovery,pkg,policy}){
  const p=policy?.security||{};
  return Boolean(
    (!p.application_sandbox_required||(
      sandbox?.filesystem?.production_repo_read_only===true &&
      sandbox?.filesystem?.host_home_access_allowed===false &&
      sandbox?.network?.mode==="ALLOWLIST_ONLY"
    )) &&
    (!p.ephemeral_browser_required||(
      sandbox?.browser?.mode==="EPHEMERAL_PROFILE_ONLY" &&
      sandbox?.browser?.user_profile_reuse_allowed===false &&
      sandbox?.browser?.credential_store_access_allowed===false
    )) &&
    (!p.reference_only_credentials_required||(
      sandbox?.credentials?.delivery==="REFERENCE_ONLY" &&
      sandbox?.credentials?.task_payload_values_allowed===false &&
      sandbox?.credentials?.environment_secret_injection_allowed===false
    )) &&
    (!p.cross_workspace_delegation_forbidden||team?.delegation?.cross_workspace_allowed===false) &&
    (!p.wildcard_resource_access_forbidden||team?.resource_access?.wildcards_allowed===false) &&
    (!p.hash_chained_audit_required||team?.audit?.hash_chain_required===true) &&
    (!p.fresh_browser_recovery_required||recovery?.browser?.reuse_user_profile_forbidden===true) &&
    typeof pkg?.scripts?.["security:scan"]==="string" &&
    typeof pkg?.scripts?.["public:scan"]==="string"
  );
}

export async function assessV1ReleaseReadiness(config,{
  root=rootDefault,
  productionEvidenceOverride=null,
  realTaskOverride=null,
  v09Override=null,
}={}){
  const errors=[];
  if(config?.schema!==1)errors.push("v1.0 readiness schema must be 1.");
  if(config?.candidate!=="v1.0.0")errors.push("v1.0 readiness candidate must be v1.0.0.");

  const [
    policy,productionEvidence,baselinePolicy,realTaskStatus,sandbox,team,recovery,pkg,
    evidenceBundle,maturityInputs,v09
  ]=await Promise.all([
    readJson(root,"config/v1.0-release-policy.json"),
    productionEvidenceOverride||readJson(root,"config/v1.0-production-evidence.json"),
    readJson(root,"config/real-task-baseline.json"),
    realTaskOverride||readJson(root,"benchmarks/real-tasks/collection-status-2026-09-29.json"),
    readJson(root,"config/v0.8.1-sandbox-hardening-policy.json"),
    readJson(root,"config/v0.9-team-office-policy.json"),
    readJson(root,"config/recovery-policy.json"),
    readJson(root,"package.json"),
    readAndValidateEvidenceInventory({root}),
    readMaturityInputs({root}),
    v09Override||readAndAssessV09ReleaseReadiness({root}),
  ]);

  const maturityValidation=await validateMaturityModel(maturityInputs.model,{
    root,
    evidenceValidation:evidenceBundle.validation,
    browserResults:maturityInputs.browserResults,
    memoryResults:maturityInputs.memoryResults,
    realTaskStatus:maturityInputs.realTaskStatus,
  });

  const components=Object.freeze({
    REAL_WORLD_WORKFLOW_EVIDENCE:assessRealWorld(realTaskStatus,baselinePolicy,policy)?"PASS":"BLOCKED",
    PROVIDER_LIFECYCLE_MATURITY:(maturityValidation.ok&&maturityValidation.dimensions.provider_lifecycle===policy.provider_lifecycle.required_state)?"PASS":"BLOCKED",
    REPRESENTATIVE_RECOVERY_EVIDENCE:assessRecovery(productionEvidence,policy)?"PASS":"BLOCKED",
    SECURITY_CONTROL_CONVERGENCE:assessSecurity({sandbox,team,recovery,pkg,policy})?"PASS":"BLOCKED",
    INSTALL_MIGRATION_FRESH_MATRIX:assessInstallMatrix(productionEvidence,policy)?"PASS":"BLOCKED",
    RELEASE_CLAIM_AUDIT:(evidenceBundle.validation.ok&&maturityValidation.ok)?"PASS":"BLOCKED",
  });

  let blockers=Object.entries(components).filter(([,value])=>value!=="PASS").map(([id])=>id);
  const v09Decision=v09?.assessment?.decision||"UNKNOWN";
  if(v09Decision!=="READY")blockers.push("V0_9_PREREQUISITE");

  const manual=productionEvidence?.manual_gate||{};
  if(blockers.length===0){
    const manualGo=manual.status==="COMPLETE"&&manual.decision==="GO"&&contentRef("manual-release",manual.approval_ref);
    if(!manualGo)blockers.push("MANUAL_RELEASE_GATE");
  }

  const decision=blockers.length?"BLOCKED":"READY";
  const productionDecision=decision==="READY"?"GO":"NO_GO";
  const configured=(config.release_blockers||[]).map((x)=>x.id);
  if(config.production_decision!==productionDecision)errors.push("production_decision drift.");
  if(!same(config.evidence?.required_components||[],Object.keys(components)))errors.push("required component list drift.");
  if(!same(config.evidence?.observed||{},components))errors.push("observed component status drift.");
  if(!same(configured,blockers))errors.push("release blocker drift.");
  if(config.decision!==decision)errors.push("decision drift.");
  if(config.package_version_hold?.current!==pkg.version)errors.push("package version hold current does not match package.json.");
  if(config.package_version_hold?.candidate!=="1.0.0")errors.push("package version hold candidate must be 1.0.0.");
  if(config.package_version_hold?.highest_truthful_pre_v1!==pkg.version)errors.push("highest truthful pre-v1 version must match current stable package.");
  if(decision==="BLOCKED"&&config.package_version_hold?.bump_authorized!==false)errors.push("package bump cannot be authorized while blocked.");
  if(decision==="BLOCKED"&&config.promotion?.stable_tag_authorized!==false)errors.push("stable tag cannot be authorized while blocked.");
  if(decision==="BLOCKED"&&config.promotion?.publication_authorized!==false)errors.push("publication cannot be authorized while blocked.");
  if(decision==="BLOCKED"&&manual.decision==="GO")errors.push("manual GO cannot override technical blockers.");
  if(decision==="READY"&&pkg.version!=="1.0.0")errors.push("READY requires package.json version 1.0.0.");

  const post=productionEvidence?.post_release||{};
  if(decision==="BLOCKED"){
    if(post.tagged_asset_verification!=="NOT_RUN_BLOCKED")errors.push("blocked release must not claim tagged-asset verification.");
    if(post.post_release_install_smoke!=="NOT_RUN_BLOCKED")errors.push("blocked release must not claim post-release install smoke.");
  }

  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    decision,
    production_decision:productionDecision,
    components,
    blockers:Object.freeze(blockers),
    canonical:Object.freeze({
      package_version:pkg.version,
      real_world_status:realTaskStatus?.status||"UNKNOWN",
      real_world_cases:Number(realTaskStatus?.eligible_cases||0),
      real_world_minimum:Number(baselinePolicy?.minimum_cases||0),
      provider_lifecycle:maturityValidation.dimensions.provider_lifecycle,
      v0_9_prerequisite:v09Decision,
      claim_boundary:"PRODUCTION_EVIDENCE_CONVERGENCE",
    }),
    production_evidence:productionEvidence,
  });
}

export function buildV1ReadinessSnapshot({config,assessment}={}){
  if(!assessment?.ok)throw new Error("Cannot build v1.0 readiness snapshot from invalid assessment.");
  return Object.freeze({
    candidate:"v1.0.0",
    production_decision:assessment.production_decision,
    decision:assessment.decision,
    blocker_count:assessment.blockers.length,
    blockers:assessment.blockers,
    components:assessment.components,
    package_version:assessment.canonical.package_version,
    highest_truthful_pre_v1:config.package_version_hold.highest_truthful_pre_v1,
    package_bump_authorized:config.package_version_hold.bump_authorized,
    stable_tag_authorized:config.promotion.stable_tag_authorized,
    publication_authorized:config.promotion.publication_authorized,
    post_release:config.post_release,
    canonical:assessment.canonical,
    truth_boundary:"v1.0 requires reviewed real-world evidence, validated provider lifecycle, representative recovery evidence, security/install convergence, prerequisite readiness, and a final manual GO. Static tests or schedule pressure cannot substitute for those gates.",
  });
}

export async function readAndAssessV1ReleaseReadiness({root=rootDefault}={}){
  const config=await readJson(root,"config/v1.0-release-readiness.json");
  const assessment=await assessV1ReleaseReadiness(config,{root});
  return Object.freeze({config,assessment});
}
