import test from "node:test";
import assert from "node:assert/strict";
import { buildReferenceSandboxDeclaration } from "./reference.mjs";

const sandboxPolicy={
  schema:1,
  id:"v0-6-live-sandbox",
  allowed_risk_classes:["READ_ONLY"],
  max_duration_ms:45000,
  max_tool_calls:0,
  max_input_tokens:12000,
  max_output_tokens:4000,
  max_total_tokens:16000,
  max_cost_usd:null,
  allowed_tool_ids:[],
  allowed_network_hosts:[],
  allowed_runtime_providers:["codex","hermes"],
  allow_fallback:false,
  require_temporary_workspace:true,
  forbid_external_write:true,
  forbid_credentials_exposure:true,
};
const reference={
  core_bundle:{
    task:{
      task_id:"task-reference-sandbox",
      risk_class:"READ_ONLY",
    },
  },
};

test("reference sandbox declaration binds canonical task/risk and reserves policy ceilings",()=>{
  const result=buildReferenceSandboxDeclaration({
    reference,
    runtime:"codex",
    sandboxPolicy,
  });
  assert.equal(result.mission_id,"mission-portability-live-codex");
  assert.equal(result.task_id,"task-reference-sandbox");
  assert.equal(result.risk_class,"READ_ONLY");
  assert.equal(result.provider_id,"codex");
  assert.deepEqual(result.model_identity,{status:"UNKNOWN",model_id:null});
  assert.equal(result.model_route_ref,null);
  assert.deepEqual(result.capability_route_refs,[]);
  assert.deepEqual(result.tool_ids,[]);
  assert.deepEqual(result.network_hosts,[]);
  assert.deepEqual(result.fallback_models,[]);
  assert.equal(result.credentials_exposed_to_task,false);
  assert.deepEqual(result.projected_usage,{
    duration_ms:45000,
    tool_calls:0,
    input_tokens:12000,
    output_tokens:4000,
    cost:{status:"UNKNOWN",amount_usd:null},
  });
});

test("reference declaration refuses unsupported runtime and non-read-only canonical task",()=>{
  assert.throws(()=>buildReferenceSandboxDeclaration({
    reference,
    runtime:"other",
    sandboxPolicy,
  }),/runtime.*allowed|allowed.*runtime/i);

  assert.throws(()=>buildReferenceSandboxDeclaration({
    reference:{core_bundle:{task:{task_id:"write-task",risk_class:"EXTERNAL_WRITE"}}},
    runtime:"codex",
    sandboxPolicy,
  }),/risk.*allowed|allowed.*risk/i);
});
