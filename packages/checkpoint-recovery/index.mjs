import { createHash } from "node:crypto";
import { normalizeMission, normalizeExecutionAttempt } from "../mission-engine/contracts.mjs";
import { normalizeMissionPlan } from "../mission-engine/planner.mjs";
import { normalizeTaskNode } from "../task-registry/task-node.mjs";

export const CHECKPOINT_SCHEMA=1;
export const RECOVERY_POLICY_SCHEMA=1;
export const CHECKPOINT_REF=/^checkpoint:sha256:[a-f0-9]{64}$/;

const SUCCESS_STATES=new Set(["SUCCEEDED","VERIFIED"]);
const RECOVERABLE_TASK_STATES=new Set(["FAILED","PARTIAL","BLOCKED"]);
const clean=(value,max=4000)=>String(value??"").trim().slice(0,max);
const unique=(values,max=1000)=>Object.freeze([...new Set((Array.isArray(values)?values:[]).map(v=>clean(v,max)).filter(Boolean))]);

function assert(condition,message){if(!condition)throw new Error(message);}
function validTimestamp(value){return typeof value==="string"&&value.trim()&&!Number.isNaN(Date.parse(value));}
function canonicalize(value){
  if(value===null||typeof value==="string"||typeof value==="boolean")return value;
  if(typeof value==="number"){
    assert(Number.isFinite(value),"Checkpoint canonical JSON forbids non-finite numbers.");
    return Object.is(value,-0)?0:value;
  }
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonicalize(value[k])]));
  }
  throw new Error("Checkpoint canonical JSON forbids type: "+typeof value);
}
export function canonicalCheckpointJson(value){return JSON.stringify(canonicalize(value));}
export function checkpointSha256(value){return createHash("sha256").update(String(value),"utf8").digest("hex");}

export function normalizeRecoveryPolicy(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Recovery policy must be an object.");
  assert(input.schema===RECOVERY_POLICY_SCHEMA,"Recovery policy schema must be 1.");
  const maxAttempts=Number(input.max_attempts_per_task??3);
  const maxCycles=Number(input.max_recovery_cycles??2);
  assert(Number.isInteger(maxAttempts)&&maxAttempts>=1&&maxAttempts<=10,"max_attempts_per_task must be 1..10.");
  assert(Number.isInteger(maxCycles)&&maxCycles>=1&&maxCycles<=5,"max_recovery_cycles must be 1..5.");
  const retryable=unique(input.retryable_error_categories,120).map(x=>x.toUpperCase());
  assert(retryable.length>0,"Recovery policy requires retryable_error_categories.");

  const fallback={};
  for(const [from,values] of Object.entries(input.provider_fallbacks||{})){
    const source=clean(from,120).toLowerCase();
    assert(source,"Recovery fallback provider source cannot be empty.");
    const targets=unique(values,120).map(x=>x.toLowerCase());
    assert(targets.every(x=>x!==source),"Recovery fallback cannot point to the same provider.");
    fallback[source]=Object.freeze(targets);
  }

  const browser=input.browser||{};
  assert(browser.strategy==="NEW_ISOLATED_SESSION","Browser recovery strategy must be NEW_ISOLATED_SESSION.");
  assert(browser.reuse_user_profile_forbidden===true,"Browser recovery must forbid user-profile reuse.");
  const maxRestarts=Number(browser.max_session_restarts??1);
  assert(Number.isInteger(maxRestarts)&&maxRestarts>=0&&maxRestarts<=3,"browser.max_session_restarts must be 0..3.");

  return Object.freeze({
    schema:RECOVERY_POLICY_SCHEMA,
    max_attempts_per_task:maxAttempts,
    max_recovery_cycles:maxCycles,
    retryable_error_categories:Object.freeze(retryable),
    provider_fallbacks:Object.freeze(fallback),
    browser:Object.freeze({
      strategy:"NEW_ISOLATED_SESSION",
      reuse_user_profile_forbidden:true,
      max_session_restarts:maxRestarts,
    }),
  });
}

function checkpointBody(input={}){
  assert(input.schema===CHECKPOINT_SCHEMA,"Checkpoint schema must be 1.");
  const createdAt=clean(input.created_at,80);
  assert(validTimestamp(createdAt),"Checkpoint created_at must be valid.");
  const mission=normalizeMission(input.mission);
  const tasks=Object.freeze((Array.isArray(input.tasks)?input.tasks:[]).map(normalizeTaskNode));
  const attempts=Object.freeze((Array.isArray(input.attempts)?input.attempts:[]).map(normalizeExecutionAttempt));
  assert(tasks.length===mission.task_ids.length,"Checkpoint task count must match Mission task_ids.");
  assert(tasks.every(t=>t.mission_id===mission.mission_id),"Checkpoint TaskNode Mission mismatch.");
  const taskIds=new Set(tasks.map(t=>t.task_id));
  assert(taskIds.size===tasks.length,"Checkpoint TaskNode IDs must be unique.");
  for(const id of mission.task_ids)assert(taskIds.has(id),"Checkpoint missing Mission TaskNode: "+id);
  for(const attempt of attempts)assert(taskIds.has(attempt.task_id),"Checkpoint Attempt references missing TaskNode.");

  const completed=tasks.filter(t=>SUCCESS_STATES.has(t.state)).map(t=>t.task_id).sort();
  const declaredCompleted=[...unique(input.completed_task_ids,160)].sort();
  assert(JSON.stringify(completed)===JSON.stringify(declaredCompleted),"Checkpoint completed_task_ids drift from TaskNode states.");

  const events=Object.freeze((Array.isArray(input.events)?input.events:[]).map(e=>Object.freeze(structuredClone(e))));
  const cycle=Number(input.recovery_cycle??0);
  assert(Number.isInteger(cycle)&&cycle>=0,"Checkpoint recovery_cycle must be >=0.");

  return Object.freeze({
    schema:CHECKPOINT_SCHEMA,
    mission,
    tasks,
    attempts,
    completed_task_ids:Object.freeze(completed),
    events,
    recovery_cycle:cycle,
    reason:clean(input.reason||"BOUNDED_FAILURE",160).toUpperCase(),
    created_at:new Date(createdAt).toISOString(),
  });
}

export function createRecoveryCheckpoint(result={},{
  reason="BOUNDED_FAILURE",
  recovery_cycle=0,
  clock=()=>new Date().toISOString(),
}={}){
  assert(result?.mission&&Array.isArray(result.tasks)&&Array.isArray(result.attempts),"Mission result is required for checkpoint.");
  const body=checkpointBody({
    schema:CHECKPOINT_SCHEMA,
    mission:result.mission,
    tasks:result.tasks,
    attempts:result.attempts,
    completed_task_ids:result.tasks.filter(t=>SUCCESS_STATES.has(t.state)).map(t=>t.task_id),
    events:Array.isArray(result.events)?result.events:[],
    recovery_cycle,
    reason,
    created_at:clock(),
  });
  const sha=checkpointSha256(canonicalCheckpointJson(body));
  return Object.freeze({...body,checkpoint_sha256:sha,checkpoint_ref:"checkpoint:sha256:"+sha});
}

export function normalizeRecoveryCheckpoint(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Recovery checkpoint must be an object.");
  const sha=clean(input.checkpoint_sha256,64);
  const ref=clean(input.checkpoint_ref,1000);
  assert(/^[a-f0-9]{64}$/.test(sha),"Checkpoint checksum is invalid.");
  assert(CHECKPOINT_REF.test(ref),"Checkpoint ref is invalid.");
  const body=checkpointBody(input);
  const computed=checkpointSha256(canonicalCheckpointJson(body));
  assert(computed===sha,"Checkpoint checksum mismatch.");
  assert(ref==="checkpoint:sha256:"+sha,"Checkpoint ref/checksum mismatch.");
  return Object.freeze({...body,checkpoint_sha256:sha,checkpoint_ref:ref});
}

function attemptsForTask(checkpoint,taskId){
  return checkpoint.attempts.filter(a=>a.task_id===taskId).sort((a,b)=>a.ordinal-b.ordinal);
}
function latestAttempt(checkpoint,taskId){
  const list=attemptsForTask(checkpoint,taskId);
  return list.length?list[list.length-1]:null;
}
function retryable(policy,attempt){
  return Boolean(attempt&&policy.retryable_error_categories.includes(clean(attempt.error_category,120).toUpperCase()));
}

export function chooseRecoveryProvider({policy:policyInput,checkpoint,task_id}={}){
  const policy=normalizeRecoveryPolicy(policyInput);
  const cp=normalizeRecoveryCheckpoint(checkpoint);
  const history=attemptsForTask(cp,task_id).map(a=>a.runtime.provider);
  assert(history.length>0,"Provider recovery requires a previous Attempt.");
  const current=history[history.length-1];
  const allowed=policy.provider_fallbacks[current]||[];
  const next=allowed.find(provider=>!history.includes(provider))||null;
  return Object.freeze({
    current_provider:current,
    provider_history:Object.freeze(history),
    fallback_provider:next,
    action:next?"FALLBACK_PROVIDER":"RETRY_SAME_PROVIDER",
  });
}

export function buildRecoverySeed(planInput,checkpointInput,policyInput){
  const plan=normalizeMissionPlan(planInput);
  const checkpoint=normalizeRecoveryCheckpoint(checkpointInput);
  const policy=normalizeRecoveryPolicy(policyInput);
  assert(checkpoint.mission.mission_id===plan.mission.mission_id,"Checkpoint Mission does not match plan.");
  assert(["PARTIAL","FAILED","BLOCKED"].includes(checkpoint.mission.state),"Checkpoint Mission state is not a safe recovery boundary.");
  assert(!checkpoint.tasks.some((task)=>task.state==="RUNNING"),"Checkpoint cannot resume while a TaskNode is RUNNING.");
  assert(!checkpoint.attempts.some((attempt)=>attempt.state==="RUNNING"),"Checkpoint cannot resume while an Execution Attempt is RUNNING.");
  assert(checkpoint.recovery_cycle<policy.max_recovery_cycles,"Recovery cycle limit reached.");

  const planIds=[...plan.graph.task_ids].sort();
  const cpIds=checkpoint.tasks.map(t=>t.task_id).sort();
  assert(JSON.stringify(planIds)===JSON.stringify(cpIds),"Checkpoint TaskNode set does not match plan.");

  const recoveryTasks=[];
  const preservedCompleted=[];
  const pendingDependencyReset=[];
  const stopped=[];

  for(const task of checkpoint.tasks){
    if(SUCCESS_STATES.has(task.state)){
      preservedCompleted.push(task.task_id);
      continue;
    }

    const attempts=attemptsForTask(checkpoint,task.task_id);
    if(task.state==="BLOCKED"&&task.blocking?.kind==="DEPENDENCY"&&attempts.length===0){
      pendingDependencyReset.push(task.task_id);
      continue;
    }

    if(RECOVERABLE_TASK_STATES.has(task.state)){
      const latest=latestAttempt(checkpoint,task.task_id);
      if(!latest||!retryable(policy,latest)||attempts.length>=policy.max_attempts_per_task){
        stopped.push(Object.freeze({
          task_id:task.task_id,
          state:task.state,
          reason:!latest?"NO_ATTEMPT_TO_RECOVER":attempts.length>=policy.max_attempts_per_task?"ATTEMPT_LIMIT_REACHED":"ERROR_CATEGORY_NOT_RETRYABLE",
          latest_error_category:latest?.error_category||null,
        }));
        continue;
      }
      recoveryTasks.push(Object.freeze({
        task_id:task.task_id,
        previous_attempt_id:latest.attempt_id,
        previous_provider:latest.runtime.provider,
        attempt_count:attempts.length,
        provider_recovery:chooseRecoveryProvider({policy,checkpoint,task_id:task.task_id}),
      }));
    }
  }

  assert(stopped.length===0,"Checkpoint contains non-recoverable failed work: "+stopped.map(x=>x.task_id+":"+x.reason).join(", "));

  return Object.freeze({
    schema:1,
    checkpoint_ref:checkpoint.checkpoint_ref,
    recovery_cycle:checkpoint.recovery_cycle+1,
    mission:checkpoint.mission,
    tasks:checkpoint.tasks,
    attempts:checkpoint.attempts,
    events:checkpoint.events,
    completed_task_ids:Object.freeze(preservedCompleted.sort()),
    recovery_tasks:Object.freeze(recoveryTasks),
    dependency_reset_task_ids:Object.freeze(pendingDependencyReset.sort()),
  });
}

export function buildBrowserRecoveryRequest({
  checkpoint_ref,
  task_id,
  previous_session_ref,
  restart_count=0,
  policy:policyInput,
}={}){
  const policy=normalizeRecoveryPolicy(policyInput);
  assert(CHECKPOINT_REF.test(clean(checkpoint_ref,1000)),"Browser recovery requires valid checkpoint_ref.");
  const taskId=clean(task_id,160);
  const previous=clean(previous_session_ref,512);
  assert(taskId,"Browser recovery task_id is required.");
  assert(previous,"Browser recovery previous_session_ref is required.");
  assert(Number.isInteger(restart_count)&&restart_count>=0,"Browser recovery restart_count must be >=0.");
  assert(restart_count<policy.browser.max_session_restarts,"Browser recovery session restart limit reached.");
  return Object.freeze({
    schema:1,
    strategy:"NEW_ISOLATED_SESSION",
    checkpoint_ref,
    task_id:taskId,
    previous_session_ref:previous,
    restart_ordinal:restart_count+1,
    constraints:Object.freeze({
      reuse_previous_session:false,
      reuse_user_profile:false,
      carry_credentials:false,
    }),
  });
}

export async function recoverBrowserSession(requestInput,{open_isolated_session}={}){
  assert(typeof open_isolated_session==="function","Browser recovery requires open_isolated_session().");
  const request=Object.freeze(structuredClone(requestInput));
  assert(request?.strategy==="NEW_ISOLATED_SESSION","Unsupported browser recovery strategy.");
  assert(request?.constraints?.reuse_previous_session===false,"Browser recovery cannot reuse previous session.");
  assert(request?.constraints?.reuse_user_profile===false,"Browser recovery cannot reuse user profile.");
  assert(request?.constraints?.carry_credentials===false,"Browser recovery cannot carry credentials.");
  const opened=await open_isolated_session(request);
  assert(opened&&typeof opened==="object"&&!Array.isArray(opened),"Browser recovery opener must return session metadata.");
  const sessionRef=clean(opened.session_ref,512);
  assert(sessionRef&&sessionRef!==request.previous_session_ref,"Browser recovery must create a new session_ref.");
  assert(opened.isolated===true,"Recovered browser session must be isolated.");
  assert(opened.user_profile_reused===false,"Recovered browser session must not reuse user profile.");
  assert(opened.credentials_carried===false,"Recovered browser session must not carry credentials.");
  return Object.freeze({
    schema:1,
    recovered:true,
    checkpoint_ref:request.checkpoint_ref,
    task_id:request.task_id,
    previous_session_ref:request.previous_session_ref,
    session_ref:sessionRef,
    restart_ordinal:request.restart_ordinal,
    isolated:true,
    user_profile_reused:false,
    credentials_carried:false,
  });
}


export function persistRecoveryCheckpoint({workspace,checkpoint,created_by="system:checkpoint-recovery"}={}){
  assert(workspace&&typeof workspace.put==="function","Checkpoint persistence requires Artifact Workspace.");
  const cp=normalizeRecoveryCheckpoint(checkpoint);
  const artifact=workspace.put({
    artifact_id:"recovery-checkpoint-"+cp.mission.mission_id.toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120),
    artifact_type:"EVIDENCE",
    media_type:"application/json",
    payload:{encoding:"utf8",data:JSON.stringify(cp)},
    ownership:{mission_id:cp.mission.mission_id,task_id:null,attempt_id:null,employee_id:null},
    provenance:{
      source_kind:"SYSTEM",
      source_refs:[cp.checkpoint_ref],
      created_by:clean(created_by,120)||"system:checkpoint-recovery",
    },
  });
  return Object.freeze({
    checkpoint_ref:cp.checkpoint_ref,
    artifact_ref:artifact.artifact_ref,
    artifact_version:artifact.version,
  });
}

export function readRecoveryCheckpointArtifact(workspace,artifact_ref){
  assert(workspace&&typeof workspace.read==="function","Checkpoint restore requires Artifact Workspace.");
  const archived=workspace.read(artifact_ref);
  assert(archived.record.artifact_type==="EVIDENCE","Recovery checkpoint artifact must be EVIDENCE.");
  assert(archived.record.media_type==="application/json","Recovery checkpoint artifact must use application/json.");
  let parsed;
  try{parsed=JSON.parse(archived.payload.data);}catch{throw new Error("Recovery checkpoint artifact payload is not valid JSON.");}
  const checkpoint=normalizeRecoveryCheckpoint(parsed);
  assert(archived.record.ownership.mission_id===checkpoint.mission.mission_id,"Recovery checkpoint artifact Mission ownership mismatch.");
  assert(archived.record.provenance.source_refs.includes(checkpoint.checkpoint_ref),"Recovery checkpoint artifact provenance is missing checkpoint_ref.");
  return checkpoint;
}
