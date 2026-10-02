import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArtifactWorkspace } from "../artifact-workspace/index.mjs";
import { createDirectoryArtifactStorage } from "../artifact-workspace/node-storage.mjs";
import { planMission } from "../mission-engine/planner.mjs";
import { normalizeMission, normalizeExecutionAttempt } from "../mission-engine/contracts.mjs";
import { normalizeTaskNode } from "../task-registry/task-node.mjs";
import {
  buildBrowserRecoveryRequest,
  buildRecoverySeed,
  chooseRecoveryProvider,
  createRecoveryCheckpoint,
  normalizeRecoveryCheckpoint,
  normalizeRecoveryPolicy,
  recoverBrowserSession,
  persistRecoveryCheckpoint,
  readRecoveryCheckpointArtifact,
} from "./index.mjs";

const root=new URL("../../",import.meta.url);
const canonicalPolicy=JSON.parse(await readFile(new URL("config/recovery-policy.json",root),"utf8"));
const fixedClock=()=>"2026-10-02T05:00:00.000Z";
const ids=(kind,index,label)=>(kind==="task"?"tnode":kind)+"-recovery-"+(index+1)+"-"+String(label).replace(/[^a-z0-9]+/gi,"-").toLowerCase();

function plan(){
  return planMission({
    objective:"Run three sequential bounded tasks with recovery.",
    risk_class:"READ_ONLY",
    work_items:[
      {key:"one",title:"Completed task",objective:"Complete first task.",assigned_id:"alex",depends_on:[]},
      {key:"two",title:"Failed task",objective:"Fail second task for recovery.",assigned_id:"nara",depends_on:["one"]},
      {key:"three",title:"Downstream task",objective:"Resume only after second recovers.",assigned_id:"praroro",depends_on:["two"]},
    ],
  },{clock:fixedClock,idFactory:ids});
}

function taskWithState(task,state,{attempt_ids=[],blocking=null}={}){
  return normalizeTaskNode({
    ...task,
    state,
    attempt_ids,
    blocking,
    updated_at:"2026-10-02T05:00:03.000Z",
  });
}
function attempt({task,attempt_id,ordinal=1,state="FAILED",provider="provider-primary",error_category="TIMEOUT",previous_attempt_id=null,recovery_checkpoint_ref=null}){
  return normalizeExecutionAttempt({
    schema:1,
    attempt_id,
    task_id:task.task_id,
    ordinal,
    state,
    runtime:{provider,runtime_ref:provider+":"+task.task_id,provider_version:"1"},
    model_route_ref:null,
    capability_route_refs:[],
    started_at:"2026-10-02T05:00:01.000Z",
    finished_at:"2026-10-02T05:00:02.000Z",
    error_category:state==="SUCCEEDED"?null:error_category,
    cleanup:{attempted:true,ok:true},
    receipt_ref:null,
    evidence_refs:state==="SUCCEEDED"?["evidence:"+attempt_id]:[],
    artifact_refs:state==="SUCCEEDED"?["artifact:"+attempt_id]:[],
    previous_attempt_id,
    recovery_checkpoint_ref,
  });
}
function failedResult(){
  const p=plan();
  const [one,two,three]=p.task_nodes;
  const a1=attempt({task:one,attempt_id:"attempt-one-1",state:"SUCCEEDED",provider:"provider-primary"});
  const a2=attempt({task:two,attempt_id:"attempt-two-1",state:"FAILED",provider:"provider-primary",error_category:"TIMEOUT"});
  const tasks=[
    taskWithState(one,"SUCCEEDED",{attempt_ids:[a1.attempt_id]}),
    taskWithState(two,"FAILED",{attempt_ids:[a2.attempt_id]}),
    taskWithState(three,"BLOCKED",{blocking:{kind:"DEPENDENCY",reason:"Upstream dependency did not succeed."}}),
  ];
  const mission=normalizeMission({
    ...p.mission,
    state:"PARTIAL",
    artifact_refs:[...a1.artifact_refs],
    evidence_refs:[...a1.evidence_refs],
    updated_at:"2026-10-02T05:00:03.000Z",
  });
  return {plan:p,result:{mission,tasks,attempts:[a1,a2],events:[
    {kind:"TASK_SUCCEEDED",at:"2026-10-02T05:00:01.000Z",mission_id:mission.mission_id,task_id:one.task_id},
    {kind:"TASK_FAILED",at:"2026-10-02T05:00:02.000Z",mission_id:mission.mission_id,task_id:two.task_id},
    {kind:"TASK_BLOCKED_BY_DEPENDENCY",at:"2026-10-02T05:00:03.000Z",mission_id:mission.mission_id,task_id:three.task_id},
  ]}};
}

test("canonical recovery policy is valid and does not enable provider fallback by default",()=>{
  const policy=normalizeRecoveryPolicy(canonicalPolicy);
  assert.equal(policy.max_attempts_per_task,3);
  assert.equal(policy.max_recovery_cycles,2);
  assert.deepEqual(policy.provider_fallbacks,{});
  assert.equal(policy.browser.strategy,"NEW_ISOLATED_SESSION");
});

test("checkpoint binds Mission/Task/Attempt snapshot and completed task set with content checksum",()=>{
  const {result}=failedResult();
  const checkpoint=createRecoveryCheckpoint(result,{clock:fixedClock});
  assert.match(checkpoint.checkpoint_ref,/^checkpoint:sha256:[a-f0-9]{64}$/);
  assert.equal(checkpoint.completed_task_ids.length,1);
  assert.equal(checkpoint.completed_task_ids[0],result.tasks[0].task_id);
  assert.equal(normalizeRecoveryCheckpoint(checkpoint).checkpoint_ref,checkpoint.checkpoint_ref);

  const tampered=structuredClone(checkpoint);
  tampered.tasks[0].state="FAILED";
  assert.throws(()=>normalizeRecoveryCheckpoint(tampered),/completed_task_ids drift|checksum mismatch/);
});

test("recovery seed preserves completed work, retries only failed task, and resets dependency-only block",()=>{
  const {plan:p,result}=failedResult();
  const checkpoint=createRecoveryCheckpoint(result,{clock:fixedClock});
  const policy={
    ...canonicalPolicy,
    provider_fallbacks:{"provider-primary":["provider-fallback"]},
  };
  const seed=buildRecoverySeed(p,checkpoint,policy);

  assert.deepEqual(seed.completed_task_ids,[result.tasks[0].task_id]);
  assert.equal(seed.recovery_tasks.length,1);
  assert.equal(seed.recovery_tasks[0].task_id,result.tasks[1].task_id);
  assert.equal(seed.recovery_tasks[0].previous_attempt_id,"attempt-two-1");
  assert.equal(seed.recovery_tasks[0].provider_recovery.action,"FALLBACK_PROVIDER");
  assert.equal(seed.recovery_tasks[0].provider_recovery.fallback_provider,"provider-fallback");
  assert.deepEqual(seed.dependency_reset_task_ids,[result.tasks[2].task_id]);
  assert.equal(seed.recovery_cycle,1);
});

test("retry budget rejects checkpoint when failed task already exhausted max attempts",()=>{
  const {plan:p,result}=failedResult();
  const failedTask=result.tasks[1];
  const a2=result.attempts[1];
  const a3=attempt({
    task:failedTask,
    attempt_id:"attempt-two-2",
    ordinal:2,
    state:"FAILED",
    provider:"provider-primary",
    error_category:"TIMEOUT",
    previous_attempt_id:a2.attempt_id,
  });
  const exhausted={
    ...result,
    tasks:[
      result.tasks[0],
      taskWithState(failedTask,"FAILED",{attempt_ids:[a2.attempt_id,a3.attempt_id]}),
      result.tasks[2],
    ],
    attempts:[result.attempts[0],a2,a3],
  };
  const checkpoint=createRecoveryCheckpoint(exhausted,{clock:fixedClock});
  assert.throws(
    ()=>buildRecoverySeed(p,checkpoint,{...canonicalPolicy,max_attempts_per_task:2}),
    /ATTEMPT_LIMIT_REACHED/,
  );
});

test("non-retryable failure category cannot be resumed by weakening state only",()=>{
  const {plan:p,result}=failedResult();
  const failedTask=result.tasks[1];
  const badAttempt=attempt({
    task:failedTask,
    attempt_id:"attempt-two-policy",
    state:"BLOCKED",
    provider:"provider-primary",
    error_category:"POLICY_VIOLATION",
  });
  const changed={
    ...result,
    tasks:[
      result.tasks[0],
      taskWithState(failedTask,"BLOCKED",{attempt_ids:[badAttempt.attempt_id],blocking:{kind:"POLICY",reason:"Policy violation."}}),
      result.tasks[2],
    ],
    attempts:[result.attempts[0],badAttempt],
  };
  const checkpoint=createRecoveryCheckpoint(changed,{clock:fixedClock});
  assert.throws(()=>buildRecoverySeed(p,checkpoint,canonicalPolicy),/ERROR_CATEGORY_NOT_RETRYABLE/);
});

test("provider fallback is selected only from recovery policy allowlist and avoids already-used provider",()=>{
  const {result}=failedResult();
  const checkpoint=createRecoveryCheckpoint(result,{clock:fixedClock});
  const allowed={...canonicalPolicy,provider_fallbacks:{"provider-primary":["provider-fallback","provider-second"]}};
  const choice=chooseRecoveryProvider({policy:allowed,checkpoint,task_id:result.tasks[1].task_id});
  assert.equal(choice.current_provider,"provider-primary");
  assert.equal(choice.fallback_provider,"provider-fallback");
  assert.equal(choice.action,"FALLBACK_PROVIDER");

  const noFallback=chooseRecoveryProvider({policy:canonicalPolicy,checkpoint,task_id:result.tasks[1].task_id});
  assert.equal(noFallback.fallback_provider,null);
  assert.equal(noFallback.action,"RETRY_SAME_PROVIDER");
});

test("browser recovery interface requires a new isolated session without profile or credential carry-over",async()=>{
  const {result}=failedResult();
  const checkpoint=createRecoveryCheckpoint(result,{clock:fixedClock});
  const request=buildBrowserRecoveryRequest({
    checkpoint_ref:checkpoint.checkpoint_ref,
    task_id:result.tasks[1].task_id,
    previous_session_ref:"browser-session-old",
    restart_count:0,
    policy:canonicalPolicy,
  });
  assert.equal(request.strategy,"NEW_ISOLATED_SESSION");
  assert.equal(request.constraints.reuse_user_profile,false);

  const recovered=await recoverBrowserSession(request,{
    open_isolated_session:async()=>({
      session_ref:"browser-session-new",
      isolated:true,
      user_profile_reused:false,
      credentials_carried:false,
    }),
  });
  assert.equal(recovered.recovered,true);
  assert.equal(recovered.session_ref,"browser-session-new");

  await assert.rejects(
    ()=>recoverBrowserSession(request,{
      open_isolated_session:async()=>({
        session_ref:"browser-session-old",
        isolated:true,
        user_profile_reused:false,
        credentials_carried:false,
      }),
    }),
    /new session_ref/,
  );
  await assert.rejects(
    ()=>recoverBrowserSession(request,{
      open_isolated_session:async()=>({
        session_ref:"browser-session-new-2",
        isolated:true,
        user_profile_reused:true,
        credentials_carried:false,
      }),
    }),
    /must not reuse user profile/,
  );
});

test("browser recovery session restarts are bounded",()=>{
  const {result}=failedResult();
  const checkpoint=createRecoveryCheckpoint(result,{clock:fixedClock});
  assert.throws(
    ()=>buildBrowserRecoveryRequest({
      checkpoint_ref:checkpoint.checkpoint_ref,
      task_id:result.tasks[1].task_id,
      previous_session_ref:"browser-session-old",
      restart_count:1,
      policy:canonicalPolicy,
    }),
    /restart limit reached/,
  );
});


test("recovery checkpoint persists through Artifact Workspace and reopens in a new process-like instance",()=>{
  const {result}=failedResult();
  const checkpoint=createRecoveryCheckpoint(result,{clock:fixedClock});
  const dir=mkdtempSync(join(tmpdir(),"nyobakantorai-recovery-checkpoint-"));
  try{
    const first=createArtifactWorkspace({
      storage:createDirectoryArtifactStorage(dir),
      clock:()=>"2026-10-02T05:01:00.000Z",
    });
    const stored=persistRecoveryCheckpoint({workspace:first,checkpoint});
    assert.equal(stored.checkpoint_ref,checkpoint.checkpoint_ref);
    assert.match(stored.artifact_ref,/^artifact:/);

    const reopened=createArtifactWorkspace({storage:createDirectoryArtifactStorage(dir)});
    const restored=readRecoveryCheckpointArtifact(reopened,stored.artifact_ref);
    assert.equal(restored.checkpoint_ref,checkpoint.checkpoint_ref);
    assert.deepEqual(restored.completed_task_ids,checkpoint.completed_task_ids);
    assert.equal(reopened.verify().record_count,1);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
