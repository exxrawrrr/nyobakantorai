import { createHash } from "node:crypto";

import { executeMissionPlan } from "../mission-engine/orchestrator.mjs";
import {
  createRecoveryCheckpoint,
  persistRecoveryCheckpoint,
  chooseRecoveryProvider,
  normalizeRecoveryCheckpoint,
} from "../checkpoint-recovery/index.mjs";

export const MISSION_CONTROL_API=1;
export const MISSION_CONTROL_ACTIONS=Object.freeze(["CONTINUE","PAUSE","ESCALATE","STOP"]);
export const MISSION_CONTROL_QUEUE_STRATEGIES=Object.freeze(["FAIR_EMPLOYEE_ROUND_ROBIN"]);

const QUEUE_SET=new Set(MISSION_CONTROL_QUEUE_STRATEGIES);
const clean=(v,max=1000)=>String(v??"").trim().slice(0,max);
const assert=(c,m)=>{if(!c)throw new Error(m);};
const int=(v,l,{min=0,max=Number.MAX_SAFE_INTEGER}={})=>{
  const n=Number(v); assert(Number.isInteger(n)&&n>=min&&n<=max,`${l} must be an integer between ${min} and ${max}.`); return n;
};
const sortedUnique=(values,max=1000,lower=false)=>Object.freeze(
  [...new Set((Array.isArray(values)?values:[]).map(v=>clean(v,max)).filter(Boolean).map(v=>lower?v.toLowerCase():v))].sort()
);
function canonicalize(v){
  if(Array.isArray(v))return v.map(canonicalize);
  if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])]));
  if(typeof v==="number"&&Object.is(v,-0))return 0;
  return v;
}
const contentRef=(prefix,payload)=>`${prefix}:sha256:${createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex")}`;

function policyBody(p){
  return {
    schema:p.schema,id:p.id,queue_strategy:p.queue_strategy,
    max_parallel_tasks:p.max_parallel_tasks,max_parallel_per_employee:p.max_parallel_per_employee,
    max_batches_per_slice:p.max_batches_per_slice,max_wall_clock_ms:p.max_wall_clock_ms,
    max_total_attempts:p.max_total_attempts,checkpoint_on_pause:p.checkpoint_on_pause,
    adaptive:p.adaptive,recovery:p.recovery,stop_conditions:p.stop_conditions,
  };
}

export function normalizeMissionControlPolicy(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Mission Control policy must be an object.");
  assert(input.schema===1,"Mission Control policy schema must be 1.");
  const id=clean(input.id,120).toLowerCase();
  assert(/^[a-z][a-z0-9-]{1,119}$/.test(id),"Mission Control policy id must be a lowercase slug.");
  const queue=clean(input.queue_strategy,80).toUpperCase();
  assert(QUEUE_SET.has(queue),"Unsupported Mission Control queue strategy.");
  const maxParallel=int(input.max_parallel_tasks,"max_parallel_tasks",{min:1,max:8});
  const maxPerEmployee=int(input.max_parallel_per_employee,"max_parallel_per_employee",{min:1,max:8});
  assert(maxPerEmployee<=maxParallel,"max_parallel_per_employee cannot exceed max_parallel_tasks.");
  const a=input.adaptive||{},r=input.recovery||{},s=input.stop_conditions||{};
  const value=Object.freeze({
    schema:1,id,queue_strategy:queue,max_parallel_tasks:maxParallel,max_parallel_per_employee:maxPerEmployee,
    max_batches_per_slice:int(input.max_batches_per_slice,"max_batches_per_slice",{min:1,max:1000}),
    max_wall_clock_ms:int(input.max_wall_clock_ms,"max_wall_clock_ms",{min:1000,max:86_400_000}),
    max_total_attempts:int(input.max_total_attempts,"max_total_attempts",{min:1,max:10_000}),
    checkpoint_on_pause:input.checkpoint_on_pause===true,
    adaptive:Object.freeze({
      enabled:a.enabled===true,
      max_new_tasks:int(a.max_new_tasks??0,"adaptive.max_new_tasks",{min:0,max:32}),
      max_new_edges:int(a.max_new_edges??0,"adaptive.max_new_edges",{min:0,max:64}),
      owner_review_required:a.owner_review_required===true,
      automatic_apply_allowed:a.automatic_apply_allowed===true,
      authority_widening_allowed:a.authority_widening_allowed===true,
    }),
    recovery:Object.freeze({
      checkpoint_reroute_requires_recovery_policy:r.checkpoint_reroute_requires_recovery_policy===true,
      max_provider_reroutes_per_task:int(r.max_provider_reroutes_per_task??0,"recovery.max_provider_reroutes_per_task",{min:0,max:8}),
    }),
    stop_conditions:Object.freeze({
      owner_cancel:s.owner_cancel===true,cost_governor_stop:s.cost_governor_stop===true,
      attempt_ceiling_escalates:s.attempt_ceiling_escalates===true,
    }),
  });
  assert(value.checkpoint_on_pause,"Mission Control must checkpoint on pause.");
  assert(value.adaptive.owner_review_required,"Adaptive planning must require owner review.");
  assert(!value.adaptive.automatic_apply_allowed,"Adaptive planning automatic apply must remain disabled.");
  assert(!value.adaptive.authority_widening_allowed,"Adaptive planning authority widening must remain disabled.");
  assert(value.recovery.checkpoint_reroute_requires_recovery_policy,"Checkpoint reroute must require recovery policy.");
  assert(value.stop_conditions.owner_cancel&&value.stop_conditions.cost_governor_stop,"Owner cancel and Cost Governor STOP must remain stop conditions.");
  return Object.freeze({...value,policy_ref:contentRef("mission-control-policy",policyBody(value))});
}

export function createBalancedQueueSelector(policyInput){
  const policy=normalizeMissionControlPolicy(policyInput);
  const dispatches=new Map();
  const fn=async({runnable_task_ids=[],tasks=[],attempts=[],max_concurrency=policy.max_parallel_tasks}={})=>{
    const runnable=sortedUnique(runnable_task_ids,160);
    assert(runnable.length>0,"Balanced queue selector requires runnable tasks.");
    const taskById=new Map((Array.isArray(tasks)?tasks:[]).map(t=>[clean(t.task_id,160),t]));
    for(const id of runnable)assert(taskById.has(id),`Runnable task is missing from task snapshot: ${id}`);
    const attemptCounts=new Map();
    for(const a of Array.isArray(attempts)?attempts:[]){
      const id=clean(a.task_id,160); attemptCounts.set(id,(attemptCounts.get(id)||0)+1);
    }
    const candidates=runnable.map(id=>{
      const t=taskById.get(id),employee=clean(t.employee_id,80).toLowerCase();
      return {id,employee,dispatches:dispatches.get(employee)||0,attempts:attemptCounts.get(id)||0};
    }).sort((a,b)=>a.dispatches-b.dispatches||a.attempts-b.attempts||a.employee.localeCompare(b.employee)||a.id.localeCompare(b.id));
    const limit=Math.min(policy.max_parallel_tasks,int(max_concurrency,"max_concurrency",{min:1,max:8}),runnable.length);
    const selected=[],inBatch=new Map(),remaining=[...candidates];
    for(let round=0;round<policy.max_parallel_per_employee&&selected.length<limit;round+=1){
      const usedThisRound=new Set();
      for(let i=0;i<remaining.length&&selected.length<limit;i+=1){
        const c=remaining[i];
        if(usedThisRound.has(c.employee))continue;
        const n=inBatch.get(c.employee)||0;
        if(n>=policy.max_parallel_per_employee)continue;
        selected.push(c.id);
        inBatch.set(c.employee,n+1);
        usedThisRound.add(c.employee);
        remaining.splice(i,1);
        i-=1;
      }
    }
    assert(selected.length>0,"Queue policy produced no dispatchable task.");
    for(const id of selected){
      const employee=clean(taskById.get(id).employee_id,80).toLowerCase();
      dispatches.set(employee,(dispatches.get(employee)||0)+1);
    }
    return Object.freeze(selected);
  };
  fn.snapshot=()=>Object.freeze({strategy:policy.queue_strategy,dispatches:Object.freeze(Object.fromEntries([...dispatches.entries()].sort()))});
  return fn;
}

export function assessMissionSliceBoundary({policy:policyInput,batch_count=0,elapsed_ms=0,attempt_count=0}={}){
  const policy=normalizeMissionControlPolicy(policyInput);
  const batch=int(batch_count,"batch_count",{min:0,max:1_000_000});
  const elapsed=int(elapsed_ms,"elapsed_ms",{min:0,max:31_536_000_000});
  const attempts=int(attempt_count,"attempt_count",{min:0,max:10_000_000});
  let action="CONTINUE"; const reasons=[];
  if(attempts>=policy.max_total_attempts){
    action=policy.stop_conditions.attempt_ceiling_escalates?"ESCALATE":"PAUSE";
    reasons.push("TOTAL_ATTEMPT_CEILING");
  }else{
    if(batch>=policy.max_batches_per_slice)reasons.push("BATCH_SLICE_LIMIT");
    if(elapsed>=policy.max_wall_clock_ms)reasons.push("WALL_CLOCK_SLICE_LIMIT");
    if(reasons.length)action="PAUSE";
  }
  const body={schema:1,policy_ref:policy.policy_ref,action,reason_codes:Object.freeze(reasons),batch_count:batch,elapsed_ms:elapsed,attempt_count:attempts};
  return Object.freeze({...body,decision_ref:contentRef("mission-control-decision",body)});
}

export function createAdaptivePlanProposal(input={},{policy:policyInput}={}){
  const policy=normalizeMissionControlPolicy(policyInput);
  assert(policy.adaptive.enabled,"Adaptive planning is disabled.");
  const missionId=clean(input.mission_id,160),reason=clean(input.reason,2000),evidence=sortedUnique(input.evidence_refs);
  assert(missionId&&reason,"Adaptive proposal requires mission_id and reason.");
  assert(evidence.length>0,"Adaptive proposal requires evidence_refs.");
  const baseline=sortedUnique(input.authority_baseline,160,true),allowed=new Set(baseline);
  const tasks=(Array.isArray(input.new_tasks)?input.new_tasks:[]).map((t,i)=>{
    assert(t&&typeof t==="object"&&!Array.isArray(t),`new_tasks[${i}] must be an object.`);
    const taskId=clean(t.task_id,160),objective=clean(t.objective,4000),employeeId=clean(t.employee_id,80).toLowerCase();
    assert(taskId&&objective&&employeeId,`new_tasks[${i}] requires task_id, objective and employee_id.`);
    const caps=sortedUnique(t.required_capabilities,160,true);
    assert(caps.every(x=>allowed.has(x)),`Adaptive task ${taskId} requests capability outside authority baseline.`);
    return Object.freeze({task_id:taskId,objective,employee_id:employeeId,required_capabilities:caps,depends_on:sortedUnique(t.depends_on,160)});
  });
  assert(tasks.length<=policy.adaptive.max_new_tasks,"Adaptive proposal exceeds max_new_tasks.");
  assert(new Set(tasks.map(x=>x.task_id)).size===tasks.length,"Adaptive proposal task IDs must be unique.");
  const edges=(Array.isArray(input.new_edges)?input.new_edges:[]).map((e,i)=>{
    assert(e&&typeof e==="object"&&!Array.isArray(e),`new_edges[${i}] must be an object.`);
    const from=clean(e.from,160),to=clean(e.to,160); assert(from&&to&&from!==to,`new_edges[${i}] must contain distinct from/to.`);
    return Object.freeze({from,to});
  });
  assert(edges.length<=policy.adaptive.max_new_edges,"Adaptive proposal exceeds max_new_edges.");
  const body=Object.freeze({
    schema:1,mission_id:missionId,reason,evidence_refs:evidence,authority_baseline:baseline,
    new_tasks:Object.freeze(tasks),new_edges:Object.freeze(edges),
    owner_review_required:true,automatic_apply_allowed:false,authority_widening_allowed:false,
  });
  return Object.freeze({...body,proposal_ref:contentRef("mission-plan-proposal",body)});
}

export function buildCheckpointAwareRerouteDecision({policy:policyInput,recovery_policy,checkpoint,task_id}={}){
  const policy=normalizeMissionControlPolicy(policyInput);
  const cp=normalizeRecoveryCheckpoint(checkpoint),taskId=clean(task_id,160);
  assert(taskId,"checkpoint reroute task_id is required.");
  const attempts=cp.attempts.filter(a=>a.task_id===taskId);
  assert(attempts.length>0,"Checkpoint reroute requires prior task Attempt history.");
  const choice=chooseRecoveryProvider({policy:recovery_policy,checkpoint:cp,task_id:taskId});
  const changes=Math.max(0,new Set(choice.provider_history).size-1);
  let action=choice.action,providerId=choice.action==="FALLBACK_PROVIDER"?choice.fallback_provider:choice.current_provider;
  const reasons=[];
  if(choice.action==="FALLBACK_PROVIDER"&&changes>=policy.recovery.max_provider_reroutes_per_task){
    action="ESCALATE"; providerId=null; reasons.push("PROVIDER_REROUTE_LIMIT");
  }else if(choice.action==="RETRY_SAME_PROVIDER"){
    reasons.push("NO_UNUSED_ALLOWLISTED_FALLBACK");
  }
  const body={schema:1,checkpoint_ref:cp.checkpoint_ref,task_id:taskId,action,provider_id:providerId,provider_history:choice.provider_history,reason_codes:Object.freeze(reasons)};
  return Object.freeze({...body,decision_ref:contentRef("checkpoint-reroute",body)});
}

function normalizeHardeningPolicy(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input)&&input.schema===1,"Sandbox hardening policy schema must be 1.");
  const fs=input.filesystem||{},b=input.browser||{},n=input.network||{},r=input.resources||{},c=input.credentials||{},claim=input.claim_boundary||{};
  const p=Object.freeze({
    schema:1,id:clean(input.id,120).toLowerCase(),
    filesystem:Object.freeze({mode:clean(fs.mode,80).toUpperCase(),production_repo_read_only:fs.production_repo_read_only===true,host_home_access_allowed:fs.host_home_access_allowed===true}),
    browser:Object.freeze({mode:clean(b.mode,80).toUpperCase(),user_profile_reuse_allowed:b.user_profile_reuse_allowed===true,credential_store_access_allowed:b.credential_store_access_allowed===true}),
    network:Object.freeze({mode:clean(n.mode,80).toUpperCase(),allowed_hosts:sortedUnique(n.allowed_hosts,253,true),max_hosts:int(n.max_hosts,"network.max_hosts",{min:0,max:128}),dns_rebinding_protection_required:n.dns_rebinding_protection_required===true}),
    resources:Object.freeze({max_processes:int(r.max_processes,"resources.max_processes",{min:1,max:1024}),max_workspace_bytes:int(r.max_workspace_bytes,"resources.max_workspace_bytes",{min:1,max:1_099_511_627_776})}),
    credentials:Object.freeze({delivery:clean(c.delivery,80).toUpperCase(),task_payload_values_allowed:c.task_payload_values_allowed===true,environment_secret_injection_allowed:c.environment_secret_injection_allowed===true}),
    claim_boundary:Object.freeze({application_level_guard:claim.application_level_guard===true,os_container_isolation:claim.os_container_isolation===true}),
  });
  assert(p.id&&p.filesystem.mode==="TEMP_WORKSPACE_ONLY"&&p.filesystem.production_repo_read_only&&!p.filesystem.host_home_access_allowed,"Hardened filesystem policy is invalid.");
  assert(p.browser.mode==="EPHEMERAL_PROFILE_ONLY"&&!p.browser.user_profile_reuse_allowed&&!p.browser.credential_store_access_allowed,"Hardened browser policy is invalid.");
  assert(p.network.mode==="ALLOWLIST_ONLY"&&p.network.dns_rebinding_protection_required,"Hardened network policy is invalid.");
  assert(p.credentials.delivery==="REFERENCE_ONLY"&&!p.credentials.task_payload_values_allowed&&!p.credentials.environment_secret_injection_allowed,"Hardened credential policy is invalid.");
  assert(p.claim_boundary.application_level_guard&&!p.claim_boundary.os_container_isolation,"Hardening claim boundary must remain application-level only.");
  return p;
}
function hardeningBody(v){return {schema:v.schema,policy:v.policy,allowed:v.allowed,reason_codes:v.reason_codes,mission_id:v.mission_id,task_id:v.task_id,filesystem:v.filesystem,browser:v.browser,network:v.network,resources:v.resources,credentials:v.credentials};}

export function assessSandboxHardening(policyInput,input={}){
  const policy=normalizeHardeningPolicy(policyInput);
  const missionId=clean(input.mission_id,160),taskId=clean(input.task_id,160);
  assert(missionId&&taskId,"Sandbox hardening declaration requires mission_id and task_id.");
  const fs=input.filesystem||{},b=input.browser||{},n=input.network||{},r=input.resources||{},c=input.credentials||{};
  const declaration=Object.freeze({
    filesystem:Object.freeze({temporary_workspace_only:fs.temporary_workspace_only===true,production_repo_read_only:fs.production_repo_read_only===true,host_home_access:fs.host_home_access===true}),
    browser:Object.freeze({ephemeral_profile:b.ephemeral_profile===true,user_profile_reused:b.user_profile_reused===true,credential_store_access:b.credential_store_access===true}),
    network:Object.freeze({mode:clean(n.mode,80).toUpperCase(),hosts:sortedUnique(n.hosts,253,true),dns_rebinding_protection:n.dns_rebinding_protection===true}),
    resources:Object.freeze({projected_processes:int(r.projected_processes??0,"resources.projected_processes",{min:0,max:1_000_000}),projected_workspace_bytes:int(r.projected_workspace_bytes??0,"resources.projected_workspace_bytes",{min:0,max:1_099_511_627_776})}),
    credentials:Object.freeze({delivery:clean(c.delivery,80).toUpperCase(),task_payload_values:c.task_payload_values===true,environment_secret_injection:c.environment_secret_injection===true}),
  });
  const reasons=[];
  if(!declaration.filesystem.temporary_workspace_only)reasons.push("TEMP_WORKSPACE_NOT_PROVEN");
  if(!declaration.filesystem.production_repo_read_only)reasons.push("PRODUCTION_REPO_READ_ONLY_NOT_PROVEN");
  if(declaration.filesystem.host_home_access)reasons.push("HOST_HOME_ACCESS_FORBIDDEN");
  if(!declaration.browser.ephemeral_profile)reasons.push("EPHEMERAL_BROWSER_PROFILE_NOT_PROVEN");
  if(declaration.browser.user_profile_reused)reasons.push("USER_BROWSER_PROFILE_REUSE_FORBIDDEN");
  if(declaration.browser.credential_store_access)reasons.push("BROWSER_CREDENTIAL_STORE_ACCESS_FORBIDDEN");
  if(declaration.network.mode!==policy.network.mode)reasons.push("NETWORK_MODE_MISMATCH");
  if(declaration.network.hosts.length>policy.network.max_hosts)reasons.push("NETWORK_HOST_LIMIT_EXCEEDED");
  if(declaration.network.hosts.some(h=>!policy.network.allowed_hosts.includes(h)))reasons.push("NETWORK_HOST_NOT_ALLOWLISTED");
  if(!declaration.network.dns_rebinding_protection)reasons.push("DNS_REBINDING_PROTECTION_REQUIRED");
  if(declaration.resources.projected_processes>policy.resources.max_processes)reasons.push("PROCESS_LIMIT_EXCEEDED");
  if(declaration.resources.projected_workspace_bytes>policy.resources.max_workspace_bytes)reasons.push("WORKSPACE_SIZE_LIMIT_EXCEEDED");
  if(declaration.credentials.delivery!==policy.credentials.delivery)reasons.push("CREDENTIAL_DELIVERY_MUST_BE_REFERENCE_ONLY");
  if(declaration.credentials.task_payload_values)reasons.push("CREDENTIAL_VALUE_IN_TASK_PAYLOAD");
  if(declaration.credentials.environment_secret_injection)reasons.push("SECRET_ENV_INJECTION_FORBIDDEN");
  const value=Object.freeze({schema:1,policy,allowed:reasons.length===0,reason_codes:Object.freeze([...new Set(reasons)]),mission_id:missionId,task_id:taskId,...declaration});
  return Object.freeze({...value,decision_ref:contentRef("sandbox-hardening",hardeningBody(value))});
}
export function validateSandboxHardeningDecision(input={}){
  assert(/^sandbox-hardening:sha256:[a-f0-9]{64}$/.test(clean(input.decision_ref,1000)),"Sandbox hardening decision_ref is invalid.");
  assert(input.decision_ref===contentRef("sandbox-hardening",hardeningBody(input)),"Sandbox hardening decision digest mismatch.");
  normalizeHardeningPolicy(input.policy);
  return true;
}

export async function executeControlledMission(planInput,{policy:policyInput,resolveRuntime,clock=()=>new Date().toISOString(),recovery=null,workspace=null,shouldCancel=null,...options}={}){
  const policy=normalizeMissionControlPolicy(policyInput);
  assert(typeof resolveRuntime==="function","Mission Control requires resolveRuntime().");
  const queue=createBalancedQueueSelector(policy),startedAt=clock();
  assert(!Number.isNaN(Date.parse(startedAt)),"Mission Control clock must return a valid timestamp.");
  let batches=0,last=assessMissionSliceBoundary({policy,batch_count:0,elapsed_ms:0,attempt_count:0});
  const selectRunnableBatch=async ctx=>{const chosen=await queue({...ctx,max_concurrency:Math.min(ctx.max_concurrency,policy.max_parallel_tasks)});batches+=1;return chosen;};
  const shouldPause=async ctx=>{
    if(ctx.tasks.some(t=>["FAILED","PARTIAL","BLOCKED"].includes(t.state)))return false;
    const elapsed=Math.max(0,Date.parse(clock())-Date.parse(startedAt));
    last=assessMissionSliceBoundary({policy,batch_count:batches,elapsed_ms:elapsed,attempt_count:ctx.attempts.length});
    return ["PAUSE","ESCALATE"].includes(last.action)?Object.freeze({action:last.action,reason_codes:last.reason_codes,decision_ref:last.decision_ref}):false;
  };
  const result=await executeMissionPlan(planInput,{...options,resolveRuntime,recovery,clock,maxConcurrency:policy.max_parallel_tasks,selectRunnableBatch,shouldPause,shouldCancel:typeof shouldCancel==="function"?shouldCancel:()=>false});
  let checkpoint=null,checkpointArtifact=null;
  if(result.mission.state==="PAUSED"&&policy.checkpoint_on_pause){
    checkpoint=createRecoveryCheckpoint(result,{recovery_cycle:result.recovery?.recovery_cycle??0,reason:`Mission Control ${last.action}: ${last.reason_codes.join(",")||"slice boundary"}`,clock});
    if(workspace)checkpointArtifact=persistRecoveryCheckpoint({workspace,checkpoint,created_by:"system:mission-control"});
  }
  const controlBody={schema:1,policy_ref:policy.policy_ref,action:result.mission.state==="PAUSED"?last.action:(result.cancelled?"STOP":"CONTINUE"),reason_codes:result.mission.state==="PAUSED"?last.reason_codes:Object.freeze([]),batches_dispatched:batches,attempts_observed:result.attempts.length,queue:queue.snapshot(),paused:result.mission.state==="PAUSED",cancelled:result.cancelled===true};
  return Object.freeze({...result,control:Object.freeze({...controlBody,control_ref:contentRef("mission-control-run",controlBody)}),checkpoint,checkpoint_artifact:checkpointArtifact});
}
