import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile as readFs } from "node:fs/promises";
import {
  buildDatasetSnapshot, createLedgerEvent, readLedger, recordFinish, recordStart,
  recordVerification, summarizeLedger, verifyLedger,
} from "./index.mjs";

const readJson=async(p)=>JSON.parse(await readFs(new URL(p,import.meta.url),"utf8"));
const [recorderPolicy,evaluationPolicy,employees]=await Promise.all([
  readJson("../../config/real-task-recorder.json"),
  readJson("../../config/real-task-evaluation.json"),
  readJson("../../config/employees.json"),
]);
const context={recorderPolicy,evaluationPolicy,employees};
const startPayload={
  case_id:"real-owner-001",source_type:"owner_real_task",source_ref:"owner-task://chat/001",
  source_generated:false,source_attestation:"OWNER_DIRECT",employee_id:"subagjo",
  task_summary:"Fix a real repository regression and preserve verification evidence.",redaction_reviewed:true,
};
const finishPayload={
  case_id:"real-owner-001",success:true,evidence_refs:["commit://abc123"],human_intervention:0,
  retries:1,cost_known:false,recovered_after_failure:true,outcome_note:"Regression fixed and tests rerun.",
};
const verifyPayload={
  case_id:"real-owner-001",reviewer_employee_id:"siti",verification_passed:true,false_success:false,
  evidence_complete:true,evidence_refs:["ci://verify/123"],verification_note:"Independent checks passed.",
};

async function lifecycle() {
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-"));
  const ledger=join(dir,"ledger.jsonl");
  await recordStart({ledgerPath:ledger,payload:startPayload,context,now:"2026-09-29T10:00:00Z",idFactory:()=> "start-id"});
  await recordFinish({ledgerPath:ledger,payload:finishPayload,context,now:"2026-09-29T10:01:00Z",idFactory:()=> "finish-id"});
  await recordVerification({ledgerPath:ledger,payload:verifyPayload,context,now:"2026-09-29T10:02:00Z",idFactory:()=> "verify-id"});
  return {ledger,events:await readLedger(ledger)};
}

test("real lifecycle is hash-chained, independently verified, and exportable",async()=>{
  const {events}=await lifecycle();
  const result=verifyLedger(events,context);
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(events.length,3);
  assert.equal(events[1].previous_hash,events[0].event_hash);
  assert.equal(events[2].previous_hash,events[1].event_hash);
  const summary=summarizeLedger(events);
  assert.deepEqual(summary,{events:3,cases:1,started_only:0,awaiting_verification:0,verified:1,successes:1,failures:0,verification_passes:1,false_successes:0});
  const dataset=buildDatasetSnapshot({events,evaluationPolicy,environment:{test:true}});
  assert.equal(dataset.cases.length,1);
  assert.equal(dataset.cases[0].verification.reviewer_employee_id,"siti");
  assert.equal(dataset.cases[0].metrics.verification_passed,true);
  assert.equal(dataset.summary.acceptance_passed,false);
});

test("tampering or reordering breaks integrity",async()=>{
  const {events}=await lifecycle();
  const tampered=structuredClone(events);
  tampered[1].data.success=false;
  assert.equal(verifyLedger(tampered,context).ok,false);
  const reordered=[events[1],events[0],events[2]];
  assert.equal(verifyLedger(reordered,context).ok,false);
});

test("self verification is rejected",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-"));
  const ledger=join(dir,"ledger.jsonl");
  await recordStart({ledgerPath:ledger,payload:startPayload,context,now:"2026-09-29T10:00:00Z"});
  await recordFinish({ledgerPath:ledger,payload:finishPayload,context,now:"2026-09-29T10:01:00Z"});
  await assert.rejects(()=>recordVerification({ledgerPath:ledger,payload:{...verifyPayload,reviewer_employee_id:"subagjo"},context,now:"2026-09-29T10:02:00Z"}),/self-verification/);
});

test("generated, synthetic, secret-like, and duplicate sources are rejected",async()=>{
  for (const bad of [
    {...startPayload,source_generated:true,case_id:"a"},
    {...startPayload,source_type:"synthetic",source_attestation:"OWNER_DIRECT",case_id:"b"},
    {...startPayload,task_summary:"api_key=supersecretvalue123456",case_id:"c"},
  ]) {
    const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-"));
    await assert.rejects(()=>recordStart({ledgerPath:join(dir,"ledger.jsonl"),payload:bad,context}),/source_generated|eligible|secret-like/);
  }
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-"));
  const ledger=join(dir,"ledger.jsonl");
  await recordStart({ledgerPath:ledger,payload:startPayload,context});
  await assert.rejects(()=>recordStart({ledgerPath:ledger,payload:{...startPayload,case_id:"real-owner-002"},context}),/source_ref already recorded/);
});

test("finish-before-start and verify-before-finish are rejected",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-"));
  const ledger=join(dir,"ledger.jsonl");
  await assert.rejects(()=>recordFinish({ledgerPath:ledger,payload:finishPayload,context}),/no TASK_STARTED/);
  await recordStart({ledgerPath:ledger,payload:startPayload,context});
  await assert.rejects(()=>recordVerification({ledgerPath:ledger,payload:verifyPayload,context}),/TASK_VERIFIED requires TASK_FINISHED/);
});

test("false-success failures are preserved instead of filtered",async()=>{
  const {events}=await lifecycle();
  const altered=structuredClone(events);
  const verify=altered[2];
  verify.data.verification_passed=false;
  verify.data.false_success=true;
  delete verify.event_hash;
  verify.event_hash=(await import("./index.mjs")).computeEventHash(verify);
  const result=verifyLedger(altered,context);
  assert.equal(result.ok,true,result.errors.join("\n"));
  const dataset=buildDatasetSnapshot({events:altered,evaluationPolicy});
  assert.equal(dataset.cases[0].metrics.false_success,true);
  assert.equal(dataset.cases[0].metrics.verification_passed,false);
  assert.equal(dataset.summary.false_successes,1);
});


test("semantic verification contradictions fail closed",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-"));
  const ledger=join(dir,"ledger.jsonl");
  await recordStart({ledgerPath:ledger,payload:startPayload,context,now:"2026-09-29T10:00:00Z"});
  await recordFinish({ledgerPath:ledger,payload:finishPayload,context,now:"2026-09-29T10:01:00Z"});

  await assert.rejects(
    ()=>recordVerification({
      ledgerPath:ledger,
      payload:{...verifyPayload,verification_passed:true,evidence_complete:false},
      context,now:"2026-09-29T10:02:00Z"
    }),
    /verification_passed requires evidence_complete/
  );

  await assert.rejects(
    ()=>recordVerification({
      ledgerPath:ledger,
      payload:{...verifyPayload,false_success:true,verification_passed:true},
      context,now:"2026-09-29T10:02:00Z"
    }),
    /false_success cannot also be verification_passed/
  );
});

test("false_success cannot be attached to a task that already declared failure",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-"));
  const ledger=join(dir,"ledger.jsonl");
  await recordStart({ledgerPath:ledger,payload:startPayload,context,now:"2026-09-29T10:00:00Z"});
  await recordFinish({ledgerPath:ledger,payload:{...finishPayload,success:false},context,now:"2026-09-29T10:01:00Z"});
  await assert.rejects(
    ()=>recordVerification({
      ledgerPath:ledger,
      payload:{...verifyPayload,verification_passed:false,false_success:true},
      context,now:"2026-09-29T10:02:00Z"
    }),
    /false_success requires an earlier success claim/
  );
});

test("case ids and refs reject unsafe or credential-bearing material",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-"));
  const ledger=join(dir,"ledger.jsonl");
  await assert.rejects(
    ()=>recordStart({ledgerPath:ledger,payload:{...startPayload,case_id:"bad case id"},context}),
    /case_id must be/
  );
  await assert.rejects(
    ()=>recordStart({ledgerPath:ledger,payload:{...startPayload,case_id:"safe-id",source_ref:"https://example.invalid/task?token=SECRET123456789"},context}),
    /secret-like/
  );
  await assert.rejects(
    ()=>recordStart({ledgerPath:ledger,payload:{...startPayload,case_id:"safe-id-2",source_ref:"https://user:password@example.invalid/task"},context}),
    /secret-like/
  );
});
