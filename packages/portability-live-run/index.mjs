import { containsSecretLikeContent, sha256 } from "../execution-receipt/index.mjs";
import { createPortabilityRunRecord } from "../portability-comparator/index.mjs";
import { executeBoundedRuntimeTask } from "../runtime-execution-adapter/index.mjs";
import { createHermesReferenceExecutionAdapter } from "../hermes-execution-adapter/index.mjs";
import { createCodexReferenceExecutionAdapter } from "../codex-execution-adapter/index.mjs";

export const LIVE_REFERENCE_RUN_SCHEMA = 1;
export const LIVE_REFERENCE_RUN_ORIGIN = "canonical-live-reference-runner-v1";

const GIT_SHA=/^[a-f0-9]{40}$/;
const PRIVATE_PATH_PATTERNS=[
  /[A-Za-z]:\\Users\\[^\\\s]+/i,
  /[A-Za-z]:\\[^\s"'<>]+/i,
  /\/home\/[^/\s]+\//i,
  /\/Users\/[^/\s]+\//i,
];

const clean=(value,max=1000)=>String(value??"").trim().slice(0,max);

function freeze(value){
  if(!value||typeof value!=="object"||Object.isFrozen(value)) return value;
  if(ArrayBuffer.isView(value)) return value;
  for(const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function assert(condition,message){
  if(!condition) throw new Error(message);
}

export function scanPublicRunRecord(value){
  const serialized=JSON.stringify(value);
  const findings=[];
  if(containsSecretLikeContent(value)) findings.push("SECRET_LIKE_CONTENT");
  for(const pattern of PRIVATE_PATH_PATTERNS){
    if(pattern.test(serialized)){findings.push("PRIVATE_MACHINE_PATH");break;}
  }
  if(/(?:OPENAI_API_KEY|HERMES_HOME|NYOBAKANTORAI_HERMES_HOME|GITHUB_TOKEN|GH_TOKEN)\s*[:=]/i.test(serialized)){
    findings.push("CREDENTIAL_OR_PRIVATE_ENV_NAME_VALUE");
  }
  return freeze({ok:findings.length===0,findings:Object.freeze([...new Set(findings)])});
}

export function evaluateLiveQualification({
  runtime,
  repository,
  provider,
  versionProbe,
  outcome,
  executionSource,
  publicSafety,
}={}){
  const reasons=[];
  const runtimeId=clean(runtime,64).toLowerCase();
  if(!["hermes","codex"].includes(runtimeId)) reasons.push("RUNTIME_UNSUPPORTED");
  if(repository?.clean!==true) reasons.push("REPOSITORY_NOT_CLEAN");
  if(!GIT_SHA.test(repository?.commit||"")) reasons.push("EXACT_GIT_COMMIT_MISSING");
  if(provider?.install_state!=="INSTALLED") reasons.push("PROVIDER_NOT_INSTALLED");
  if(provider?.command_detected!==true) reasons.push("PROVIDER_COMMAND_NOT_DETECTED");
  if(versionProbe?.ok!==true || !clean(versionProbe?.version,120)) reasons.push("PROVIDER_VERSION_UNVERIFIED");
  if(executionSource!==LIVE_REFERENCE_RUN_ORIGIN) reasons.push("NON_CANONICAL_EXECUTION_SOURCE");
  if(outcome?.ok!==true || outcome?.state!=="SUCCEEDED") reasons.push("RUNTIME_EXECUTION_NOT_SUCCESSFUL");
  if(outcome?.cleanup?.ok!==true) reasons.push("CLEANUP_NOT_SUCCESSFUL");
  if(outcome?.evidence?.workspace_mutation_check?.temporary_workspace_only!==true) reasons.push("TEMPORARY_WORKSPACE_NOT_PROVEN");
  if(outcome?.evidence?.workspace_mutation_check?.production_repo_changed!==false) reasons.push("PRODUCTION_REPO_MUTATION");
  if(outcome?.evidence?.prohibited_action_check?.passed!==true) reasons.push("PROHIBITED_ACTION_CHECK_FAILED");
  if(publicSafety?.ok!==true) reasons.push("PUBLIC_SAFETY_SCAN_FAILED");

  return freeze({
    eligible:reasons.length===0,
    evidence_class:reasons.length===0 ? "LIVE_RUNTIME_EVIDENCE" : "UNVERIFIED_RUNTIME_ATTEMPT",
    reasons:Object.freeze(reasons),
  });
}

function adapterForRuntime(runtime,{reference,executable,providerVersion,codeCommit,invokeImpl}={}){
  const common={reference,executable,providerVersion,codeCommit};
  if(invokeImpl) common.invokeImpl=invokeImpl;
  if(runtime==="hermes") return createHermesReferenceExecutionAdapter(common);
  if(runtime==="codex") return createCodexReferenceExecutionAdapter(common);
  throw new Error("unsupported runtime: "+runtime);
}

function captureMetadata({runtime,mode,repository,provider,versionProbe,qualification,publicSafety}){
  return freeze({
    schema:1,
    origin:mode==="live" ? LIVE_REFERENCE_RUN_ORIGIN : "fixture-reference-runner-v1",
    runtime,
    mode,
    repository:{
      commit:repository?.commit||null,
      clean:repository?.clean===true,
    },
    provider:{
      install_state:provider?.install_state||"UNKNOWN",
      command_detected:provider?.command_detected===true,
      version_verified:versionProbe?.ok===true,
      version:versionProbe?.ok===true ? clean(versionProbe.version,120) : null,
    },
    qualification,
    public_safety:publicSafety,
  });
}

export async function runReferenceEvidence({
  runtime,
  mode="fixture",
  reference,
  policy,
  repository,
  provider,
  versionProbe,
  executable,
  invokeImpl,
  clock,
}={}){
  const runtimeId=clean(runtime,64).toLowerCase();
  assert(["hermes","codex"].includes(runtimeId),"runtime must be hermes or codex");
  assert(reference?.manifest?.core_bundle_sha256,"canonical reference required");
  assert(policy?.schema===1,"execution policy required");
  assert(["fixture","live"].includes(mode),"mode must be fixture or live");

  if(mode==="live"){
    assert(!invokeImpl,"live mode forbids injected invocation implementations");
    assert(repository?.clean===true,"live mode requires clean repository");
    assert(GIT_SHA.test(repository?.commit||""),"live mode requires exact Git commit");
    assert(provider?.install_state==="INSTALLED" && provider?.command_detected===true,"live mode requires detected installed provider command");
    assert(versionProbe?.ok===true && clean(versionProbe.version,120),"live mode requires provider version probe");
  } else {
    assert(typeof invokeImpl==="function","fixture mode requires injected invocation implementation");
  }

  const bound=adapterForRuntime(runtimeId,{
    reference,
    executable,
    providerVersion:versionProbe?.ok===true ? clean(versionProbe.version,120) : "UNVERIFIED",
    codeCommit:GIT_SHA.test(repository?.commit||"") ? repository.commit : "UNVERIFIED",
    invokeImpl,
  });

  const outcome=await executeBoundedRuntimeTask(bound.adapter,reference.core_bundle.task,{
    policy,
    timeoutMs:policy.max_timeout_ms,
    clock,
  });
  const provisionalClass=mode==="fixture" ? "FIXTURE_EVIDENCE" : "UNVERIFIED_RUNTIME_ATTEMPT";
  let record=createPortabilityRunRecord({
    reference,
    outcome,
    evidenceClass:provisionalClass,
    externalVerification:{status:"NOT_RUN",independent:false},
  });

  const provisionalSafety=scanPublicRunRecord(record);
  const qualification=mode==="fixture"
    ? freeze({eligible:false,evidence_class:"FIXTURE_EVIDENCE",reasons:Object.freeze(["FIXTURE_EXECUTION"])})
    : evaluateLiveQualification({
        runtime:runtimeId,
        repository,
        provider,
        versionProbe,
        outcome,
        executionSource:LIVE_REFERENCE_RUN_ORIGIN,
        publicSafety:provisionalSafety,
      });

  if(qualification.evidence_class!==provisionalClass){
    record=createPortabilityRunRecord({
      reference,
      outcome,
      evidenceClass:qualification.evidence_class,
      externalVerification:{status:"NOT_RUN",independent:false},
    });
  }

  const finalSafety=scanPublicRunRecord(record);
  if(qualification.evidence_class==="LIVE_RUNTIME_EVIDENCE" && !finalSafety.ok){
    record=createPortabilityRunRecord({
      reference,
      outcome,
      evidenceClass:"UNVERIFIED_RUNTIME_ATTEMPT",
      externalVerification:{status:"NOT_RUN",independent:false},
    });
  }

  const finalQualification=qualification.evidence_class==="LIVE_RUNTIME_EVIDENCE" && !finalSafety.ok
    ? freeze({eligible:false,evidence_class:"UNVERIFIED_RUNTIME_ATTEMPT",reasons:Object.freeze(["PUBLIC_SAFETY_SCAN_FAILED"])})
    : qualification;

  const capture=captureMetadata({
    runtime:runtimeId,
    mode,
    repository,
    provider,
    versionProbe,
    qualification:finalQualification,
    publicSafety:finalSafety,
  });
  const publicRecord=freeze({...structuredClone(record),capture});
  const publicScan=scanPublicRunRecord(publicRecord);
  assert(publicScan.ok,"public run record failed safety scan: "+publicScan.findings.join(", "));

  return freeze({
    record:publicRecord,
    record_sha256:sha256(JSON.stringify(publicRecord)),
    qualification:finalQualification,
  });
}
