import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readAndAssessV08ReleaseReadiness } from "../v0.8-release-readiness/index.mjs";
import { normalizeMissionControlPolicy } from "../mission-control/index.mjs";

const rootDefault=resolve(import.meta.dirname,"../..");
const readJson=async(root,path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clean=(v)=>String(v??"").trim();
const ref=(prefix,v)=>new RegExp("^"+prefix+":sha256:[a-f0-9]{64}$").test(clean(v));

function assessStatic({control,hardening,missionSchema,recovery}){
  let controlPass=false;
  try{
    const p=normalizeMissionControlPolicy(control);
    controlPass=Boolean(
      p.max_parallel_tasks<=8 &&
      p.max_parallel_per_employee<=p.max_parallel_tasks &&
      p.checkpoint_on_pause===true &&
      p.adaptive.owner_review_required===true &&
      p.adaptive.automatic_apply_allowed===false &&
      p.adaptive.authority_widening_allowed===false &&
      p.stop_conditions.owner_cancel===true &&
      p.stop_conditions.cost_governor_stop===true
    );
  }catch{}
  const hardeningPass=Boolean(
    hardening?.schema===1 &&
    hardening.filesystem?.mode==="TEMP_WORKSPACE_ONLY" &&
    hardening.filesystem?.production_repo_read_only===true &&
    hardening.filesystem?.host_home_access_allowed===false &&
    hardening.browser?.mode==="EPHEMERAL_PROFILE_ONLY" &&
    hardening.browser?.user_profile_reuse_allowed===false &&
    hardening.browser?.credential_store_access_allowed===false &&
    hardening.network?.mode==="ALLOWLIST_ONLY" &&
    hardening.network?.dns_rebinding_protection_required===true &&
    hardening.credentials?.delivery==="REFERENCE_ONLY" &&
    hardening.credentials?.task_payload_values_allowed===false &&
    hardening.credentials?.environment_secret_injection_allowed===false &&
    hardening.claim_boundary?.application_level_guard===true &&
    hardening.claim_boundary?.os_container_isolation===false
  );
  const states=missionSchema?.properties?.state?.enum||[];
  const recoveryPass=Boolean(
    states.includes("PAUSED") &&
    recovery?.schema===1 &&
    Number.isInteger(recovery.max_recovery_cycles) &&
    recovery.browser?.reuse_user_profile_forbidden===true
  );
  return Object.freeze({
    MISSION_CONTROL_CONTRACTS:controlPass?"PASS":"BLOCKED",
    SANDBOX_HARDENING_CONTRACTS:hardeningPass?"PASS":"BLOCKED",
    PAUSE_RECOVERY_CONTRACTS:recoveryPass?"PASS":"BLOCKED",
  });
}

function assessLive(evidence){
  const m=evidence?.long_running_mission||{},s=evidence?.hardened_sandbox||{};
  const mission=Boolean(
    evidence?.schema===1 && evidence?.candidate==="v0.8.1" &&
    m.live_observed===true &&
    ref("mission-control-run",m.control_ref) &&
    ref("checkpoint",m.checkpoint_ref) &&
    m.resumed_from_checkpoint===true &&
    m.stoppable===true && m.inspectable===true && m.budgeted===true && m.permission_scoped===true
  );
  const sandbox=Boolean(
    s.live_observed===true &&
    ref("sandbox-hardening",s.hardening_ref) &&
    s.filesystem_boundary_observed===true &&
    s.ephemeral_browser_observed===true &&
    s.network_allowlist_observed===true &&
    s.resource_ceiling_observed===true &&
    s.credential_reference_only_observed===true &&
    s.application_level_guard===true &&
    s.os_container_isolation_claim===false
  );
  return Object.freeze({
    LIVE_LONG_RUNNING_MISSION:mission?"PASS":"BLOCKED",
    LIVE_HARDENED_SANDBOX_OBSERVATION:sandbox?"PASS":"BLOCKED",
  });
}

export async function assessV081ReleaseReadiness(config,{root=rootDefault,liveEvidenceOverride=null,v08Override=null}={}){
  const errors=[];
  if(config?.schema!==1)errors.push("v0.8.1 readiness schema must be 1.");
  if(config?.candidate!=="v0.8.1")errors.push("v0.8.1 readiness candidate must be v0.8.1.");
  const [evidence,control,hardening,missionSchema,recovery,pkg,v08]=await Promise.all([
    liveEvidenceOverride||readJson(root,"config/v0.8.1-live-evidence.json"),
    readJson(root,"config/v0.8.1-mission-control-policy.json"),
    readJson(root,"config/v0.8.1-sandbox-hardening-policy.json"),
    readJson(root,"schemas/mission.schema.json"),
    readJson(root,"config/recovery-policy.json"),
    readJson(root,"package.json"),
    v08Override||readAndAssessV08ReleaseReadiness({root}),
  ]);
  const staticComponents=assessStatic({control,hardening,missionSchema,recovery});
  const liveComponents=assessLive(evidence);
  const components=Object.freeze({...staticComponents,...liveComponents});
  const staticBlockers=Object.entries(staticComponents).filter(([,v])=>v!=="PASS").map(([k])=>k);
  const liveBlockers=Object.entries(liveComponents).filter(([,v])=>v!=="PASS").map(([k])=>k);
  const missionDecision=[...staticBlockers,...liveBlockers].length?"BLOCKED":"PASS";
  const v08Decision=v08.assessment?.decision||"UNKNOWN";
  const blockers=[...staticBlockers,...liveBlockers,...(v08Decision==="READY"?[]:["V0_8_0_PREREQUISITE"])];
  const configured=(config.release_blockers||[]).map(x=>x.id);
  if(config.mission_control_decision!==missionDecision)errors.push("mission_control_decision drift.");
  if(!same(config.evidence?.required_components||[],Object.keys(components)))errors.push("required component list drift.");
  if(!same(config.evidence?.observed||{},components))errors.push("observed component status drift.");
  if(!same(configured,blockers))errors.push("release blocker drift.");
  const decision=blockers.length?"BLOCKED":"READY";
  if(config.decision!==decision)errors.push("decision drift.");
  if(config.package_version_hold?.current!==pkg.version)errors.push("package version hold current does not match package.json.");
  if(config.package_version_hold?.candidate!=="0.8.1")errors.push("package version hold candidate must be 0.8.1.");
  if(decision==="BLOCKED"&&config.package_version_hold?.bump_authorized!==false)errors.push("package bump cannot be authorized while blocked.");
  if(decision==="BLOCKED"&&config.promotion?.stable_tag_authorized!==false)errors.push("stable tag cannot be authorized while blocked.");
  if(decision==="BLOCKED"&&config.promotion?.publication_authorized!==false)errors.push("publication cannot be authorized while blocked.");
  if(decision==="READY"&&pkg.version!=="0.8.1")errors.push("READY requires package.json version 0.8.1.");
  return Object.freeze({
    ok:errors.length===0,errors:Object.freeze(errors),decision,mission_control_decision:missionDecision,
    components,blockers:Object.freeze(blockers),
    canonical:Object.freeze({package_version:pkg.version,v0_8_prerequisite:v08Decision,claim_boundary:"APPLICATION_LEVEL_SANDBOX_HARDENING_ONLY"}),
    live_evidence:evidence,
  });
}

export function buildV081ReadinessSnapshot({config,assessment}={}){
  if(!assessment?.ok)throw new Error("Cannot build v0.8.1 readiness snapshot from invalid assessment.");
  return Object.freeze({
    candidate:"v0.8.1",mission_control_decision:assessment.mission_control_decision,
    decision:assessment.decision,blocker_count:assessment.blockers.length,blockers:assessment.blockers,
    components:assessment.components,package_version:assessment.canonical.package_version,
    package_bump_authorized:config.package_version_hold.bump_authorized,
    stable_tag_authorized:config.promotion.stable_tag_authorized,
    publication_authorized:config.promotion.publication_authorized,
    claim_boundary:assessment.canonical.claim_boundary,
    truth_boundary:"Static Mission Control and application-level sandbox-hardening tests do not replace qualifying live pause/resume and isolation observations, prerequisite release readiness, or human authorization.",
  });
}

export async function readAndAssessV081ReleaseReadiness({root=rootDefault}={}){
  const config=await readJson(root,"config/v0.8.1-release-readiness.json");
  const assessment=await assessV081ReleaseReadiness(config,{root});
  return Object.freeze({config,assessment});
}
