import { executeBoundedRuntimeTask } from "../runtime-execution-adapter/index.mjs";
import {
  defineLiveSandboxPolicy,
  admitLiveSandboxDispatch,
  settleLiveSandbox,
} from "./index.mjs";

function sandboxError(code,message){
  const error=new Error(message);
  error.code=code;
  return error;
}

function actualDuration(outcome){
  const started=Date.parse(outcome?.started_at);
  const finished=Date.parse(outcome?.finished_at);
  if(Number.isFinite(started)&&Number.isFinite(finished)&&finished>=started) return finished-started;
  return 0;
}

function unknownUsage(outcome){
  return Object.freeze({
    duration_ms:actualDuration(outcome),
    tool_calls:null,
    input_tokens:null,
    output_tokens:null,
    cost:Object.freeze({status:"UNKNOWN",amount_usd:null}),
  });
}

export async function executeLiveSandboxedTask({
  sandbox_policy,
  declaration,
  adapter,
  task,
  runtime_policy,
  timeout_ms=null,
  usage_reporter=null,
  clock=()=>new Date().toISOString(),
}={}){
  const policy=defineLiveSandboxPolicy(sandbox_policy);
  const admission=admitLiveSandboxDispatch(policy,declaration);

  if(!admission.allowed){
    return Object.freeze({
      admission,
      executed:false,
      outcome:null,
      record:null,
    });
  }

  const runtimeTaskId=String(task?.task_id??"").trim();
  if(runtimeTaskId!==admission.task_id){
    throw sandboxError(
      "SANDBOX_TASK_BINDING_MISMATCH",
      `Sandbox admission task ${admission.task_id} does not match runtime task ${runtimeTaskId||"(empty)"}.`,
    );
  }

  const runtimeRisk=String(task?.risk_class??"").trim().toUpperCase();
  if(runtimeRisk!==admission.risk_class){
    throw sandboxError(
      "SANDBOX_RISK_BINDING_MISMATCH",
      `Sandbox admission risk ${admission.risk_class} does not match runtime task risk ${runtimeRisk||"(empty)"}.`,
    );
  }

  const adapterProvider=String(adapter?.runtime?.provider??"").trim().toLowerCase();
  if(adapterProvider!==admission.provider_id){
    throw sandboxError(
      "SANDBOX_RUNTIME_PROVIDER_MISMATCH",
      `Sandbox declared provider ${admission.provider_id} does not match runtime adapter provider ${adapterProvider||"(empty)"}.`,
    );
  }

  const requestedTimeout=timeout_ms==null
    ? Math.min(admission.projected_usage.duration_ms,policy.max_duration_ms)
    : Number(timeout_ms);

  if(!Number.isInteger(requestedTimeout)||requestedTimeout<1||requestedTimeout>policy.max_duration_ms){
    throw sandboxError("SANDBOX_TIMEOUT_POLICY_VIOLATION","Sandbox runtime timeout exceeds sandbox duration ceiling.");
  }

  const outcome=await executeBoundedRuntimeTask(adapter,task,{
    policy:runtime_policy,
    timeoutMs:requestedTimeout,
    clock,
  });

  let actual=unknownUsage(outcome);
  if(usage_reporter!=null){
    if(typeof usage_reporter!=="function") throw sandboxError("SANDBOX_USAGE_REPORTER_INVALID","usage_reporter must be a function or null.");
    actual=await usage_reporter(Object.freeze({admission,outcome}));
  }

  const record=settleLiveSandbox(admission,outcome,actual);
  return Object.freeze({
    admission,
    executed:true,
    outcome,
    record,
  });
}
