import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { executeLiveSandboxedTask } from "./runtime-integration.mjs";

const root=new URL("../../",import.meta.url);
const runtimePolicy=JSON.parse(await readFile(new URL("config/runtime-execution-policy.json",root),"utf8"));

function sandboxPolicy(overrides={}){
  return {
    schema:1,
    id:"v0-6-live-sandbox",
    allowed_risk_classes:["READ_ONLY"],
    max_duration_ms:45000,
    max_tool_calls:4,
    max_input_tokens:12000,
    max_output_tokens:4000,
    max_total_tokens:16000,
    max_cost_usd:null,
    allowed_tool_ids:[],
    allowed_network_hosts:[],
    allowed_runtime_providers:["fixture-runtime"],
    allow_fallback:false,
    require_temporary_workspace:true,
    forbid_external_write:true,
    forbid_credentials_exposure:true,
    ...overrides,
  };
}

function declaration(overrides={}){
  return {
    schema:1,
    mission_id:"mission-sandbox-integration",
    task_id:"task-sandbox-integration",
    risk_class:"READ_ONLY",
    provider_id:"fixture-runtime",
    model_identity:{status:"KNOWN",model_id:"fixture-model"},
    model_route_ref:"model-route:sha256:"+"a".repeat(64),
    capability_route_refs:[],
    tool_ids:[],
    network_hosts:[],
    fallback_models:[],
    credentials_exposed_to_task:false,
    projected_usage:{
      duration_ms:2000,
      tool_calls:0,
      input_tokens:1000,
      output_tokens:500,
      cost:{status:"UNKNOWN",amount_usd:null},
    },
    ...overrides,
  };
}

function runtimeTask(){
  return {
    schema:1,
    task_id:"task-sandbox-integration",
    employee_id:"siti",
    objective:"Execute one bounded synthetic sandbox task.",
    risk_class:"READ_ONLY",
    required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
    required_skills:[],
    prohibited_actions:["external write","paid action","account mutation"],
    expected_output:{type:"object",description:"synthetic result"},
  };
}

function adapter({provider="fixture-runtime",counter={prepare:0,execute:0,cleanup:0}}={}){
  return defineRuntimeExecutionAdapter({
    id:"sandbox-fixture-adapter",
    version:"1.0.0",
    runtime:{provider,runtime_ref:"fixture:sandbox",provider_version:"1.0"},
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare(){
      counter.prepare+=1;
      return {workspace:{kind:"TEMPORARY",ref:"tmp://sandbox-fixture",isolated:true,production_repo:false},session_ref:"session:sandbox"};
    },
    async executeBoundedTask(){
      counter.execute+=1;
      return {text:"bounded sandbox fixture result"};
    },
    async normalizeResult(){
      return {
        schema:1,
        state:"SUCCEEDED",
        summary:"Synthetic sandbox task completed.",
        output:{ok:true},
        artifact_refs:["artifact:sandbox"],
        evidence_refs:["evidence:sandbox"],
      };
    },
    async collectEvidence(){
      return {
        schema:1,
        raw_result_ref:"artifact:sandbox:raw",
        normalized_result_ref:"artifact:sandbox",
        capabilities_used:["model_inference","temporary_workspace","evidence_collection"],
        workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
        prohibited_action_check:{passed:true,observed:[]},
        runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},
        evidence_refs:["evidence:sandbox"],
        artifact_refs:["artifact:sandbox:raw","artifact:sandbox"],
      };
    },
    async cleanup(){
      counter.cleanup+=1;
      return {ok:true};
    },
  });
}

test("admission denial prevents runtime adapter invocation",async()=>{
  const counter={prepare:0,execute:0,cleanup:0};
  const result=await executeLiveSandboxedTask({
    sandbox_policy:sandboxPolicy({max_input_tokens:500}),
    declaration:declaration(),
    adapter:adapter({counter}),
    task:runtimeTask(),
    runtime_policy:runtimePolicy,
  });
  assert.equal(result.executed,false);
  assert.equal(result.admission.allowed,false);
  assert.ok(result.admission.reason_codes.includes("INPUT_TOKEN_LIMIT_EXCEEDED"));
  assert.deepEqual(counter,{prepare:0,execute:0,cleanup:0});
  assert.equal(result.outcome,null);
  assert.equal(result.record,null);
});

test("runtime provider mismatch fails before adapter prepare",async()=>{
  const counter={prepare:0,execute:0,cleanup:0};
  await assert.rejects(
    ()=>executeLiveSandboxedTask({
      sandbox_policy:sandboxPolicy(),
      declaration:declaration(),
      adapter:adapter({provider:"other-runtime",counter}),
      task:runtimeTask(),
      runtime_policy:runtimePolicy,
    }),
    (error)=>{
      assert.equal(error.code,"SANDBOX_RUNTIME_PROVIDER_MISMATCH");
      return true;
    },
  );
  assert.deepEqual(counter,{prepare:0,execute:0,cleanup:0});
});

test("admitted bounded execution settles PASS when actual usage is fully reported",async()=>{
  const counter={prepare:0,execute:0,cleanup:0};
  const result=await executeLiveSandboxedTask({
    sandbox_policy:sandboxPolicy(),
    declaration:declaration(),
    adapter:adapter({counter}),
    task:runtimeTask(),
    runtime_policy:runtimePolicy,
    usage_reporter:async()=>({
      duration_ms:1000,
      tool_calls:0,
      input_tokens:900,
      output_tokens:400,
      cost:{status:"UNKNOWN",amount_usd:null},
    }),
  });
  assert.equal(result.executed,true);
  assert.equal(result.outcome.state,"SUCCEEDED");
  assert.equal(result.record.status,"PASS");
  assert.equal(result.record.teardown_verified,true);
  assert.deepEqual(counter,{prepare:1,execute:1,cleanup:1});
});

test("missing usage reporter preserves unknown counters and settles PARTIAL",async()=>{
  const result=await executeLiveSandboxedTask({
    sandbox_policy:sandboxPolicy(),
    declaration:declaration(),
    adapter:adapter(),
    task:runtimeTask(),
    runtime_policy:runtimePolicy,
  });
  assert.equal(result.executed,true);
  assert.equal(result.record.status,"PARTIAL");
  assert.equal(result.record.actual_usage.tool_calls,null);
  assert.equal(result.record.actual_usage.input_tokens,null);
  assert.equal(result.record.actual_usage.output_tokens,null);
  assert.equal(result.record.actual_usage.cost.status,"UNKNOWN");
  assert.equal(result.record.teardown_verified,true);
});

test("runtime timeout ceiling cannot exceed sandbox duration ceiling",async()=>{
  await assert.rejects(
    ()=>executeLiveSandboxedTask({
      sandbox_policy:sandboxPolicy({max_duration_ms:1000}),
      declaration:declaration({
        projected_usage:{...declaration().projected_usage,duration_ms:1000},
      }),
      adapter:adapter(),
      task:runtimeTask(),
      runtime_policy:runtimePolicy,
      timeout_ms:1001,
    }),
    (error)=>{
      assert.equal(error.code,"SANDBOX_TIMEOUT_POLICY_VIOLATION");
      return true;
    },
  );
});


test("sandbox admission is bound to exact runtime task identity and risk before prepare",async()=>{
  const counter={prepare:0,execute:0,cleanup:0};
  await assert.rejects(
    ()=>executeLiveSandboxedTask({
      sandbox_policy:sandboxPolicy(),
      declaration:declaration({task_id:"other-task"}),
      adapter:adapter({counter}),
      task:runtimeTask(),
      runtime_policy:runtimePolicy,
    }),
    (error)=>{
      assert.equal(error.code,"SANDBOX_TASK_BINDING_MISMATCH");
      return true;
    },
  );
  assert.deepEqual(counter,{prepare:0,execute:0,cleanup:0});

  await assert.rejects(
    ()=>executeLiveSandboxedTask({
      sandbox_policy:sandboxPolicy({allowed_risk_classes:["READ_ONLY","LOCAL_WRITE"]}),
      declaration:declaration({risk_class:"LOCAL_WRITE"}),
      adapter:adapter({counter}),
      task:runtimeTask(),
      runtime_policy:runtimePolicy,
    }),
    (error)=>{
      assert.equal(error.code,"SANDBOX_RISK_BINDING_MISMATCH");
      return true;
    },
  );
  assert.deepEqual(counter,{prepare:0,execute:0,cleanup:0});
});
