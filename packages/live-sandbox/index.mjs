import { createHash } from "node:crypto";

export const LIVE_SANDBOX_API = 1;
export const LIVE_SANDBOX_COST_STATES = Object.freeze(["KNOWN","UNKNOWN"]);
export const LIVE_SANDBOX_MODEL_IDENTITY_STATES = Object.freeze(["KNOWN","UNKNOWN"]);

const COST_STATES = new Set(LIVE_SANDBOX_COST_STATES);
const MODEL_STATES = new Set(LIVE_SANDBOX_MODEL_IDENTITY_STATES);
const RISK_CLASSES = new Set(["READ_ONLY","LOCAL_WRITE","EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);
const MODEL_ROUTE_REF = /^model-route:sha256:[a-f0-9]{64}$/;
const CAPABILITY_ROUTE_REF = /^capability-route:sha256:[a-f0-9]{64}$/;

const clean=(value,max=1000)=>String(value??"").trim().slice(0,max);

function assert(condition,message){
  if(!condition) throw new Error(message);
}

function sortedUnique(values,normalize=(value)=>value){
  return Object.freeze(
    [...new Set((Array.isArray(values)?values:[]).map(normalize).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b)))
  );
}

function canonicalize(value){
  if(Array.isArray(value)) return value.map(canonicalize);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonicalize(value[key])]));
  }
  if(typeof value==="number"&&Object.is(value,-0)) return 0;
  return value;
}

function contentRef(prefix,payload){
  const digest=createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
  return `${prefix}:sha256:${digest}`;
}

function int(value,label,{min=0,max=Number.MAX_SAFE_INTEGER}={}){
  const n=Number(value);
  assert(Number.isInteger(n)&&n>=min&&n<=max,`${label} must be an integer between ${min} and ${max}.`);
  return n;
}

function nullableFinite(value,label){
  if(value==null) return null;
  const n=Number(value);
  assert(Number.isFinite(n)&&n>=0,`${label} must be null or a non-negative finite number.`);
  return n;
}

function normalizeCost(input={},label="cost"){
  assert(input&&typeof input==="object"&&!Array.isArray(input),`${label} must be an object.`);
  const status=clean(input.status,40).toUpperCase();
  assert(COST_STATES.has(status),`${label} status must be KNOWN or UNKNOWN.`);
  if(status==="UNKNOWN"){
    assert(input.amount_usd==null,`${label} UNKNOWN must not carry amount_usd.`);
    return Object.freeze({status:"UNKNOWN",amount_usd:null});
  }
  assert(input.amount_usd!=null,`${label} KNOWN requires amount_usd.`);
  const amount=Number(input.amount_usd);
  assert(Number.isFinite(amount)&&amount>=0,`${label} KNOWN requires a non-negative amount_usd.`);
  return Object.freeze({status:"KNOWN",amount_usd:amount});
}

function normalizeModelIdentity(input={},label="model_identity"){
  assert(input&&typeof input==="object"&&!Array.isArray(input),`${label} must be an object.`);
  const status=clean(input.status,40).toUpperCase();
  assert(MODEL_STATES.has(status),`${label}.status must be KNOWN or UNKNOWN.`);
  const modelId=input.model_id==null?null:clean(input.model_id,200);
  if(status==="KNOWN"){
    assert(modelId,`${label} KNOWN requires model_id.`);
    return Object.freeze({status:"KNOWN",model_id:modelId});
  }
  assert(modelId==null,`${label} UNKNOWN must not carry model_id.`);
  return Object.freeze({status:"UNKNOWN",model_id:null});
}

function normalizeProjectedUsage(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"projected_usage must be an object.");
  return Object.freeze({
    duration_ms:int(input.duration_ms,"projected_usage.duration_ms",{min:1,max:86_400_000}),
    tool_calls:int(input.tool_calls,"projected_usage.tool_calls",{min:0,max:100_000}),
    input_tokens:int(input.input_tokens,"projected_usage.input_tokens",{min:0,max:100_000_000}),
    output_tokens:int(input.output_tokens,"projected_usage.output_tokens",{min:0,max:100_000_000}),
    cost:normalizeCost(input.cost,"projected_usage.cost"),
  });
}

function normalizeFallbacks(input=[]){
  assert(Array.isArray(input),"fallback_models must be an array.");
  const items=input.map((item,index)=>{
    assert(item&&typeof item==="object"&&!Array.isArray(item),`fallback_models[${index}] must be an object.`);
    const providerId=clean(item.provider_id,120).toLowerCase();
    assert(providerId,`fallback_models[${index}].provider_id is required.`);
    return Object.freeze({
      provider_id:providerId,
      model_identity:normalizeModelIdentity(item.model_identity,`fallback_models[${index}].model_identity`),
    });
  }).sort((a,b)=>a.provider_id.localeCompare(b.provider_id)
    || a.model_identity.status.localeCompare(b.model_identity.status)
    || String(a.model_identity.model_id??"").localeCompare(String(b.model_identity.model_id??"")));
  const keys=items.map((item)=>JSON.stringify(item));
  assert(new Set(keys).size===keys.length,"fallback_models must not contain duplicates.");
  return Object.freeze(items);
}

export function defineLiveSandboxPolicy(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Live Sandbox policy must be an object.");
  assert(input.schema===LIVE_SANDBOX_API,"Live Sandbox policy schema must be 1.");
  const id=clean(input.id,120).toLowerCase();
  assert(/^[a-z][a-z0-9-]{1,119}$/.test(id),"Live Sandbox policy id must be a lowercase slug.");
  const maxInput=int(input.max_input_tokens,"max_input_tokens",{min:0,max:100_000_000});
  const maxOutput=int(input.max_output_tokens,"max_output_tokens",{min:0,max:100_000_000});
  const maxTotal=int(input.max_total_tokens,"max_total_tokens",{min:0,max:200_000_000});
  assert(maxTotal>=maxInput||maxTotal>=maxOutput,"max_total_tokens must allow at least one configured token ceiling.");

  const risks=sortedUnique(input.allowed_risk_classes,(value)=>clean(value,40).toUpperCase());
  assert(risks.length>0,"allowed_risk_classes must be non-empty.");
  for(const risk of risks) assert(RISK_CLASSES.has(risk),`Unknown sandbox risk class: ${risk}`);

  const providers=sortedUnique(input.allowed_runtime_providers,(value)=>clean(value,120).toLowerCase());
  assert(providers.length>0,"allowed_runtime_providers must be non-empty.");

  return Object.freeze({
    schema:LIVE_SANDBOX_API,
    id,
    allowed_risk_classes:risks,
    max_duration_ms:int(input.max_duration_ms,"max_duration_ms",{min:1,max:45_000}),
    max_tool_calls:int(input.max_tool_calls,"max_tool_calls",{min:0,max:10_000}),
    max_input_tokens:maxInput,
    max_output_tokens:maxOutput,
    max_total_tokens:maxTotal,
    max_cost_usd:nullableFinite(input.max_cost_usd,"max_cost_usd"),
    allowed_tool_ids:sortedUnique(input.allowed_tool_ids,(value)=>clean(value,160).toLowerCase()),
    allowed_network_hosts:sortedUnique(input.allowed_network_hosts,(value)=>clean(value,253).toLowerCase()),
    allowed_runtime_providers:providers,
    allow_fallback:input.allow_fallback===true,
    require_temporary_workspace:input.require_temporary_workspace!==false,
    forbid_external_write:input.forbid_external_write!==false,
    forbid_credentials_exposure:input.forbid_credentials_exposure!==false,
  });
}

function normalizeDeclaration(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Sandbox dispatch declaration must be an object.");
  assert(input.schema===LIVE_SANDBOX_API,"Sandbox dispatch declaration schema must be 1.");
  const missionId=clean(input.mission_id,160);
  const taskId=clean(input.task_id,160);
  const riskClass=clean(input.risk_class,40).toUpperCase();
  const providerId=clean(input.provider_id,120).toLowerCase();
  assert(missionId,"mission_id is required.");
  assert(taskId,"task_id is required.");
  assert(RISK_CLASSES.has(riskClass),"risk_class is invalid.");
  assert(providerId,"provider_id is required.");

  const modelRouteRef=input.model_route_ref==null?null:clean(input.model_route_ref,1000);
  if(modelRouteRef!=null) assert(MODEL_ROUTE_REF.test(modelRouteRef),"model_route_ref is invalid.");

  const capabilityRefs=sortedUnique(input.capability_route_refs,(value)=>clean(value,1000));
  for(const ref of capabilityRefs) assert(CAPABILITY_ROUTE_REF.test(ref),`Invalid capability route ref: ${ref}`);

  return Object.freeze({
    schema:LIVE_SANDBOX_API,
    mission_id:missionId,
    task_id:taskId,
    risk_class:riskClass,
    provider_id:providerId,
    model_identity:normalizeModelIdentity(input.model_identity),
    model_route_ref:modelRouteRef,
    capability_route_refs:capabilityRefs,
    tool_ids:sortedUnique(input.tool_ids,(value)=>clean(value,160).toLowerCase()),
    network_hosts:sortedUnique(input.network_hosts,(value)=>clean(value,253).toLowerCase()),
    fallback_models:normalizeFallbacks(input.fallback_models),
    credentials_exposed_to_task:input.credentials_exposed_to_task===true,
    projected_usage:normalizeProjectedUsage(input.projected_usage),
  });
}

function admissionPayload(value){
  return Object.freeze({
    schema:value.schema,
    policy:value.policy,
    allowed:value.allowed,
    decision:value.decision,
    reason_codes:value.reason_codes,
    mission_id:value.mission_id,
    task_id:value.task_id,
    risk_class:value.risk_class,
    provider_id:value.provider_id,
    model_identity:value.model_identity,
    model_route_ref:value.model_route_ref,
    capability_route_refs:value.capability_route_refs,
    tool_ids:value.tool_ids,
    network_hosts:value.network_hosts,
    fallback_models:value.fallback_models,
    credentials_exposed_to_task:value.credentials_exposed_to_task,
    projected_usage:value.projected_usage,
  });
}

export function validateSandboxAdmission(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Sandbox admission must be an object.");
  const ref=clean(input.sandbox_admission_ref,1000);
  assert(/^sandbox-admission:sha256:[a-f0-9]{64}$/.test(ref),"Sandbox admission has invalid sandbox_admission_ref.");
  const expected=contentRef("sandbox-admission",admissionPayload(input));
  assert(expected===ref,"Sandbox admission ref does not match decision payload content.");
  return true;
}

export function admitLiveSandboxDispatch(policyInput,declarationInput){
  const policy=defineLiveSandboxPolicy(policyInput);
  const declaration=normalizeDeclaration(declarationInput);
  const reasons=[];

  if(!policy.allowed_risk_classes.includes(declaration.risk_class)) reasons.push("RISK_CLASS_NOT_ALLOWED");
  if(!policy.allowed_runtime_providers.includes(declaration.provider_id)) reasons.push("RUNTIME_PROVIDER_NOT_ALLOWED");
  if(declaration.projected_usage.duration_ms>policy.max_duration_ms) reasons.push("DURATION_LIMIT_EXCEEDED");
  if(declaration.projected_usage.tool_calls>policy.max_tool_calls) reasons.push("TOOL_CALL_LIMIT_EXCEEDED");
  if(declaration.projected_usage.input_tokens>policy.max_input_tokens) reasons.push("INPUT_TOKEN_LIMIT_EXCEEDED");
  if(declaration.projected_usage.output_tokens>policy.max_output_tokens) reasons.push("OUTPUT_TOKEN_LIMIT_EXCEEDED");
  if(declaration.projected_usage.input_tokens+declaration.projected_usage.output_tokens>policy.max_total_tokens) reasons.push("TOTAL_TOKEN_LIMIT_EXCEEDED");

  if(policy.max_cost_usd!=null){
    if(declaration.projected_usage.cost.status==="UNKNOWN") reasons.push("PROJECTED_COST_UNKNOWN");
    else if(declaration.projected_usage.cost.amount_usd>policy.max_cost_usd) reasons.push("PROJECTED_COST_LIMIT_EXCEEDED");
  }

  if(declaration.tool_ids.some((id)=>!policy.allowed_tool_ids.includes(id))) reasons.push("TOOL_NOT_ALLOWLISTED");
  if(declaration.network_hosts.some((host)=>!policy.allowed_network_hosts.includes(host))) reasons.push("NETWORK_HOST_NOT_ALLOWLISTED");
  if(!policy.allow_fallback&&declaration.fallback_models.length>0) reasons.push("FALLBACK_NOT_ALLOWED");
  if(policy.forbid_credentials_exposure&&declaration.credentials_exposed_to_task) reasons.push("CREDENTIAL_EXPOSURE_FORBIDDEN");

  const allowed=reasons.length===0;
  const value=Object.freeze({
    schema:LIVE_SANDBOX_API,
    policy,
    allowed,
    decision:allowed?"ADMITTED":"BLOCKED",
    reason_codes:Object.freeze([...new Set(reasons)]),
    ...declaration,
  });
  const payload=admissionPayload(value);
  return Object.freeze({
    ...value,
    sandbox_admission_ref:contentRef("sandbox-admission",payload),
  });
}


function nullableCounter(value,label,{min=0,max=Number.MAX_SAFE_INTEGER}={}){
  if(value==null) return null;
  return int(value,label,{min,max});
}

function normalizeActualUsage(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"actual usage must be an object.");
  return Object.freeze({
    duration_ms:int(input.duration_ms,"actual_usage.duration_ms",{min:0,max:86_400_000}),
    tool_calls:nullableCounter(input.tool_calls,"actual_usage.tool_calls",{min:0,max:100_000}),
    input_tokens:nullableCounter(input.input_tokens,"actual_usage.input_tokens",{min:0,max:100_000_000}),
    output_tokens:nullableCounter(input.output_tokens,"actual_usage.output_tokens",{min:0,max:100_000_000}),
    cost:normalizeCost(input.cost,"actual_usage.cost"),
  });
}

function sandboxRecordPayload(value){
  return Object.freeze({
    schema:value.schema,
    sandbox_admission_ref:value.sandbox_admission_ref,
    mission_id:value.mission_id,
    task_id:value.task_id,
    provider_id:value.provider_id,
    model_identity:value.model_identity,
    status:value.status,
    execution_state:value.execution_state,
    execution_ok:value.execution_ok,
    quota_status:value.quota_status,
    teardown_verified:value.teardown_verified,
    reason_codes:value.reason_codes,
    unverified_dimensions:value.unverified_dimensions,
    projected_usage:value.projected_usage,
    actual_usage:value.actual_usage,
    runtime:value.runtime,
    cleanup:value.cleanup,
    workspace_evidence:value.workspace_evidence,
  });
}

export function validateSandboxRecord(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Sandbox record must be an object.");
  const ref=clean(input.sandbox_record_ref,1000);
  assert(/^sandbox-record:sha256:[a-f0-9]{64}$/.test(ref),"Sandbox record has invalid sandbox_record_ref.");
  const expected=contentRef("sandbox-record",sandboxRecordPayload(input));
  assert(expected===ref,"Sandbox record ref does not match record payload content.");
  return true;
}

export function settleLiveSandbox(admissionInput,outcomeInput,actualUsageInput){
  validateSandboxAdmission(admissionInput);
  assert(admissionInput.allowed===true,"Sandbox settlement requires an admitted dispatch.");
  assert(outcomeInput&&typeof outcomeInput==="object"&&!Array.isArray(outcomeInput),"Runtime outcome is required for sandbox settlement.");

  const policy=defineLiveSandboxPolicy(admissionInput.policy);
  const actualUsage=normalizeActualUsage(actualUsageInput);
  const reasons=[];
  const unverified=[];

  const runtimeProvider=clean(outcomeInput.runtime?.provider,120).toLowerCase();
  const runtimeRef=clean(outcomeInput.runtime?.runtime_ref,512);
  const providerVersion=outcomeInput.runtime?.provider_version==null?null:clean(outcomeInput.runtime.provider_version,120);
  if(runtimeProvider!==admissionInput.provider_id) reasons.push("RUNTIME_PROVIDER_MISMATCH");
  if(outcomeInput.ok!==true||clean(outcomeInput.state,40).toUpperCase()!=="SUCCEEDED"){
    reasons.push("RUNTIME_EXECUTION_NOT_SUCCESSFUL");
  }

  if(actualUsage.duration_ms>policy.max_duration_ms) reasons.push("ACTUAL_DURATION_LIMIT_EXCEEDED");
  if(actualUsage.tool_calls==null) unverified.push("TOOL_CALLS");
  else if(actualUsage.tool_calls>policy.max_tool_calls) reasons.push("ACTUAL_TOOL_CALL_LIMIT_EXCEEDED");

  if(actualUsage.input_tokens==null) unverified.push("INPUT_TOKENS");
  else if(actualUsage.input_tokens>policy.max_input_tokens) reasons.push("ACTUAL_INPUT_TOKEN_LIMIT_EXCEEDED");

  if(actualUsage.output_tokens==null) unverified.push("OUTPUT_TOKENS");
  else if(actualUsage.output_tokens>policy.max_output_tokens) reasons.push("ACTUAL_OUTPUT_TOKEN_LIMIT_EXCEEDED");

  if(actualUsage.input_tokens==null||actualUsage.output_tokens==null){
    unverified.push("TOTAL_TOKENS");
  }else if(actualUsage.input_tokens+actualUsage.output_tokens>policy.max_total_tokens){
    reasons.push("ACTUAL_TOTAL_TOKEN_LIMIT_EXCEEDED");
  }

  if(policy.max_cost_usd!=null){
    if(actualUsage.cost.status==="UNKNOWN") unverified.push("COST");
    else if(actualUsage.cost.amount_usd>policy.max_cost_usd) reasons.push("ACTUAL_COST_LIMIT_EXCEEDED");
  }

  const cleanup=Object.freeze({
    attempted:outcomeInput.cleanup?.attempted===true,
    ok:outcomeInput.cleanup?.ok===true,
  });
  if(!cleanup.attempted||!cleanup.ok) reasons.push("CLEANUP_NOT_VERIFIED");

  const workspace=Object.freeze({
    temporary_workspace_only:outcomeInput.evidence?.workspace_mutation_check?.temporary_workspace_only===true,
    production_repo_changed:outcomeInput.evidence?.workspace_mutation_check?.production_repo_changed===true,
  });
  if(policy.require_temporary_workspace&&!workspace.temporary_workspace_only) reasons.push("TEMPORARY_WORKSPACE_NOT_PROVEN");
  if(workspace.production_repo_changed) reasons.push("PRODUCTION_REPO_MUTATION");

  if(policy.forbid_external_write&&outcomeInput.evidence?.runtime_actions?.external_write===true){
    reasons.push("EXTERNAL_WRITE_OBSERVED");
  }

  const uniqueReasons=Object.freeze([...new Set(reasons)]);
  const uniqueUnverified=Object.freeze([...new Set(unverified)].sort());

  const quotaReasonPrefixes=[
    "ACTUAL_DURATION_LIMIT_EXCEEDED",
    "ACTUAL_TOOL_CALL_LIMIT_EXCEEDED",
    "ACTUAL_INPUT_TOKEN_LIMIT_EXCEEDED",
    "ACTUAL_OUTPUT_TOKEN_LIMIT_EXCEEDED",
    "ACTUAL_TOTAL_TOKEN_LIMIT_EXCEEDED",
    "ACTUAL_COST_LIMIT_EXCEEDED",
  ];
  const quotaFailed=uniqueReasons.some((reason)=>quotaReasonPrefixes.includes(reason));
  const quotaStatus=quotaFailed?"FAIL":uniqueUnverified.length?"PARTIAL":"PASS";
  const status=uniqueReasons.length?"FAIL":uniqueUnverified.length?"PARTIAL":"PASS";
  const teardownVerified=cleanup.attempted&&cleanup.ok&&workspace.temporary_workspace_only&&!workspace.production_repo_changed;

  const value=Object.freeze({
    schema:LIVE_SANDBOX_API,
    sandbox_admission_ref:admissionInput.sandbox_admission_ref,
    mission_id:admissionInput.mission_id,
    task_id:admissionInput.task_id,
    provider_id:admissionInput.provider_id,
    model_identity:admissionInput.model_identity,
    status,
    execution_state:clean(outcomeInput.state,40).toUpperCase()||"UNKNOWN",
    execution_ok:outcomeInput.ok===true,
    quota_status:quotaStatus,
    teardown_verified:teardownVerified,
    reason_codes:uniqueReasons,
    unverified_dimensions:uniqueUnverified,
    projected_usage:admissionInput.projected_usage,
    actual_usage:actualUsage,
    runtime:Object.freeze({
      provider:runtimeProvider,
      runtime_ref:runtimeRef,
      provider_version:providerVersion,
    }),
    cleanup,
    workspace_evidence:workspace,
  });
  return Object.freeze({
    ...value,
    sandbox_record_ref:contentRef("sandbox-record",sandboxRecordPayload(value)),
  });
}
