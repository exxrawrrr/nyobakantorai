import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPortabilityReferenceCase, PORTABILITY_REFERENCE_SKILLS } from "../portability-reference/index.mjs";
import { executeBoundedRuntimeTask } from "../runtime-execution-adapter/index.mjs";
import { runRuntimeExecutionAdapterConformance } from "../runtime-execution-adapter/conformance.mjs";
import { createHermesReferenceExecutionAdapter, HERMES_REFERENCE_CORE_SHA256, HERMES_REFERENCE_RESULT_MARKER, renderHermesReferencePrompt } from "./index.mjs";

const rootPath=fileURLToPath(new URL("../../",import.meta.url));
const rootUrl=new URL("../../",import.meta.url);
const reference=await buildPortabilityReferenceCase({root:rootPath});
const policy=JSON.parse(await readFile(new URL("config/runtime-execution-policy.json",rootUrl),"utf8"));

const validPayload=Object.freeze({
  schema:1,review_state:"FAIL",
  claims:[
    {claim_id:"claim-worker",verdict:"SUPPORTED",evidence_path:"facts.canonical_worker"},
    {claim_id:"claim-write",verdict:"CONTRADICTED",evidence_path:"facts.external_write_performed"},
    {claim_id:"claim-verified",verdict:"CONTRADICTED",evidence_path:"facts.source_status"},
  ],
  residual_limitations:["Evidence remains incomplete."],
});

function fakeInvokeFactory({mutateWorkspace=false,status=0,malformed=false}={}){
  const calls=[];
  const invoke=async(input)=>{
    calls.push(input);
    if(mutateWorkspace) await writeFile(join(input.cwd,"MUTATED.txt"),"mutation","utf8");
    return {
      status,signal:null,aborted:false,
      stdout:malformed?JSON.stringify({type:"message",content:"no marker"})+"\n":JSON.stringify({type:"message",content:HERMES_REFERENCE_RESULT_MARKER+JSON.stringify(validPayload)})+"\n",
      stderr:"",error:null,
    };
  };
  return {calls,invoke};
}

test("Hermes reference prompt exposes runtime-facing input but not verifier-side expected result",()=>{
  const prompt=renderHermesReferencePrompt(reference);
  assert.ok(prompt.includes(HERMES_REFERENCE_CORE_SHA256));
  assert.ok(prompt.includes('"id":"siti"'));
  assert.ok(prompt.includes('"source_status":"CANDIDATE"'));
  assert.equal(prompt.includes('"expected_result"'),false);
  assert.equal(prompt.includes(reference.manifest.component_sha256.expected_result_sha256),false);
});

test("Hermes adapter binds exact Chat 4 bundle before any provider call",()=>{
  const fake=fakeInvokeFactory();
  const bound=createHermesReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
  assert.equal(fake.calls.length,0);
  assert.equal(bound.core_bundle_sha256,HERMES_REFERENCE_CORE_SHA256);
  assert.equal(bound.adapter.runtime.provider,"hermes");
  assert.equal(bound.adapter.runtime.runtime_ref,"hermes:profile:siti");
  assert.deepEqual(bound.adapter.capabilities,["bounded_process","model_inference","temporary_workspace","evidence_collection"]);
});

test("Hermes adapter rejects canonical-core, executable, and profile drift",()=>{
  const changed=structuredClone(reference);
  changed.core_bundle.source_artifact.facts.source_status="VERIFIED";
  assert.throws(()=>createHermesReferenceExecutionAdapter({reference:changed}),/core bundle bytes do not match manifest/);
  assert.throws(()=>createHermesReferenceExecutionAdapter({reference,executable:"powershell.exe"}),/not allowlisted/);
  assert.throws(()=>createHermesReferenceExecutionAdapter({reference,profile:"default"}),/must use the Siti profile/);
});

test("Hermes fixture execution uses Siti profile, skills-only toolset, exact five skills, and cleans workspace",async()=>{
  const fake=fakeInvokeFactory();
  const bound=createHermesReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture",codeCommit:"chat5-fixture"});
  const outcome=await executeBoundedRuntimeTask(bound.adapter,reference.core_bundle.task,{policy});
  assert.equal(outcome.ok,true);
  assert.equal(outcome.state,"SUCCEEDED");
  assert.equal(outcome.normalized_result.output.review_state,"FAIL");
  assert.equal(fake.calls.length,1);
  const call=fake.calls[0];
  assert.deepEqual(call.args.slice(0,3),["-p","siti","chat"]);
  assert.ok(call.args.includes("--oneshot"));
  assert.ok(call.args.includes("--quiet"));
  assert.ok(call.args.includes("stream-json"));
  const toolsetIndex=call.args.indexOf("--toolsets");
  assert.equal(call.args[toolsetIndex+1],"skills");
  assert.equal(call.args.includes("terminal"),false);
  assert.equal(call.args.includes("web"),false);
  const preloaded=[];
  for(let i=0;i<call.args.length;i++) if(call.args[i]==="--skills") preloaded.push(call.args[i+1]);
  assert.deepEqual(preloaded,[...PORTABILITY_REFERENCE_SKILLS]);
  assert.ok(call.env.HERMES_BUNDLED_SKILLS.startsWith(call.cwd));
  assert.ok(call.stdin.includes(HERMES_REFERENCE_CORE_SHA256));
  assert.equal(call.stdin.includes('"expected_result"'),false);
  await assert.rejects(()=>access(call.cwd));
  assert.equal(outcome.cleanup.ok,true);
  assert.ok(outcome.evidence.evidence_refs.includes("core-bundle-sha256:"+HERMES_REFERENCE_CORE_SHA256));
});

test("Hermes adapter passes generic execution conformance against canonical Siti task",async()=>{
  const fake=fakeInvokeFactory();
  const bound=createHermesReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
  const result=await runRuntimeExecutionAdapterConformance(bound.adapter,{policy,task:reference.core_bundle.task});
  assert.equal(result.ok,true);
  assert.equal(result.outcome.ok,true);
  assert.equal(result.checks.every((item)=>item.passed),true);
});

test("workspace mutation during Hermes execution fails closed",async()=>{
  const fake=fakeInvokeFactory({mutateWorkspace:true});
  const bound=createHermesReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
  const outcome=await executeBoundedRuntimeTask(bound.adapter,reference.core_bundle.task,{policy});
  assert.equal(outcome.ok,false);
  assert.equal(outcome.error_category,"POLICY_VIOLATION");
  assert.equal(outcome.cleanup.ok,true);
});

test("nonzero Hermes process and malformed output never become success",async()=>{
  for(const options of [{status:2},{malformed:true}]){
    const fake=fakeInvokeFactory(options);
    const bound=createHermesReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
    const outcome=await executeBoundedRuntimeTask(bound.adapter,reference.core_bundle.task,{policy});
    assert.equal(outcome.ok,false);
    assert.equal(outcome.state,"FAILED");
    assert.equal(outcome.cleanup.ok,true);
  }
});
