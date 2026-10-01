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
    truth_boundary:"green validation of BLOCKED state != release authorization; READY still requires exact promoted-main verify + manual release gate",
  });
}

export async function readAndAssessV05ReleaseReadiness({root=resolve(import.meta.dirname,"../..")}={}){
  const config=JSON.parse(await readFile(resolve(root,"config/v0.5-release-readiness.json"),"utf8"));
  return {config,assessment:await assessV05ReleaseReadiness(config,{root})};
}
