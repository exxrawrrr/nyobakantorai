import { V06_ACCEPTANCE_CRITERIA } from "../v0.6-acceptance/index.mjs";
import { access,readFile } from "node:fs/promises";
import { resolve } from "node:path";

const nonEmpty=(v)=>typeof v==="string"&&v.trim().length>0;
async function exists(path){try{await access(path);return true;}catch{return false;}}

export async function assessV05ReleaseReadiness(config,{root=resolve(import.meta.dirname,"../..")}={}){
  const errors=[];
  if(config?.schema!==1)errors.push("release readiness schema must be 1");
  if(config?.candidate!=="v0.5.1")errors.push("candidate must be v0.5.1");
  if(!["BLOCKED","READY"].includes(config?.decision))errors.push("decision must be BLOCKED or READY");

  const readJson=async(path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
  const [evidence,maturity,realTasks,pkg,deferred]=await Promise.all([
    readJson("config/evidence-classification.json"),
    readJson("config/maturity-model.json"),
    readJson("benchmarks/real-tasks/collection-status-2026-09-29.json"),
    readJson("package.json"),
    readJson("config/v0.4-deferred-evidence.json"),
  ]);

  for(const path of config?.durable_requirement_surfaces||[]){
    if(!await exists(resolve(root,path)))errors.push("durable requirement surface missing: "+path);
  }

  const retired=config?.retired_temporary_prd;
  if(!retired?.must_be_absent)errors.push("temporary PRD retirement must be fail-closed");
  if(!nonEmpty(retired?.path)||!nonEmpty(retired?.successor))errors.push("temporary PRD path/successor required");
  if(retired?.path&&await exists(resolve(root,retired.path)))errors.push("temporary PRD still present: "+retired.path);
  if(retired?.successor&&!await exists(resolve(root,retired.successor)))errors.push("temporary PRD successor missing: "+retired.successor);

  const claim=evidence?.claims?.find((item)=>item.id==="reference-case-portability");
  const liveGrowth=evidence?.v0_5_evidence_growth?.LIVE_RUNTIME_EVIDENCE;
  const computed=[];
  if(claim?.expected_status!=="SUPPORTED")computed.push("canonical-reference-portability");
  if(liveGrowth?.state!=="INCREASED")computed.push("live-runtime-evidence-growth");
  if(pkg?.version!=="0.5.1")computed.push("package-version-v0.5");
  const promotion=config?.promotion||{};
  if(promotion.final_main_verify!=="PASS"||promotion.manual_release_gate!=="PASS")computed.push("final-main-release-gate");

  const declared=(config?.release_blockers||[]).map((item)=>item.id);
  if(JSON.stringify(declared)!==JSON.stringify(computed)){
    errors.push("release blocker drift: declared="+JSON.stringify(declared)+" computed="+JSON.stringify(computed));
  }
  for(const item of config?.release_blockers||[]){
    for(const field of ["id","category","status","required_state","current_state","canonical_source","reason","safe_next_action"]){
      if(!nonEmpty(item?.[field]))errors.push((item?.id||"unknown")+": "+field+" required");
    }
    if(!await exists(resolve(root,item.canonical_source)))errors.push(item.id+": canonical source missing: "+item.canonical_source);
  }

  const computedDecision=computed.length?"BLOCKED":"READY";
  if(config?.decision!==computedDecision)errors.push("decision drift: declared="+String(config?.decision)+" computed="+computedDecision);
  if(computedDecision==="BLOCKED"&&promotion.merge_authorized===true)errors.push("merge_authorized cannot be true while release is blocked");

  const realGap=(config?.nonblocking_open_evidence||[]).find((item)=>item.id==="real-world-workflow-baseline");
  if(realGap?.state!==realTasks?.status||realGap?.current!==realTasks?.eligible_cases+"/"+realTasks?.minimum_cases_required)errors.push("real-world nonblocking gap drift");
  const providerGap=(config?.nonblocking_open_evidence||[]).find((item)=>item.id==="provider-lifecycle");
  if(providerGap?.state?.toLowerCase()!==maturity?.dimensions?.provider_lifecycle?.state)errors.push("provider lifecycle gap drift");
  const cleanGap=(config?.nonblocking_open_evidence||[]).find((item)=>item.id==="real-clean-machine-hermes-lifecycle");
  const cleanItem=deferred?.items?.find((item)=>item.id==="real-clean-machine-hermes-lifecycle");
  if(cleanGap?.state!==cleanItem?.status)errors.push("clean-machine Hermes gap drift");

  if(!nonEmpty(config?.claim_language?.allowed)||!Array.isArray(config?.claim_language?.forbidden)||config.claim_language.forbidden.length<3)errors.push("claim language boundaries required");

  return Object.freeze({
    ok:errors.length===0,errors:Object.freeze(errors),decision:computedDecision,blockers:Object.freeze(computed),blocker_count:computed.length,
    canonical:Object.freeze({
      reference_case_portability:claim?.expected_status||"UNKNOWN",
      live_runtime_growth:liveGrowth?.state||"UNKNOWN",
      package_version:pkg?.version||"UNKNOWN",
      artifact_maturity:maturity?.dimensions?.artifact?.state||"UNKNOWN",
      real_world_workflow:maturity?.dimensions?.real_world_workflow?.state||"UNKNOWN",
      provider_lifecycle:maturity?.dimensions?.provider_lifecycle?.state||"UNKNOWN",
      real_task_cases:realTasks?.eligible_cases||0,
      real_task_required:realTasks?.minimum_cases_required||0,
    }),
    temporary_prd_absent:retired?.path ? !(await exists(resolve(root,retired.path))) : false,
  });
}

export function buildV05ReadinessSnapshot({config,assessment}){
  if(!assessment?.ok)throw new Error("cannot snapshot invalid v0.5 release readiness");
  return Object.freeze({
    schema:1,candidate:config.candidate,decision:assessment.decision,blocker_count:assessment.blocker_count,
    blockers:assessment.blockers,canonical:assessment.canonical,temporary_prd_absent:assessment.temporary_prd_absent,
    merge_authorized:config.promotion.merge_authorized===true,
    truth_boundary:"green validation of BLOCKED state != release authorization; READY does not imply publication; publication additionally requires an immutable tag and successful tagged asset verification; stable artifact != broad behavioral or provider maturity",
  });
}

export async function readAndAssessV05ReleaseReadiness({root=resolve(import.meta.dirname,"../..")}={}){
  const config=JSON.parse(await readFile(resolve(root,"config/v0.5-release-readiness.json"),"utf8"));
  return {config,assessment:await assessV05ReleaseReadiness(config,{root})};
}


export async function assessV06ReleaseReadiness(config,{root=resolve(import.meta.dirname,"../..")}={}){
  const errors=[];
  if(config?.schema!==1)errors.push("v0.6 release readiness schema must be 1");
  if(config?.candidate!=="v0.6.0")errors.push("v0.6 candidate must be v0.6.0");
  if(!["BLOCKED","READY"].includes(config?.decision))errors.push("v0.6 decision must be BLOCKED or READY");

  const readJson=async(path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
  const [acceptance,pkg]=await Promise.all([
    readJson("config/v0.6-acceptance-evidence.json"),
    readJson("package.json"),
  ]);

  for(const path of config?.durable_requirement_surfaces||[]){
    if(!await exists(resolve(root,path)))errors.push("v0.6 durable requirement surface missing: "+path);
  }

  if(acceptance?.schema!==1)errors.push("v0.6 acceptance evidence schema must be 1");
  if(acceptance?.chat!=="CHAT 11")errors.push("v0.6 acceptance evidence must come from CHAT 11");
  if(acceptance?.canonical_doc&&!await exists(resolve(root,acceptance.canonical_doc)))errors.push("v0.6 acceptance canonical doc missing: "+acceptance.canonical_doc);

  const criteria=Array.isArray(acceptance?.criteria)?acceptance.criteria:[];
  const expectedIds=[...V06_ACCEPTANCE_CRITERIA];
  const actualIds=criteria.map((item)=>item?.id);
  if(JSON.stringify(actualIds)!==JSON.stringify(expectedIds)){
    errors.push("v0.6 acceptance criteria drift: expected="+JSON.stringify(expectedIds)+" actual="+JSON.stringify(actualIds));
  }
  for(const item of criteria){
    if(!["PASS","BLOCKED","FAILED"].includes(item?.status))errors.push("v0.6 acceptance criterion status invalid: "+String(item?.id));
  }

  const passCount=criteria.filter((item)=>item.status==="PASS").length;
  const computed=[];
  if(acceptance?.mission_state!=="VERIFIED")computed.push("MISSION_VERIFICATION");
  for(const item of criteria){
    if(item?.status!=="PASS"&&nonEmpty(item?.id))computed.push(item.id);
  }

  const expectedVerdict=computed.length?"BLOCKED":"ACCEPTED";
  if(acceptance?.verdict!==expectedVerdict)errors.push("v0.6 acceptance verdict drift: declared="+String(acceptance?.verdict)+" computed="+expectedVerdict);
  if(acceptance?.passed!==passCount||acceptance?.total!==criteria.length)errors.push("v0.6 acceptance count drift");
  if(config?.acceptance?.observed_pass_count!==passCount||config?.acceptance?.total!==criteria.length)errors.push("v0.6 readiness acceptance count drift");
  if(config?.acceptance?.mission_state!==acceptance?.mission_state||config?.acceptance?.verdict!==acceptance?.verdict)errors.push("v0.6 readiness acceptance state drift");

  const deployment=config?.public_demo_deployment||{};
  if(deployment.configured===true&&deployment.state!=="VERIFIED")computed.push("PUBLIC_DEMO_DEPLOYMENT");
  if(deployment.configured!==true&&deployment.state!=="NOT_CONFIGURED")errors.push("unconfigured public demo deployment must be NOT_CONFIGURED");

  const declared=(config?.release_blockers||[]).map((item)=>item.id);
  if(JSON.stringify(declared)!==JSON.stringify(computed)){
    errors.push("v0.6 release blocker drift: declared="+JSON.stringify(declared)+" computed="+JSON.stringify(computed));
  }
  for(const item of config?.release_blockers||[]){
    for(const field of ["id","category","status","required_state","current_state","canonical_source","reason","safe_next_action"]){
      if(!nonEmpty(item?.[field]))errors.push((item?.id||"unknown")+": "+field+" required");
    }
    if(item?.canonical_source&&!await exists(resolve(root,item.canonical_source)))errors.push(item.id+": canonical source missing: "+item.canonical_source);
  }

  const computedDecision=computed.length?"BLOCKED":"READY";
  if(config?.decision!==computedDecision)errors.push("v0.6 decision drift: declared="+String(config?.decision)+" computed="+computedDecision);

  const hold=config?.package_version_hold||{};
  const candidateVersion=String(config?.candidate||"").replace(/^v/,"");
  if(hold.current!==pkg?.version)errors.push("v0.6 package version hold drift");
  if(hold.candidate!==candidateVersion)errors.push("v0.6 package version candidate drift");
  if(computedDecision==="BLOCKED"){
    if(hold.bump_authorized===true)errors.push("v0.6 package bump cannot be authorized while readiness is blocked");
    if(pkg?.version===candidateVersion)errors.push("blocked v0.6 candidate must not replace stable package version metadata");
  }else{
    if(pkg?.version!==candidateVersion)errors.push("READY v0.6 candidate requires package version "+candidateVersion);
    if(hold.bump_authorized!==true)errors.push("READY v0.6 candidate requires package bump authorization");
  }

  const promotion=config?.promotion||{};
  if(computedDecision==="BLOCKED"){
    if(promotion.stable_tag_authorized===true)errors.push("stable tag cannot be authorized while v0.6 is blocked");
    if(promotion.publication_authorized===true)errors.push("publication cannot be authorized while v0.6 is blocked");
  }

  const observations=Array.isArray(acceptance?.live_observations)?acceptance.live_observations:[];
  const runtimes=new Set(observations.map((item)=>item?.runtime));
  for(const runtime of ["codex","hermes"]){
    if(!runtimes.has(runtime))errors.push("v0.6 acceptance live observation missing runtime: "+runtime);
  }
  for(const item of observations){
    if(item?.sandbox_executed!==true)errors.push("v0.6 live observation sandbox must have executed: "+String(item?.runtime));
    if(item?.teardown_verified!==true)errors.push("v0.6 live observation teardown must be verified: "+String(item?.runtime));
    if(item?.external_write_observed!==false)errors.push("v0.6 live observation external write safety drift: "+String(item?.runtime));
  }

  if(!nonEmpty(config?.claim_language?.allowed)||!Array.isArray(config?.claim_language?.forbidden)||config.claim_language.forbidden.length<4)errors.push("v0.6 claim language boundaries required");

  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    decision:computedDecision,
    blockers:Object.freeze(computed),
    blocker_count:computed.length,
    canonical:Object.freeze({
      mission_state:acceptance?.mission_state||"UNKNOWN",
      acceptance_verdict:acceptance?.verdict||"UNKNOWN",
      acceptance_passed:passCount,
      acceptance_total:criteria.length,
      package_version:pkg?.version||"UNKNOWN",
      public_demo_deployment:deployment.state||"UNKNOWN",
      live_observation_runtimes:Object.freeze([...runtimes].sort()),
    }),
  });
}

export function buildV06ReadinessSnapshot({config,assessment}){
  if(!assessment?.ok)throw new Error("cannot snapshot invalid v0.6 release readiness");
  return Object.freeze({
    schema:1,
    candidate:config.candidate,
    decision:assessment.decision,
    blocker_count:assessment.blocker_count,
    blockers:assessment.blockers,
    canonical:assessment.canonical,
    package_bump_authorized:config.package_version_hold.bump_authorized===true,
    stable_tag_authorized:config.promotion.stable_tag_authorized===true,
    publication_authorized:config.promotion.publication_authorized===true,
    truth_boundary:"green CI can validate a BLOCKED release state; it does not convert missing live acceptance evidence into release authorization",
  });
}

export async function readAndAssessV06ReleaseReadiness({root=resolve(import.meta.dirname,"../..")}={}){
  const config=JSON.parse(await readFile(resolve(root,"config/v0.6-release-readiness.json"),"utf8"));
  return {config,assessment:await assessV06ReleaseReadiness(config,{root})};
}


const V061_RELIABILITY_COMPONENTS = Object.freeze([
  "COST_GOVERNOR",
  "ARTIFACT_REPLAY_INTEGRITY",
  "CHECKPOINT_RECOVERY",
  "PROJECT_BRAIN_MEMORY_SCOPE",
]);

export async function assessV061ReleaseReadiness(config,{
  root=resolve(import.meta.dirname,"../.."),
  evidenceOverride=null,
  v06ConfigOverride=null,
}={}){
  const errors=[];
  if(config?.schema!==1)errors.push("v0.6.1 release readiness schema must be 1");
  if(config?.candidate!=="v0.6.1")errors.push("v0.6.1 candidate must be v0.6.1");
  if(!["BLOCKED","READY"].includes(config?.decision))errors.push("v0.6.1 decision must be BLOCKED or READY");
  if(!["PASS","BLOCKED"].includes(config?.reliability_decision))errors.push("v0.6.1 reliability_decision must be PASS or BLOCKED");

  const readJson=async(path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
  const evidence=evidenceOverride??await readJson("config/v0.6.1-reliability-evidence.json");
  const v06Config=v06ConfigOverride??await readJson("config/v0.6-release-readiness.json");
  const pkg=await readJson("package.json");

  for(const path of config?.durable_requirement_surfaces||[]){
    if(!await exists(resolve(root,path)))errors.push("v0.6.1 durable requirement surface missing: "+path);
  }

  if(evidence?.schema!==1)errors.push("v0.6.1 reliability evidence schema must be 1");
  if(evidence?.chat!=="CHAT 17")errors.push("v0.6.1 reliability evidence must come from CHAT 17");
  if(evidence?.candidate!=="v0.6.1")errors.push("v0.6.1 reliability evidence candidate drift");

  const components=Array.isArray(evidence?.components)?evidence.components:[];
  const componentIds=components.map((item)=>item?.id);
  if(JSON.stringify(componentIds)!==JSON.stringify([...V061_RELIABILITY_COMPONENTS])){
    errors.push("v0.6.1 reliability component drift: expected="+JSON.stringify(V061_RELIABILITY_COMPONENTS)+" actual="+JSON.stringify(componentIds));
  }

  for(const item of components){
    if(!["PASS","BLOCKED","FAILED"].includes(item?.status))errors.push("v0.6.1 reliability component status invalid: "+String(item?.id));
    if(!nonEmpty(item?.canonical_doc))errors.push(String(item?.id)+": canonical_doc required");
    else if(!await exists(resolve(root,item.canonical_doc)))errors.push(String(item?.id)+": canonical_doc missing: "+item.canonical_doc);
    if(!/^[a-f0-9]{40}$/.test(String(item?.integrated_main_commit||"")))errors.push(String(item?.id)+": integrated_main_commit invalid");
    if(!Number.isInteger(item?.exact_main_verify_run)||item.exact_main_verify_run<1)errors.push(String(item?.id)+": exact_main_verify_run invalid");
    if(!nonEmpty(item?.evaluation_command))errors.push(String(item?.id)+": evaluation_command required");
    if(!Array.isArray(item?.assertions)||item.assertions.length<2||item.assertions.some((value)=>!nonEmpty(value)))errors.push(String(item?.id)+": assertions incomplete");
  }

  const reliabilityBlockers=components.filter((item)=>item?.status!=="PASS").map((item)=>item.id);
  const reliabilityDecision=reliabilityBlockers.length?"BLOCKED":"PASS";
  const passCount=components.filter((item)=>item?.status==="PASS").length;
  if(evidence?.reliability_verdict!==reliabilityDecision)errors.push("v0.6.1 reliability evidence verdict drift");
  if(config?.reliability?.observed_pass_count!==passCount||config?.reliability?.total!==components.length)errors.push("v0.6.1 reliability count drift");
  if(config?.reliability?.required_pass_count!==V061_RELIABILITY_COMPONENTS.length)errors.push("v0.6.1 reliability required pass count drift");
  if(config?.reliability?.verdict!==reliabilityDecision||config?.reliability_decision!==reliabilityDecision)errors.push("v0.6.1 reliability decision drift");

  const cross=evidence?.cross_platform_verification||{};
  if(cross.state!=="PASS")errors.push("v0.6.1 cross-platform verification evidence must be PASS");
  if(!/^[a-f0-9]{40}$/.test(String(cross.chat16_exact_main_commit||"")))errors.push("v0.6.1 cross-platform main commit invalid");
  if(!Number.isInteger(cross.chat16_exact_main_run)||cross.chat16_exact_main_run<1)errors.push("v0.6.1 cross-platform verify run invalid");
  const requiredCi=["minimum-versions","test (ubuntu-latest)","test (windows-latest)"];
  if(JSON.stringify(cross.required)!==JSON.stringify(requiredCi))errors.push("v0.6.1 cross-platform required jobs drift");
  if(JSON.stringify(config?.verification?.required_ci)!==JSON.stringify(requiredCi))errors.push("v0.6.1 readiness required CI drift");

  const v06Assessment=await assessV06ReleaseReadiness(v06Config,{root});
  if(!v06Assessment.ok)errors.push("v0.6 prerequisite readiness is internally invalid: "+v06Assessment.errors.join("; "));

  const prereq=evidence?.prerequisite_release||{};
  if(prereq.candidate!=="v0.6.0")errors.push("v0.6.1 prerequisite candidate must be v0.6.0");
  if(prereq.canonical_source!=="config/v0.6-release-readiness.json")errors.push("v0.6.1 prerequisite canonical source drift");
  if(prereq.required_state!=="READY")errors.push("v0.6.1 prerequisite required state must be READY");
  if(prereq.observed_state!==v06Assessment.decision)errors.push("v0.6.1 prerequisite observed state drift");
  if(JSON.stringify(prereq.blocker_ids||[])!==JSON.stringify(v06Assessment.blockers||[]))errors.push("v0.6.1 prerequisite blocker drift");

  const computed=[...reliabilityBlockers];
  if(v06Assessment.decision!=="READY")computed.push("V0_6_0_PREREQUISITE");

  const declared=(config?.release_blockers||[]).map((item)=>item.id);
  if(JSON.stringify(declared)!==JSON.stringify(computed)){
    errors.push("v0.6.1 release blocker drift: declared="+JSON.stringify(declared)+" computed="+JSON.stringify(computed));
  }
  for(const item of config?.release_blockers||[]){
    for(const field of ["id","category","status","required_state","current_state","canonical_source","reason","safe_next_action"]){
      if(!nonEmpty(item?.[field]))errors.push((item?.id||"unknown")+": "+field+" required");
    }
    if(item?.canonical_source&&!await exists(resolve(root,item.canonical_source)))errors.push(item.id+": canonical source missing: "+item.canonical_source);
  }

  const computedDecision=computed.length?"BLOCKED":"READY";
  if(config?.decision!==computedDecision)errors.push("v0.6.1 decision drift: declared="+String(config?.decision)+" computed="+computedDecision);

  const hold=config?.package_version_hold||{};
  const candidateVersion="0.6.1";
  if(hold.current!==pkg?.version)errors.push("v0.6.1 package version hold drift");
  if(hold.candidate!==candidateVersion)errors.push("v0.6.1 package version candidate drift");
  if(computedDecision==="BLOCKED"){
    if(hold.bump_authorized===true)errors.push("v0.6.1 package bump cannot be authorized while readiness is blocked");
    if(pkg?.version===candidateVersion)errors.push("blocked v0.6.1 candidate must not replace stable package version metadata");
  }else{
    if(pkg?.version!==candidateVersion)errors.push("READY v0.6.1 candidate requires package version "+candidateVersion);
    if(hold.bump_authorized!==true)errors.push("READY v0.6.1 candidate requires package bump authorization");
  }

  const promotion=config?.promotion||{};
  if(computedDecision==="BLOCKED"){
    if(promotion.stable_tag_authorized===true)errors.push("stable tag cannot be authorized while v0.6.1 is blocked");
    if(promotion.publication_authorized===true)errors.push("publication cannot be authorized while v0.6.1 is blocked");
  }

  if(!nonEmpty(config?.claim_language?.allowed)||!Array.isArray(config?.claim_language?.forbidden)||config.claim_language.forbidden.length<5)errors.push("v0.6.1 claim language boundaries required");
  if(!nonEmpty(evidence?.claim_boundary?.allowed)||!Array.isArray(evidence?.claim_boundary?.forbidden)||evidence.claim_boundary.forbidden.length<4)errors.push("v0.6.1 evidence claim boundary required");

  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    decision:computedDecision,
    reliability_decision:reliabilityDecision,
    blockers:Object.freeze(computed),
    blocker_count:computed.length,
    reliability_blockers:Object.freeze(reliabilityBlockers),
    canonical:Object.freeze({
      reliability_passed:passCount,
      reliability_total:components.length,
      v0_6_prerequisite:v06Assessment.decision,
      v0_6_blockers:Object.freeze([...(v06Assessment.blockers||[])]),
      package_version:pkg?.version||"UNKNOWN",
      cross_platform_verification:cross.state||"UNKNOWN",
      component_ids:Object.freeze([...componentIds]),
    }),
  });
}

export function buildV061ReadinessSnapshot({config,assessment}){
  if(!assessment?.ok)throw new Error("cannot snapshot invalid v0.6.1 release readiness");
  return Object.freeze({
    schema:1,
    candidate:config.candidate,
    reliability_decision:assessment.reliability_decision,
    decision:assessment.decision,
    blocker_count:assessment.blocker_count,
    blockers:assessment.blockers,
    reliability_blockers:assessment.reliability_blockers,
    canonical:assessment.canonical,
    package_bump_authorized:config.package_version_hold.bump_authorized===true,
    stable_tag_authorized:config.promotion.stable_tag_authorized===true,
    publication_authorized:config.promotion.publication_authorized===true,
    truth_boundary:"reliability PASS proves the v0.6.1 reliability feature set under repository gates; it does not authorize publication while prerequisite v0.6.0 readiness is BLOCKED",
  });
}

export async function readAndAssessV061ReleaseReadiness({root=resolve(import.meta.dirname,"../..")}={}){
  const config=JSON.parse(await readFile(resolve(root,"config/v0.6.1-release-readiness.json"),"utf8"));
  return {config,assessment:await assessV061ReleaseReadiness(config,{root})};
}
