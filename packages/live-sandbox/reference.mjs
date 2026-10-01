import { defineLiveSandboxPolicy } from "./index.mjs";

function clean(value,max=1000){
  return String(value??"").trim().slice(0,max);
}

function assert(condition,message){
  if(!condition) throw new Error(message);
}

export function buildReferenceSandboxDeclaration({
  reference,
  runtime,
  sandboxPolicy,
  missionId=null,
}={}){
  const policy=defineLiveSandboxPolicy(sandboxPolicy);
  const runtimeId=clean(runtime,120).toLowerCase();
  assert(policy.allowed_runtime_providers.includes(runtimeId),"Reference sandbox runtime is not allowed by policy.");

  const task=reference?.core_bundle?.task;
  assert(task&&typeof task==="object","Reference sandbox requires canonical task.");
  const taskId=clean(task.task_id,160);
  const riskClass=clean(task.risk_class,40).toUpperCase();
  assert(taskId,"Reference sandbox canonical task_id is required.");
  assert(policy.allowed_risk_classes.includes(riskClass),"Reference sandbox task risk is not allowed by policy.");

  return Object.freeze({
    schema:1,
    mission_id:clean(missionId,160)||`mission-portability-live-${runtimeId}`,
    task_id:taskId,
    risk_class:riskClass,
    provider_id:runtimeId,
    model_identity:Object.freeze({status:"UNKNOWN",model_id:null}),
    model_route_ref:null,
    capability_route_refs:Object.freeze([]),
    tool_ids:Object.freeze([]),
    network_hosts:Object.freeze([]),
    fallback_models:Object.freeze([]),
    credentials_exposed_to_task:false,
    projected_usage:Object.freeze({
      duration_ms:policy.max_duration_ms,
      tool_calls:0,
      input_tokens:policy.max_input_tokens,
      output_tokens:policy.max_output_tokens,
      cost:Object.freeze({status:"UNKNOWN",amount_usd:null}),
    }),
  });
}
