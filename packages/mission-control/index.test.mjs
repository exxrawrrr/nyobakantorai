import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeMissionControlPolicy,
  createBalancedQueueSelector,
  assessMissionSliceBoundary,
  createAdaptivePlanProposal,
  buildCheckpointAwareRerouteDecision,
  executeControlledMission,
  assessSandboxHardening,
  validateSandboxHardeningDecision,
} from "./index.mjs";
import { planMission } from "../mission-engine/planner.mjs";
import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { createRecoveryCheckpoint } from "../checkpoint-recovery/index.mjs";

const root=new URL("../../",import.meta.url);
const runtimePolicy=JSON.parse(await readFile(new URL("config/runtime-execution-policy.json",root),"utf8"));
const controlPolicy=JSON.parse(await readFile(new URL("config/v0.8.1-mission-control-policy.json",root),"utf8"));
const hardeningPolicy=JSON.parse(await readFile(new URL("config/v0.8.1-sandbox-hardening-policy.json",root),"utf8"));
const recoveryPolicy=JSON.parse(await readFile(new URL("config/recovery-policy.json",root),"utf8"));

function tickingClock(start="2026-10-02T11:20:00.000Z",step=1000){
  let n=0; const base=Date.parse(start);
  return ()=>new Date(base+(n++*step)).toISOString();
}
const fixedClock=()=> "2026-10-02T11:20:00.000Z";
const ids=(kind,index,label)=>`${kind==="task"?"tnode":kind}-mc-${index+1}-${String(label).replace(/[^a-z0-9]+/gi,"-").toLowerCase()}`;

function plan(count=6){
  const workers=["alex","alex","nara","nara","praroro","siti","bimo","raka"];
  return planMission({
    objective:"Run a bounded long-running synthetic Mission.",
    constraints:["read-only execution","no external writes"],
    risk_class:"READ_ONLY",
    work_items:Array.from({length:count},(_,i)=>({
      key:`task-${i+1}`,
      title:`Task ${i+1}`,
      objective:`Execute bounded fixture ${i+1}.`,
      assigned_id:workers[i%workers.length],
      depends_on:[],
    })),
  },{clock:fixedClock,idFactory:ids});
}

function adapter(taskId,{provider="fixture-a"}={}){
  return defineRuntimeExecutionAdapter({
    id:"fixture-mission-control",version:"1.0.0",
    runtime:{provider,runtime_ref:`fixture:${taskId}`,provider_version:"1.0"},
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},process_contract:null,
    async prepare(){return {workspace:{kind:"TEMPORARY",ref:`tmp://${taskId}`,isolated:true,production_repo:false},session_ref:`session:${taskId}`};},
    async executeBoundedTask(){return {text:"ok"};},
    async normalizeResult(){return {schema:1,state:"SUCCEEDED",summary:"ok",output:{task_id:taskId},artifact_refs:[`artifact:${taskId}`],evidence_refs:[`evidence:${taskId}`]};},
    async collectEvidence(){return {schema:1,raw_result_ref:`artifact:${taskId}:raw`,normalized_result_ref:`artifact:${taskId}`,capabilities_used:["model_inference","temporary_workspace","evidence_collection"],workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},prohibited_action_check:{passed:true,observed:[]},runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},evidence_refs:[`evidence:${taskId}`],artifact_refs:[`artifact:${taskId}`]};},
    async cleanup(){return {ok:true};},
  });
}

const resolveRuntime=async({task})=>({
  adapter:adapter(task.task_id),policy:runtimePolicy,
  required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
});

test("canonical Mission Control policy is bounded and content-addressed",()=>{
  const p=normalizeMissionControlPolicy(controlPolicy);
  assert.equal(p.max_parallel_tasks,6);
  assert.equal(p.max_parallel_per_employee,2);
  assert.equal(p.adaptive.automatic_apply_allowed,false);
  assert.equal(p.adaptive.owner_review_required,true);
  assert.match(p.policy_ref,/^mission-control-policy:sha256:[a-f0-9]{64}$/);
});

test("fair queue only selects runnable tasks and avoids one employee monopolizing the batch",async()=>{
  const p=normalizeMissionControlPolicy(controlPolicy);
  const selector=createBalancedQueueSelector(p);
  const tasks=plan(6).task_nodes;
  const ids=tasks.map(x=>x.task_id);
  const selected=await selector({runnable_task_ids:ids,tasks,attempts:[],max_concurrency:4});
  assert.equal(selected.length,4);
  assert.ok(selected.every(id=>ids.includes(id)));
  const selectedWorkers=selected.map(id=>tasks.find(t=>t.task_id===id).employee_id);
  assert.ok(new Set(selectedWorkers).size>=3);
  const byWorker=new Map();
  for(const worker of selectedWorkers) byWorker.set(worker,(byWorker.get(worker)||0)+1);
  assert.ok(Math.max(...byWorker.values())<=p.max_parallel_per_employee);
});

test("slice boundary pauses on batch or wall-clock ceiling and escalates on attempt ceiling",()=>{
  const p=normalizeMissionControlPolicy({...controlPolicy,max_batches_per_slice:2,max_wall_clock_ms:5000,max_total_attempts:4});
  assert.equal(assessMissionSliceBoundary({policy:p,batch_count:2,elapsed_ms:1000,attempt_count:1}).action,"PAUSE");
  assert.equal(assessMissionSliceBoundary({policy:p,batch_count:0,elapsed_ms:5000,attempt_count:1}).action,"PAUSE");
  assert.equal(assessMissionSliceBoundary({policy:p,batch_count:0,elapsed_ms:1000,attempt_count:4}).action,"ESCALATE");
});

test("controlled Mission pauses at a safe batch boundary and emits a resumable checkpoint",async()=>{
  const result=await executeControlledMission(plan(6),{
    policy:{...controlPolicy,max_parallel_tasks:2,max_parallel_per_employee:1,max_batches_per_slice:1},
    resolveRuntime,
    clock:tickingClock(),
  });
  assert.equal(result.mission.state,"PAUSED");
  assert.equal(result.tasks.filter(x=>x.state==="SUCCEEDED").length,2);
  assert.equal(result.tasks.some(x=>x.state==="RUNNING"),false);
  assert.equal(result.attempts.some(x=>x.state==="RUNNING"),false);
  assert.equal(result.control.action,"PAUSE");
  assert.match(result.checkpoint.checkpoint_ref,/^checkpoint:sha256:[a-f0-9]{64}$/);
});

test("paused checkpoint resumes pending work without consuming a failure recovery cycle",async()=>{
  const first=await executeControlledMission(plan(4),{
    policy:{...controlPolicy,max_parallel_tasks:2,max_batches_per_slice:1},
    resolveRuntime,clock:tickingClock(),
  });
  assert.equal(first.mission.state,"PAUSED");
  assert.equal(first.checkpoint.recovery_cycle,0);
  const second=await executeControlledMission(plan(4),{
    policy:{...controlPolicy,max_parallel_tasks:2,max_batches_per_slice:10},
    resolveRuntime,clock:tickingClock("2026-10-02T11:30:00.000Z"),
    recovery:{checkpoint:first.checkpoint,policy:recoveryPolicy},
  });
  assert.equal(second.mission.state,"SUCCEEDED");
  assert.equal(second.recovery.resume_kind,"PAUSE_RESUME");
  assert.equal(second.recovery.recovery_cycle,0);
  assert.equal(second.attempts.length,4);
});

test("bounded adaptive proposal cannot auto-apply or widen capability authority",()=>{
  const proposal=createAdaptivePlanProposal({
    mission_id:"mission-mc-1",
    reason:"new bounded evidence requires one follow-up",
    evidence_refs:["evidence:lead-change"],
    authority_baseline:["research.read","artifact.write"],
    new_tasks:[{task_id:"followup-1",objective:"Review the new evidence.",employee_id:"siti",required_capabilities:["research.read"],depends_on:[]}],
    new_edges:[],
  },{policy:controlPolicy});
  assert.equal(proposal.owner_review_required,true);
  assert.equal(proposal.automatic_apply_allowed,false);
  assert.match(proposal.proposal_ref,/^mission-plan-proposal:sha256:[a-f0-9]{64}$/);
  assert.throws(()=>createAdaptivePlanProposal({
    mission_id:"mission-mc-1",reason:"unsafe",evidence_refs:["evidence:x"],
    authority_baseline:["research.read"],
    new_tasks:[{task_id:"x",objective:"unsafe",employee_id:"siti",required_capabilities:["crm.write"],depends_on:[]}],
    new_edges:[],
  },{policy:controlPolicy}),/authority baseline/i);
});

test("checkpoint-aware reroute can only expose the existing recovery-policy choice",()=>{
  const failedPlan=plan(1);
  const task=failedPlan.task_nodes[0];
  const failedTask={...task,state:"FAILED",attempt_ids:["attempt-1"],evidence_refs:[],receipt_refs:[],blocking:null,updated_at:"2026-10-02T11:20:01.000Z"};
  const attempt={schema:1,attempt_id:"attempt-1",task_id:task.task_id,ordinal:1,state:"FAILED",runtime:{provider:"fixture-a",runtime_ref:"fixture:failed",provider_version:"1.0"},model_route_ref:null,capability_route_refs:[],started_at:"2026-10-02T11:20:00.000Z",finished_at:"2026-10-02T11:20:01.000Z",error_category:"TIMEOUT",cleanup:{attempted:true,ok:true},receipt_ref:null,evidence_refs:[],artifact_refs:[],previous_attempt_id:null,recovery_checkpoint_ref:null};
  const mission={...failedPlan.mission,state:"FAILED",updated_at:"2026-10-02T11:20:01.000Z"};
  const checkpoint=createRecoveryCheckpoint({mission,tasks:[failedTask],attempts:[attempt],events:[]},{clock:()=> "2026-10-02T11:20:02.000Z"});
  const rp={...recoveryPolicy,provider_fallbacks:{"fixture-a":["fixture-b"]}};
  const decision=buildCheckpointAwareRerouteDecision({policy:controlPolicy,recovery_policy:rp,checkpoint,task_id:task.task_id});
  assert.equal(decision.action,"FALLBACK_PROVIDER");
  assert.equal(decision.provider_id,"fixture-b");
  assert.match(decision.decision_ref,/^checkpoint-reroute:sha256:[a-f0-9]{64}$/);
});

test("hardened sandbox boundary is fail-closed across filesystem browser network resources and credentials",()=>{
  const good={
    mission_id:"mission-mc-1",task_id:"task-1",
    filesystem:{temporary_workspace_only:true,production_repo_read_only:true,host_home_access:false},
    browser:{ephemeral_profile:true,user_profile_reused:false,credential_store_access:false},
    network:{mode:"ALLOWLIST_ONLY",hosts:["api.example.com"],dns_rebinding_protection:true},
    resources:{projected_processes:2,projected_workspace_bytes:1024},
    credentials:{delivery:"REFERENCE_ONLY",task_payload_values:false,environment_secret_injection:false},
  };
  const ok=assessSandboxHardening(hardeningPolicy,good);
  assert.equal(ok.allowed,true);
  assert.match(ok.decision_ref,/^sandbox-hardening:sha256:[a-f0-9]{64}$/);
  assert.equal(validateSandboxHardeningDecision(ok),true);
  const bad=assessSandboxHardening(hardeningPolicy,{...good,filesystem:{...good.filesystem,host_home_access:true},credentials:{...good.credentials,task_payload_values:true}});
  assert.equal(bad.allowed,false);
  assert.ok(bad.reason_codes.includes("HOST_HOME_ACCESS_FORBIDDEN"));
  assert.ok(bad.reason_codes.includes("CREDENTIAL_VALUE_IN_TASK_PAYLOAD"));
});

test("sandbox hardening does not claim OS/container isolation",()=>{
  const p=hardeningPolicy;
  assert.equal(p.claim_boundary.os_container_isolation,false);
  assert.equal(p.claim_boundary.application_level_guard,true);
});
