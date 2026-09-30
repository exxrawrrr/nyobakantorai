import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildPortabilityReferenceCase } from "../portability-reference/index.mjs";
import { executeBoundedRuntimeTask } from "../runtime-execution-adapter/index.mjs";
import { createHermesReferenceExecutionAdapter, HERMES_REFERENCE_RESULT_MARKER } from "../hermes-execution-adapter/index.mjs";
import { createCodexReferenceExecutionAdapter, CODEX_REFERENCE_RESULT_MARKER } from "../codex-execution-adapter/index.mjs";
import {
  comparePortabilityReferenceRuns,
  createPortabilityRunRecord,
} from "./index.mjs";

const rootPath=fileURLToPath(new URL("../../",import.meta.url));
const rootUrl=new URL("../../",import.meta.url);
const reference=await buildPortabilityReferenceCase({root:rootPath});
const policy=JSON.parse(await readFile(new URL("config/runtime-execution-policy.json",rootUrl),"utf8"));
const exactCommit="29212a5a4c5a04b945d7a828bd8e7d301e398337";

const validPayload=Object.freeze({
  schema:1,
  review_state:"FAIL",
  claims:[
    {claim_id:"claim-worker",verdict:"SUPPORTED",evidence_path:"facts.canonical_worker"},
    {claim_id:"claim-write",verdict:"CONTRADICTED",evidence_path:"facts.external_write_performed"},
    {claim_id:"claim-verified",verdict:"CONTRADICTED",evidence_path:"facts.source_status"},
  ],
  residual_limitations:["The evidence packet is incomplete, so this reference case is not VERIFIED."],
});

function fakeInvoke(marker){
  return async()=>({
    status:0,
    signal:null,
    aborted:false,
    stdout:JSON.stringify({type:"message",content:marker+JSON.stringify(validPayload)})+"\n",
    stderr:"",
    error:null,
  });
}

async function buildOutcomes(){
  const hermes=createHermesReferenceExecutionAdapter({
    reference,
    invokeImpl:fakeInvoke(HERMES_REFERENCE_RESULT_MARKER),
    providerVersion:"fixture-hermes",
    codeCommit:exactCommit,
  });
  const codex=createCodexReferenceExecutionAdapter({
    reference,
    invokeImpl:fakeInvoke(CODEX_REFERENCE_RESULT_MARKER),
    providerVersion:"fixture-codex",
    codeCommit:exactCommit,
  });
  const hermesOutcome=await executeBoundedRuntimeTask(hermes.adapter,reference.core_bundle.task,{policy});
  const codexOutcome=await executeBoundedRuntimeTask(codex.adapter,reference.core_bundle.task,{policy});
  assert.equal(hermesOutcome.ok,true);
  assert.equal(codexOutcome.ok,true);
  return {hermesOutcome,codexOutcome};
}

function verification(status="NOT_RUN"){
  if(status==="PASS"){
    return {
      status:"PASS",
      independent:true,
      implementation_id:"python-reference-verifier-fixture",
      evidence_ref:"sha256:"+"b".repeat(64),
    };
  }
  if(status==="FAIL"){
    return {
      status:"FAIL",
      independent:true,
      implementation_id:"python-reference-verifier-fixture",
      evidence_ref:"sha256:"+"c".repeat(64),
    };
  }
  return {status:"NOT_RUN",independent:false};
}

function record(outcome,evidenceClass,verificationStatus="NOT_RUN"){
  return createPortabilityRunRecord({
    reference,
    outcome,
    evidenceClass,
    externalVerification:verification(verificationStatus),
  });
}

test("fixture Hermes + Codex outputs remain PARTIAL even when both match every protected atom",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const report=comparePortabilityReferenceRuns({
    reference,
    runs:[
      record(hermesOutcome,"FIXTURE_EVIDENCE","PASS"),
      record(codexOutcome,"FIXTURE_EVIDENCE","PASS"),
    ],
  });
  assert.equal(report.state,"PARTIAL");
  assert.equal(report.parity_claim_allowed,false);
  assert.equal(report.core_identity.identical,true);
  assert.equal(report.protected_atom_agreement,true);
  assert.ok(report.blocking_reasons.includes("FIXTURE_ONLY_EVIDENCE"));
});

test("two complete live records with independent verification pending are only PORTABILITY_CANDIDATE",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const report=comparePortabilityReferenceRuns({
    reference,
    runs:[
      record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","NOT_RUN"),
      record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","NOT_RUN"),
    ],
  });
  assert.equal(report.state,"PORTABILITY_CANDIDATE");
  assert.equal(report.parity_claim_allowed,false);
  assert.equal(report.blocking_reasons.length,0);
});

test("reference-case VERIFIED requires both live records and independent PASS verification",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const report=comparePortabilityReferenceRuns({
    reference,
    runs:[
      record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"),
      record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"),
    ],
  });
  assert.equal(report.state,"PORTABILITY_VERIFIED_FOR_REFERENCE_CASE");
  assert.equal(report.parity_claim_allowed,true);
  assert.equal(report.core_identity.identical,true);
  assert.equal(report.protected_atom_agreement,true);
  assert.deepEqual(report.runtime_pair.map((item)=>item.provider),["codex","hermes"]);
});

test("missing runtime run is NOT_RUN",async()=>{
  const {hermesOutcome}=await buildOutcomes();
  const report=comparePortabilityReferenceRuns({
    reference,
    runs:[record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS")],
  });
  assert.equal(report.state,"NOT_RUN");
  assert.equal(report.parity_claim_allowed,false);
  assert.ok(report.blocking_reasons.includes("BOTH_RUNTIME_RUNS_REQUIRED"));
});

test("core hash drift blocks parity before behavior can qualify",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS");
  const codex=structuredClone(record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  codex.core_bundle_sha256="f".repeat(64);
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PARTIAL");
  assert.equal(report.parity_claim_allowed,false);
  assert.ok(report.blocking_reasons.includes("CORE_BUNDLE_HASH_MISMATCH"));
  assert.ok(report.blocking_reasons.includes("CROSS_RUNTIME_CORE_HASH_MISMATCH"));
});

test("protected-atom contradiction blocks parity even when evidence packet is otherwise complete",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS");
  const codex=structuredClone(record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  codex.normalized_result.output.claims.find((item)=>item.claim_id==="claim-write").verdict="SUPPORTED";
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PARTIAL");
  assert.equal(report.protected_atom_agreement,false);
  assert.ok(report.blocking_reasons.includes("CODEX:PROTECTED_ATOM_MISMATCH"));
  assert.ok(report.blocking_reasons.includes("CROSS_RUNTIME_PROTECTED_ATOM_DISAGREEMENT"));
});

test("missing residual limitation blocks the reference truth contract",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS");
  const codex=structuredClone(record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  codex.normalized_result.output.residual_limitations=[];
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PARTIAL");
  assert.ok(report.blocking_reasons.includes("CODEX:RESIDUAL_LIMITATION_MISSING"));
});

test("incomplete evidence or unsafe workspace state blocks parity",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=structuredClone(record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  const codex=record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS");
  hermes.evidence_binding.workspace_after_sha256=null;
  hermes.evidence.workspace_mutation_check.production_repo_changed=true;
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PARTIAL");
  assert.ok(report.blocking_reasons.includes("HERMES:WORKSPACE_AFTER_HASH_MISSING"));
  assert.ok(report.blocking_reasons.includes("HERMES:PRODUCTION_REPO_MUTATION"));
});

test("independent verifier FAIL blocks parity instead of degrading to candidate",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const report=comparePortabilityReferenceRuns({
    reference,
    runs:[
      record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","FAIL"),
      record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"),
    ],
  });
  assert.equal(report.state,"PARTIAL");
  assert.equal(report.parity_claim_allowed,false);
  assert.ok(report.blocking_reasons.includes("INDEPENDENT_VERIFIER_FAILED"));
});

test("runtime pair must be exactly Hermes + Codex",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS");
  const codex=structuredClone(record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  codex.runtime.provider="hermes";
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PARTIAL");
  assert.ok(report.blocking_reasons.includes("RUNTIME_PAIR_INVALID"));
});

test("comparison report hash is deterministic for the same evidence inputs",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const runs=[
    record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"),
    record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"),
  ];
  const a=comparePortabilityReferenceRuns({reference,runs});
  const b=comparePortabilityReferenceRuns({reference,runs:[runs[1],runs[0]]});
  assert.equal(a.state,b.state);
  assert.equal(a.comparison_sha256,b.comparison_sha256);
});


test("two runtimes sharing the same wrong component hashes are still rejected against canonical manifest",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=structuredClone(record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  const codex=structuredClone(record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  hermes.component_sha256.task_sha256="e".repeat(64);
  codex.component_sha256.task_sha256="e".repeat(64);
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PARTIAL");
  assert.ok(report.blocking_reasons.includes("COMPONENT_HASH_REFERENCE_MISMATCH"));
  assert.equal(report.blocking_reasons.includes("COMPONENT_HASH_MISMATCH"),false);
});

test("live Hermes and Codex records from different commits cannot be verified together",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS");
  const codex=structuredClone(record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  codex.evidence_binding.code_commit="d".repeat(40);
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PARTIAL");
  assert.ok(report.blocking_reasons.includes("CODE_COMMIT_MISMATCH"));
});

test("PASS from a non-independent verifier is capped at PORTABILITY_CANDIDATE",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=structuredClone(record(hermesOutcome,"LIVE_RUNTIME_EVIDENCE","PASS"));
  const codex=record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS");
  hermes.external_verification.independent=false;
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PORTABILITY_CANDIDATE");
  assert.equal(report.parity_claim_allowed,false);
});


test("unverified runtime attempt remains PARTIAL and is distinct from fixture evidence",async()=>{
  const {hermesOutcome,codexOutcome}=await buildOutcomes();
  const hermes=record(hermesOutcome,"UNVERIFIED_RUNTIME_ATTEMPT","PASS");
  const codex=record(codexOutcome,"LIVE_RUNTIME_EVIDENCE","PASS");
  const report=comparePortabilityReferenceRuns({reference,runs:[hermes,codex]});
  assert.equal(report.state,"PARTIAL");
  assert.equal(report.parity_claim_allowed,false);
  assert.ok(report.blocking_reasons.includes("UNVERIFIED_RUNTIME_EVIDENCE"));
  assert.equal(report.blocking_reasons.includes("FIXTURE_ONLY_EVIDENCE"),false);
});
