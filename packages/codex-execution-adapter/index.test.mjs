import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPortabilityReferenceCase, PORTABILITY_REFERENCE_SKILLS } from "../portability-reference/index.mjs";
import { executeBoundedRuntimeTask } from "../runtime-execution-adapter/index.mjs";
import { runRuntimeExecutionAdapterConformance } from "../runtime-execution-adapter/conformance.mjs";
import { createHermesReferenceExecutionAdapter } from "../hermes-execution-adapter/index.mjs";
import {
  createCodexReferenceExecutionAdapter,
  CODEX_REFERENCE_CORE_SHA256,
  CODEX_REFERENCE_RESULT_MARKER,
  renderCodexReferencePrompt,
} from "./index.mjs";

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
      stdout:malformed?JSON.stringify({type:"item.completed",item:{text:"no marker"}})+"\n":JSON.stringify({type:"item.completed",item:{text:CODEX_REFERENCE_RESULT_MARKER+JSON.stringify(validPayload)}})+"\n",
      stderr:"",error:null,
    };
  };
  return {calls,invoke};
}

test("Codex reference prompt exposes runtime-facing input but not verifier-side expected result",()=>{
  const prompt=renderCodexReferencePrompt(reference);
  assert.ok(prompt.includes(CODEX_REFERENCE_CORE_SHA256));
  assert.ok(prompt.includes('"id":"siti"'));
  assert.ok(prompt.includes('"source_status":"CANDIDATE"'));
  assert.equal(prompt.includes('"expected_result"'),false);
  assert.equal(prompt.includes(reference.manifest.component_sha256.expected_result_sha256),false);
});

test("Codex adapter binds exact Chat 4 bundle before any provider call",()=>{
  const fake=fakeInvokeFactory();
  const bound=createCodexReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
  assert.equal(fake.calls.length,0);
  assert.equal(bound.core_bundle_sha256,CODEX_REFERENCE_CORE_SHA256);
  assert.equal(bound.adapter.runtime.provider,"codex");
  assert.equal(bound.adapter.runtime.runtime_ref,"codex:ephemeral:read-only");
  assert.deepEqual(bound.adapter.capabilities,["bounded_process","model_inference","temporary_workspace","evidence_collection"]);
});

test("Hermes and Codex adapters bind the same canonical core bundle without worker/task forks",()=>{
  const hermes=createHermesReferenceExecutionAdapter({reference,invokeImpl:fakeInvokeFactory().invoke,providerVersion:"fixture"});
  const codex=createCodexReferenceExecutionAdapter({reference,invokeImpl:fakeInvokeFactory().invoke,providerVersion:"fixture"});
  assert.equal(hermes.core_bundle_sha256,codex.core_bundle_sha256);
  assert.equal(codex.core_bundle_sha256,reference.manifest.core_bundle_sha256);
  assert.equal(hermes.reference_case_id,codex.reference_case_id);
  assert.equal(codex.reference_case_id,reference.manifest.reference_case_id);
});

test("Codex adapter rejects canonical-core and executable drift",()=>{
  const changed=structuredClone(reference);
  changed.core_bundle.source_artifact.facts.source_status="VERIFIED";
  assert.throws(()=>createCodexReferenceExecutionAdapter({reference:changed}),/core bundle bytes do not match manifest/);
  assert.throws(()=>createCodexReferenceExecutionAdapter({reference,executable:"powershell.exe"}),/not allowlisted/);
});

test("Codex fixture execution uses read-only ephemeral sandbox and cleans workspace",async()=>{
  const fake=fakeInvokeFactory();
  const bound=createCodexReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture",codeCommit:"chat6-fixture"});
  const outcome=await executeBoundedRuntimeTask(bound.adapter,reference.core_bundle.task,{policy});
  assert.equal(outcome.ok,true);
  assert.equal(outcome.state,"SUCCEEDED");
  assert.equal(outcome.normalized_result.output.review_state,"FAIL");
  assert.equal(fake.calls.length,1);
  const call=fake.calls[0];
  assert.deepEqual(call.args,["exec","--skip-git-repo-check","--sandbox","read-only","--ephemeral","--json","-"]);
  assert.equal(call.args.includes("--dangerously-bypass-approvals-and-sandbox"),false);
  assert.ok(call.stdin.includes(CODEX_REFERENCE_CORE_SHA256));
  assert.equal(call.stdin.includes('"expected_result"'),false);
  await assert.rejects(()=>access(call.cwd));
  assert.equal(outcome.cleanup.ok,true);
  assert.ok(outcome.evidence.evidence_refs.includes("core-bundle-sha256:"+CODEX_REFERENCE_CORE_SHA256));
  assert.ok(outcome.evidence.evidence_refs.includes("codex-sandbox:read-only"));
  assert.ok(outcome.evidence.evidence_refs.includes("codex-session:ephemeral"));
});

test("Codex workspace stages exact five canonical skills under .agents/skills",async()=>{
  const fake=fakeInvokeFactory();
  let staged=[];
  fake.invoke=async(input)=>{
    for(const id of PORTABILITY_REFERENCE_SKILLS){
      const bytes=await readFile(join(input.cwd,".agents","skills",id,"SKILL.md"),"utf8");
      staged.push([id,bytes]);
    }
    return {
      status:0,signal:null,aborted:false,
      stdout:JSON.stringify({type:"item.completed",item:{text:CODEX_REFERENCE_RESULT_MARKER+JSON.stringify(validPayload)}})+"\n",
      stderr:"",error:null,
    };
  };
  const bound=createCodexReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
  const outcome=await executeBoundedRuntimeTask(bound.adapter,reference.core_bundle.task,{policy});
  assert.equal(outcome.ok,true);
  assert.deepEqual(staged.map(([id])=>id),[...PORTABILITY_REFERENCE_SKILLS]);
  for(const [id,content] of staged){
    const expected=reference.core_bundle.skills.find((skill)=>skill.id===id);
    assert.equal(content,expected.content);
  }
});

test("Codex adapter passes generic execution conformance against canonical Siti task",async()=>{
  const fake=fakeInvokeFactory();
  const bound=createCodexReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
  const result=await runRuntimeExecutionAdapterConformance(bound.adapter,{policy,task:reference.core_bundle.task});
  assert.equal(result.ok,true);
  assert.equal(result.outcome.ok,true);
  assert.equal(result.checks.every((item)=>item.passed),true);
});

test("workspace mutation during Codex execution fails closed",async()=>{
  const fake=fakeInvokeFactory({mutateWorkspace:true});
  const bound=createCodexReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
  const outcome=await executeBoundedRuntimeTask(bound.adapter,reference.core_bundle.task,{policy});
  assert.equal(outcome.ok,false);
  assert.equal(outcome.error_category,"POLICY_VIOLATION");
  assert.equal(outcome.cleanup.ok,true);
});

test("nonzero Codex process and malformed output never become success",async()=>{
  for(const options of [{status:2},{malformed:true}]){
    const fake=fakeInvokeFactory(options);
    const bound=createCodexReferenceExecutionAdapter({reference,invokeImpl:fake.invoke,providerVersion:"fixture"});
    const outcome=await executeBoundedRuntimeTask(bound.adapter,reference.core_bundle.task,{policy});
    assert.equal(outcome.ok,false);
    assert.equal(outcome.state,"FAILED");
    assert.equal(outcome.cleanup.ok,true);
  }
});
