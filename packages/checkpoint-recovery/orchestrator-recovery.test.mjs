import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { planMission } from "../mission-engine/planner.mjs";
import { executeMissionPlan } from "../mission-engine/orchestrator.mjs";
import { createRecoveryCheckpoint } from "./index.mjs";

const root=new URL("../../",import.meta.url);
const runtimePolicy=JSON.parse(await readFile(new URL("config/runtime-execution-policy.json",root),"utf8"));
const recoveryPolicyBase=JSON.parse(await readFile(new URL("config/recovery-policy.json",root),"utf8"));

const ids=(kind,index,label)=>(kind==="task"?"tnode":kind)+"-resume-"+(index+1)+"-"+String(label).replace(/[^a-z0-9]+/gi,"-").toLowerCase();
function clockFactory(){
  let i=0;
  const base=Date.parse("2026-10-02T06:00:00.000Z");
  return ()=>new Date(base+(i++*1000)).toISOString();
}
function plan(){
  return planMission({
    objective:"Resume a bounded three-step mission after one mid-mission failure.",
    risk_class:"READ_ONLY",
    constraints:["no external writes"],
    work_items:[
      {key:"one",title:"First completed task",objective:"Complete first task.",assigned_id:"alex",depends_on:[]},
      {key:"two",title:"Recoverable task",objective:"Fail once then recover.",assigned_id:"nara",depends_on:["one"]},
      {key:"three",title:"Downstream task",objective:"Run only after recovered task succeeds.",assigned_id:"praroro",depends_on:["two"]},
    ],
  },{clock:()=>"2026-10-02T06:00:00.000Z",idFactory:ids});
}
function adapter(taskId,{provider="provider-primary",terminalState="SUCCEEDED",onExecute=()=>{}}={}){
  return defineRuntimeExecutionAdapter({
    id:"checkpoint-recovery-fixture",
    version:"1.0.0",
    runtime:{provider,runtime_ref:provider+":"+taskId,provider_version:"1.0"},
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare(){
      return {workspace:{kind:"TEMPORARY",ref:"tmp://"+provider+"/"+taskId,isolated:true,production_repo:false},session_ref:"session:"+provider+":"+taskId};
    },
    async executeBoundedTask(){
      onExecute(taskId,provider);
      return {task_id:taskId,provider};
    },
    async normalizeResult(){
      return {
        schema:1,
        state:terminalState,
        summary:terminalState+" fixture result.",
        output:{task_id:taskId,provider,state:terminalState},
        artifact_refs:["artifact:"+provider+":"+taskId+":normalized"],
        evidence_refs:["evidence:"+provider+":"+taskId+":normalized"],
      };
    },
    async collectEvidence(){
      return {
        schema:1,
        raw_result_ref:"artifact:"+provider+":"+taskId+":raw",
        normalized_result_ref:"artifact:"+provider+":"+taskId+":normalized",
        capabilities_used:["model_inference","temporary_workspace","evidence_collection"],
        workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
        prohibited_action_check:{passed:true,observed:[]},
        runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},
        evidence_refs:["evidence:"+provider+":"+taskId+":runtime"],
        artifact_refs:["artifact:"+provider+":"+taskId+":raw","artifact:"+provider+":"+taskId+":normalized"],
      };
    },
    async cleanup(){return {ok:true};},
  });
}
function resolution(task,options={}){
  return {
    adapter:adapter(task.task_id,options),
    policy:runtimePolicy,
    required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
    capability_route_refs:["capability-route:"+task.task_id],
    model_route_ref:null,
    unknowns:[],
    residual_risks:[],
  };
}

test("mid-mission failure resumes without re-executing completed work and preserves attempt lineage",async()=>{
  const p=plan();
  const firstCalls=[];
  const firstClock=clockFactory();
  const failedTaskId=p.task_nodes[1].task_id;

  const first=await executeMissionPlan(p,{
    resolveRuntime:async({task})=>resolution(task,{
      provider:"provider-primary",
      terminalState:task.task_id===failedTaskId?"FAILED":"SUCCEEDED",
      onExecute:(taskId,provider)=>firstCalls.push(taskId+"@"+provider),
    }),
    maxConcurrency:1,
    clock:firstClock,
  });

  assert.equal(first.mission.state,"PARTIAL");
  assert.deepEqual(firstCalls,[
    p.task_nodes[0].task_id+"@provider-primary",
    p.task_nodes[1].task_id+"@provider-primary",
  ]);
  assert.equal(first.tasks[0].state,"SUCCEEDED");
  assert.equal(first.tasks[1].state,"FAILED");
  assert.equal(first.tasks[2].state,"BLOCKED");
  assert.equal(first.tasks[2].blocking.kind,"DEPENDENCY");

  const checkpoint=createRecoveryCheckpoint(first,{
    reason:"MID_MISSION_RUNTIME_FAILURE",
    clock:()=>"2026-10-02T06:10:00.000Z",
  });
  const recoveryPolicy={
    ...recoveryPolicyBase,
    provider_fallbacks:{"provider-primary":["provider-fallback"]},
  };

  const resumeCalls=[];
  const recoveryContexts=[];
  const resumed=await executeMissionPlan(p,{
    recovery:{checkpoint,policy:recoveryPolicy},
    resolveRuntime:async({task,recovery})=>{
      resumeCalls.push(task.task_id+"@regular");
      recoveryContexts.push(recovery);
      return resolution(task,{
        provider:"provider-primary",
        terminalState:"SUCCEEDED",
        onExecute:(taskId,provider)=>resumeCalls.push(taskId+"@"+provider),
      });
    },
    resolveRecoveryRuntime:async({task,recovery})=>{
      recoveryContexts.push(recovery);
      assert.equal(recovery.provider_recovery.action,"FALLBACK_PROVIDER");
      assert.equal(recovery.provider_recovery.fallback_provider,"provider-fallback");
      return resolution(task,{
        provider:"provider-fallback",
        terminalState:"SUCCEEDED",
        onExecute:(taskId,provider)=>resumeCalls.push(taskId+"@"+provider),
      });
    },
    maxConcurrency:1,
    clock:clockFactory(),
  });

  assert.equal(resumed.mission.state,"SUCCEEDED");
  assert.deepEqual(resumed.recovery.completed_task_ids,[p.task_nodes[0].task_id]);
  assert.deepEqual(resumed.recovery.retried_task_ids,[p.task_nodes[1].task_id]);
  assert.deepEqual(resumed.recovery.dependency_reset_task_ids,[p.task_nodes[2].task_id]);

  assert.equal(resumeCalls.filter(x=>x.startsWith(p.task_nodes[0].task_id+"@")).length,0,"completed task must not execute again");
  assert.ok(resumeCalls.includes(p.task_nodes[1].task_id+"@provider-fallback"));
  assert.ok(resumeCalls.includes(p.task_nodes[2].task_id+"@provider-primary"));

  assert.equal(resumed.attempts.length,4);
  const retryAttempt=resumed.attempts.find(a=>a.task_id===p.task_nodes[1].task_id&&a.ordinal===2);
  assert.ok(retryAttempt);
  assert.equal(retryAttempt.previous_attempt_id,first.attempts.find(a=>a.task_id===p.task_nodes[1].task_id).attempt_id);
  assert.equal(retryAttempt.recovery_checkpoint_ref,checkpoint.checkpoint_ref);
  assert.equal(retryAttempt.runtime.provider,"provider-fallback");

  assert.deepEqual(resumed.tasks.map(t=>t.state),["SUCCEEDED","SUCCEEDED","SUCCEEDED"]);
  assert.deepEqual(resumed.tasks.map(t=>t.attempt_ids.length),[1,2,1]);
  assert.ok(resumed.events.some(e=>e.kind==="MISSION_RETRYING"));
  assert.ok(resumed.events.some(e=>e.kind==="MISSION_RECOVERED"));
  assert.ok(resumed.events.some(e=>e.kind==="TASK_RETRYING"&&e.task_id===p.task_nodes[1].task_id));
  assert.ok(resumed.events.some(e=>e.kind==="TASK_RECOVERED"&&e.task_id===p.task_nodes[1].task_id));
  assert.ok(resumed.events.some(e=>e.kind==="TASK_RECOVERY_DEPENDENCY_READY"&&e.task_id===p.task_nodes[2].task_id));
  assert.ok(resumed.events.some(e=>e.kind==="RECOVERY_RUNTIME_SELECTED"&&e.provider_id==="provider-fallback"));

  assert.equal(recoveryContexts.some(x=>x?.checkpoint_ref===checkpoint.checkpoint_ref),true);
});

test("recovery provider resolver cannot bypass fallback allowlist",async()=>{
  const p=plan();
  const failedTaskId=p.task_nodes[1].task_id;
  const first=await executeMissionPlan(p,{
    resolveRuntime:async({task})=>resolution(task,{
      provider:"provider-primary",
      terminalState:task.task_id===failedTaskId?"FAILED":"SUCCEEDED",
    }),
    maxConcurrency:1,
    clock:clockFactory(),
  });
  const checkpoint=createRecoveryCheckpoint(first,{clock:()=>"2026-10-02T06:10:00.000Z"});
  const recoveryPolicy={
    ...recoveryPolicyBase,
    provider_fallbacks:{"provider-primary":["provider-fallback"]},
  };

  await assert.rejects(
    ()=>executeMissionPlan(p,{
      recovery:{checkpoint,policy:recoveryPolicy},
      resolveRuntime:async({task})=>resolution(task,{provider:"provider-primary"}),
      resolveRecoveryRuntime:async({task})=>resolution(task,{provider:"provider-unapproved"}),
      maxConcurrency:1,
      clock:clockFactory(),
    }),
    /violates recovery policy/,
  );
});

test("timeout failure injection produces a checkpoint that can be retried within bounded attempt policy",async()=>{
  const p=planMission({
    objective:"Recover from a bounded timeout.",
    risk_class:"READ_ONLY",
    work_items:[
      {key:"one",title:"Timeout once",objective:"Timeout then recover.",assigned_id:"alex",depends_on:[]},
    ],
  },{clock:()=>"2026-10-02T06:00:00.000Z",idFactory:ids});
  const taskId=p.task_nodes[0].task_id;

  const slow=defineRuntimeExecutionAdapter({
    id:"timeout-fixture",
    version:"1.0.0",
    runtime:{provider:"provider-primary",runtime_ref:"provider-primary:"+taskId,provider_version:"1"},
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare(){return {workspace:{kind:"TEMPORARY",ref:"tmp://timeout",isolated:true,production_repo:false},session_ref:"session:timeout"};},
    async executeBoundedTask(){await new Promise(r=>setTimeout(r,30));return {ok:true};},
    async normalizeResult(){return {schema:1,state:"SUCCEEDED",summary:"late",output:{},artifact_refs:[],evidence_refs:[]};},
    async collectEvidence(){return {
      schema:1,raw_result_ref:"artifact:timeout:raw",normalized_result_ref:"artifact:timeout:normalized",
      capabilities_used:["model_inference","temporary_workspace","evidence_collection"],
      workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
      prohibited_action_check:{passed:true,observed:[]},
      runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},
      evidence_refs:[],artifact_refs:[]
    };},
    async cleanup(){return {ok:true};},
  });

  const first=await executeMissionPlan(p,{
    resolveRuntime:async()=>({
      adapter:slow,
      policy:runtimePolicy,
      timeout_ms:5,
      required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
      unknowns:[],residual_risks:[],
    }),
    clock:clockFactory(),
  });
  assert.equal(first.mission.state,"FAILED");
  assert.equal(first.attempts[0].error_category,"TIMEOUT");

  const checkpoint=createRecoveryCheckpoint(first,{clock:()=>"2026-10-02T06:10:00.000Z"});
  const resumed=await executeMissionPlan(p,{
    recovery:{checkpoint,policy:recoveryPolicyBase},
    resolveRuntime:async({task})=>resolution(task,{provider:"provider-primary",terminalState:"SUCCEEDED"}),
    clock:clockFactory(),
  });
  assert.equal(resumed.mission.state,"SUCCEEDED");
  assert.equal(resumed.attempts.length,2);
  assert.equal(resumed.attempts[1].previous_attempt_id,resumed.attempts[0].attempt_id);
  assert.equal(resumed.attempts[1].recovery_checkpoint_ref,checkpoint.checkpoint_ref);
});

test("unsafe RUNNING checkpoint is refused as a resume boundary",()=>{
  const {plan:p,result}=(()=>{
    const p=plan();
    return {plan:p,result:null};
  })();
  const task=p.task_nodes[0];
  const runningAttempt={
    schema:1,
    attempt_id:"attempt-running",
    task_id:task.task_id,
    ordinal:1,
    state:"RUNNING",
    runtime:{provider:"provider-primary",runtime_ref:"provider-primary:"+task.task_id,provider_version:"1"},
    model_route_ref:null,
    capability_route_refs:[],
    started_at:"2026-10-02T06:00:01.000Z",
    finished_at:null,
    error_category:null,
    cleanup:{attempted:false,ok:null},
    receipt_ref:null,
    evidence_refs:[],
    artifact_refs:[],
    previous_attempt_id:null,
    recovery_checkpoint_ref:null,
  };
  const unsafeResult={
    mission:{...p.mission,state:"PARTIAL",updated_at:"2026-10-02T06:00:02.000Z"},
    tasks:p.task_nodes.map((t,i)=>({
      ...t,
      state:i===0?"RUNNING":"BLOCKED",
      attempt_ids:i===0?["attempt-running"]:[],
      blocking:i===0?null:{kind:"DEPENDENCY",reason:"waiting"},
      updated_at:"2026-10-02T06:00:02.000Z",
    })),
    attempts:[runningAttempt],
    events:[],
  };
  const checkpoint=createRecoveryCheckpoint(unsafeResult,{clock:()=>"2026-10-02T06:10:00.000Z"});
  assert.throws(
    ()=>executeMissionPlan(p,{
      recovery:{checkpoint,policy:recoveryPolicyBase},
      resolveRuntime:async({task})=>resolution(task,{provider:"provider-primary"}),
      clock:clockFactory(),
    }),
    /cannot resume while a TaskNode is RUNNING|cannot resume while an Execution Attempt is RUNNING/,
  );
});
