import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { planMission } from "../mission-engine/planner.mjs";
import { executeMissionPlan } from "../mission-engine/orchestrator.mjs";
import { createCapabilityRouter } from "./index.mjs";
import { bindCapabilityRoutesToRuntime } from "./runtime-resolution.mjs";

const config=JSON.parse(readFileSync(new URL("../../config/capabilities.json", import.meta.url),"utf8"));
const employees=JSON.parse(readFileSync(new URL("../../config/employees.json", import.meta.url),"utf8"));
const policy=JSON.parse(readFileSync(new URL("../../config/runtime-execution-policy.json", import.meta.url),"utf8"));
const employee=(id)=>employees.employees.find((item)=>item.id===id);
const clock=()=> "2026-10-01T10:00:00.000Z";
const ids=(kind,index,label)=>`${kind==="task"?"tnode":kind}-caproute-${index+1}-${String(label).replace(/[^a-z0-9]+/gi,"-").toLowerCase()}`;

const grant={
  schema:1,
  grant_id:"grant-meta-read-fixture",
  employee_id:"maya",
  capability_id:"ads.meta.read",
  access_modes:["READ"],
  actions:["inspect"],
  targets:[{resource_type:"ad_account",resource_id:"account-fixture"}],
  issued_at:"2026-10-01T09:00:00.000Z",
  expires_at:null,
  evidence_ref:"grant-evidence:meta-read-fixture",
};
const snapshot={
  provider_id:"meta-fixture-provider",
  checked_at:"2026-10-01T09:30:00.000Z",
  capabilities:{
    "ads.meta.read":{
      state:"CONNECTED",
      evidence_ref:"connection:meta-fixture-provider:ads.meta.read",
    },
  },
};
const router=createCapabilityRouter({
  catalog:config.capabilities,
  states:config.states,
  autonomyModes:config.autonomy_modes,
  defaultAutonomy:config.default_mode,
  grants:[grant],
});

function adapter(){
  return defineRuntimeExecutionAdapter({
    id:"capability-route-fixture",
    version:"1.0.0",
    runtime:{provider:"fixture-runtime",runtime_ref:"fixture:capability-route",provider_version:"1.0"},
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare(){return {workspace:{kind:"TEMPORARY",ref:"tmp://capability-route",isolated:true,production_repo:false},session_ref:"session:capability-route"};},
    async executeBoundedTask(){return {text:"synthetic capability route execution"};},
    async normalizeResult(){return {schema:1,state:"SUCCEEDED",summary:"synthetic",output:{ok:true},artifact_refs:["artifact:capability-route"],evidence_refs:["evidence:capability-route"]};},
    async collectEvidence(){return {schema:1,raw_result_ref:"artifact:raw",normalized_result_ref:"artifact:capability-route",capabilities_used:["model_inference","temporary_workspace","evidence_collection"],workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},prohibited_action_check:{passed:true,observed:[]},runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},evidence_refs:["evidence:capability-route"],artifact_refs:["artifact:raw","artifact:capability-route"]};},
    async cleanup(){return {ok:true};},
  });
}

test("allowed capability route ref reaches Execution Attempt unchanged",async()=>{
  const route=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:{resource_type:"ad_account",resource_id:"account-fixture"},
    snapshots:[snapshot],
    autonomy:"GUARDED",
  });
  const resolution=bindCapabilityRoutesToRuntime([route],{
    adapter:adapter(),
    policy,
    required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
  });
  const plan=planMission({
    objective:"Inspect one Meta Ads account fixture without mutation.",
    risk_class:"READ_ONLY",
    work_items:[{key:"inspect",title:"Inspect Meta account",objective:"Inspect bounded account fixture.",assigned_id:"maya",depends_on:[]}],
  },{clock,idFactory:ids});
  const result=await executeMissionPlan(plan,{resolveRuntime:async()=>resolution,clock});
  assert.equal(result.mission.state,"SUCCEEDED");
  assert.deepEqual(result.attempts[0].capability_route_refs,[route.capability_route_ref]);
});

test("blocked or tampered routes cannot be bound into runtime resolution",()=>{
  const waitingRouter=createCapabilityRouter({
    catalog:config.capabilities,
    states:config.states,
    autonomyModes:config.autonomy_modes,
    defaultAutonomy:config.default_mode,
    grants:[{
      ...grant,
      grant_id:"grant-meta-write-fixture",
      capability_id:"ads.meta.write",
      access_modes:["WRITE"],
      actions:["update-budget"],
    }],
  });
  const waiting=waitingRouter.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.write",
    action:"update-budget",
    accessMode:"WRITE",
    target:{resource_type:"ad_account",resource_id:"account-fixture"},
    snapshots:[{
      provider_id:"meta-fixture-provider",
      checked_at:"2026-10-01T09:30:00.000Z",
      capabilities:{"ads.meta.write":{state:"CONNECTED",evidence_ref:"connection:meta-write"}},
    }],
    autonomy:"GUARDED",
    approvalStatus:"PENDING",
  });
  assert.throws(()=>bindCapabilityRoutesToRuntime([waiting],{
    adapter:adapter(),policy,required_capabilities:["model_inference"],
  }),/not authorized|allowed route/i);

  const allowed=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:{resource_type:"ad_account",resource_id:"account-fixture"},
    snapshots:[snapshot],
  });
  const tampered={...allowed,target:{...allowed.target,resource_id:"other-account"}};
  assert.throws(()=>bindCapabilityRoutesToRuntime([tampered],{
    adapter:adapter(),policy,required_capabilities:["model_inference"],
  }),/route ref.*content|digest|payload/i);
});
