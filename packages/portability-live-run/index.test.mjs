import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildPortabilityReferenceCase } from "../portability-reference/index.mjs";
import { comparePortabilityReferenceRuns } from "../portability-comparator/index.mjs";
import { HERMES_REFERENCE_RESULT_MARKER } from "../hermes-execution-adapter/index.mjs";
import { CODEX_REFERENCE_RESULT_MARKER } from "../codex-execution-adapter/index.mjs";
import {
  LIVE_REFERENCE_RUN_ORIGIN,
  evaluateLiveQualification,
  runReferenceEvidence,
  scanPublicRunRecord,
} from "./index.mjs";

const rootPath=fileURLToPath(new URL("../../",import.meta.url));
const rootUrl=new URL("../../",import.meta.url);
const reference=await buildPortabilityReferenceCase({root:rootPath});
const policy=JSON.parse(await readFile(new URL("config/runtime-execution-policy.json",rootUrl),"utf8"));
const commit="2b95304a239503024c8eadbcd82941bf691ec0d1";
const validPayload={
  schema:1,
  review_state:"FAIL",
  claims:[
    {claim_id:"claim-worker",verdict:"SUPPORTED",evidence_path:"facts.canonical_worker"},
    {claim_id:"claim-write",verdict:"CONTRADICTED",evidence_path:"facts.external_write_performed"},
    {claim_id:"claim-verified",verdict:"CONTRADICTED",evidence_path:"facts.source_status"},
  ],
  residual_limitations:["The evidence packet is incomplete, so this reference case is not VERIFIED."],
};

function fake(marker){
  return async()=>({
    status:0,signal:null,aborted:false,
    stdout:JSON.stringify({type:"message",content:marker+JSON.stringify(validPayload)})+"\n",
    stderr:"",error:null,
  });
}

const repo={commit,clean:true};
const provider={install_state:"INSTALLED",command_detected:true};
const version={ok:true,version:"fixture-1.0"};

test("fixture execution can never self-promote to LIVE_RUNTIME_EVIDENCE",async()=>{
  const result=await runReferenceEvidence({
    runtime:"hermes",mode:"fixture",reference,policy,repository:repo,provider,versionProbe:version,
    executable:"hermes",invokeImpl:fake(HERMES_REFERENCE_RESULT_MARKER),
  });
  assert.equal(result.record.evidence_class,"FIXTURE_EVIDENCE");
  assert.equal(result.qualification.eligible,false);
  assert.deepEqual(result.qualification.reasons,["FIXTURE_EXECUTION"]);
  assert.equal(result.record.capture.mode,"fixture");
});

test("fixture Hermes and Codex records remain PARTIAL in Chat 7 comparator",async()=>{
  const hermes=await runReferenceEvidence({
    runtime:"hermes",mode:"fixture",reference,policy,repository:repo,provider,versionProbe:version,
    executable:"hermes",invokeImpl:fake(HERMES_REFERENCE_RESULT_MARKER),
  });
  const codex=await runReferenceEvidence({
    runtime:"codex",mode:"fixture",reference,policy,repository:repo,provider,versionProbe:version,
    executable:"codex",invokeImpl:fake(CODEX_REFERENCE_RESULT_MARKER),
  });
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes.record,codex.record]});
  assert.equal(report.state,"PARTIAL");
  assert.equal(report.parity_claim_allowed,false);
  assert.ok(report.blocking_reasons.includes("FIXTURE_ONLY_EVIDENCE"));
});

test("live mode rejects injected invocation before executing anything",async()=>{
  await assert.rejects(
    ()=>runReferenceEvidence({
      runtime:"codex",mode:"live",reference,policy,repository:repo,provider,versionProbe:version,
      executable:"codex",invokeImpl:fake(CODEX_REFERENCE_RESULT_MARKER),
    }),
    /forbids injected invocation/
  );
});

test("qualification requires clean exact commit, installed command, version probe, canonical origin, success, and safety",()=>{
  const base={
    runtime:"codex",
    repository:repo,
    provider,
    versionProbe:version,
    outcome:{
      ok:true,state:"SUCCEEDED",cleanup:{ok:true},
      evidence:{
        workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
        prohibited_action_check:{passed:true},
      },
    },
    executionSource:LIVE_REFERENCE_RUN_ORIGIN,
    publicSafety:{ok:true},
  };
  const ok=evaluateLiveQualification(base);
  assert.equal(ok.eligible,true);
  assert.equal(ok.evidence_class,"LIVE_RUNTIME_EVIDENCE");

  const variants=[
    [{...base,repository:{commit,clean:false}},"REPOSITORY_NOT_CLEAN"],
    [{...base,repository:{commit:"not-a-sha",clean:true}},"EXACT_GIT_COMMIT_MISSING"],
    [{...base,provider:{install_state:"NOT_INSTALLED",command_detected:false}},"PROVIDER_NOT_INSTALLED"],
    [{...base,versionProbe:{ok:false,version:null}},"PROVIDER_VERSION_UNVERIFIED"],
    [{...base,executionSource:"fixture-reference-runner-v1"},"NON_CANONICAL_EXECUTION_SOURCE"],
    [{...base,outcome:{...base.outcome,ok:false,state:"FAILED"}},"RUNTIME_EXECUTION_NOT_SUCCESSFUL"],
    [{...base,publicSafety:{ok:false}},"PUBLIC_SAFETY_SCAN_FAILED"],
  ];
  for(const [input,reason] of variants){
    const result=evaluateLiveQualification(input);
    assert.equal(result.eligible,false);
    assert.equal(result.evidence_class,"UNVERIFIED_RUNTIME_ATTEMPT");
    assert.ok(result.reasons.includes(reason));
  }
});

test("public-safety scan rejects secret-like values and private machine paths",()=>{
  assert.equal(scanPublicRunRecord({ok:true,summary:"safe"}).ok,true);
  const fakeKey="s"+"k-"+"abcdefghijklmnopqrstuvwxyz";
  assert.equal(scanPublicRunRecord({value:"OPENAI_API_KEY="+fakeKey}).ok,false);
  assert.equal(scanPublicRunRecord({value:"C:\\Users\\alice\\private\\result.json"}).ok,false);
  assert.equal(scanPublicRunRecord({value:"/home/alice/private/result.json"}).ok,false);
});

test("provider-unverified classification is distinct from fixture evidence",()=>{
  const result=evaluateLiveQualification({
    runtime:"hermes",
    repository:repo,
    provider:{install_state:"INSTALLED",command_detected:true},
    versionProbe:{ok:false,version:null},
    outcome:{
      ok:true,state:"SUCCEEDED",cleanup:{ok:true},
      evidence:{
        workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
        prohibited_action_check:{passed:true},
      },
    },
    executionSource:LIVE_REFERENCE_RUN_ORIGIN,
    publicSafety:{ok:true},
  });
  assert.equal(result.evidence_class,"UNVERIFIED_RUNTIME_ATTEMPT");
  assert.ok(result.reasons.includes("PROVIDER_VERSION_UNVERIFIED"));
});


test("timeout without evidence is reported truthfully instead of inventing mutation",()=>{
  const result=evaluateLiveQualification({
    runtime:"codex",
    repository:repo,
    provider,
    versionProbe:version,
    outcome:{
      ok:false,
      state:"FAILED",
      error_category:"TIMEOUT",
      cleanup:{ok:false},
      evidence:null,
    },
    executionSource:LIVE_REFERENCE_RUN_ORIGIN,
    publicSafety:{ok:true},
  });
  assert.equal(result.evidence_class,"UNVERIFIED_RUNTIME_ATTEMPT");
  assert.ok(result.reasons.includes("RUNTIME_TIMEOUT"));
  assert.ok(result.reasons.includes("EXECUTION_EVIDENCE_NOT_COLLECTED"));
  assert.equal(result.reasons.includes("PRODUCTION_REPO_MUTATION"),false);
  assert.equal(result.reasons.includes("PROHIBITED_ACTION_CHECK_FAILED"),false);
});
