import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateRealTaskDataset } from "./index.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [policy,dataset,employees,sourceAudit,firstEvidence] = await Promise.all([
  readJson("../../config/real-task-evaluation.json"),
  readJson("../../benchmarks/real-tasks/dataset.json"),
  readJson("../../config/employees.json"),
  readJson("../../benchmarks/real-tasks/source-audit-2026-09-29.json"),
  readJson("../../benchmarks/real-tasks/evidence/2026-09-22-p122.json"),
]);
const ids=employees.employees.map((e)=>e.id);

test("committed real-task dataset is valid while collecting and remains unpublished",()=>{
  const result=validateRealTaskDataset({dataset,policy,employeeIds:ids});
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(dataset.status,"COLLECTING");
  assert.equal(dataset.claim_state,"COLLECTING");
  assert.equal(result.cases,1);
  assert.equal(result.false_successes,0);
  assert.equal(result.generated_or_unbound_sources,0);
  assert.equal(result.acceptance_passed,false);
  assert.equal(dataset.cases[0].source_generated,false);
  assert.equal(dataset.cases[0].metrics.success,false);
  assert.equal(dataset.cases[0].metrics.verification_passed,false);
});

function makeCase(index, overrides={}) {
  return {
    case_id:`real-${String(index).padStart(3,"0")}`,
    source_type:"owner_real_task",
    source_ref:`owner-task://real/${index}`,
    source_generated:false,
    employee_id:index % 2 ? "siti" : "subagjo",
    task_summary:`Redacted real task ${index}`,
    evidence_refs:[`receipt://real/${index}`],
    redaction_reviewed:true,
    started_at:"2026-09-29T04:00:00.000Z",
    finished_at:"2026-09-29T04:01:00.000Z",
    metrics:{
      success:true,
      evidence_complete:true,
      false_success:false,
      human_intervention:0,
      retries:0,
      duration_ms:60000,
      cost_known:false,
      verification_passed:true,
      recovered_after_failure:false,
    },
    ...overrides,
  };
}

test("synthetic/demo fixtures cannot be counted as real tasks",()=>{
  const bad=structuredClone(dataset);
  bad.status="COLLECTING";
  bad.claim_state="COLLECTING";
  bad.cases=[makeCase(1,{source_type:"synthetic"})];
  const result=validateRealTaskDataset({dataset:bad,policy,employeeIds:ids});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/not eligible|forbidden/.test(e)));
});

test("publication requires at least twenty real cases and zero false successes",()=>{
  const ready=structuredClone(dataset);
  ready.status="READY_FOR_REPORT";
  ready.claim_state="EVALUATED_BASELINE";
  ready.environment={runtime:"nyobakantorai",version:"v0.4-candidate"};
  ready.cases=Array.from({length:20},(_,i)=>makeCase(i+1));
  ready.summary={acceptance_passed:true};
  const good=validateRealTaskDataset({dataset:ready,policy,employeeIds:ids});
  assert.equal(good.ok,true,good.errors.join("\n"));
  assert.equal(good.acceptance_passed,true);

  ready.cases[0].metrics.false_success=true;
  ready.summary.acceptance_passed=false;
  const bad=validateRealTaskDataset({dataset:ready,policy,employeeIds:ids});
  assert.equal(bad.ok,false);
  assert.ok(bad.errors.some((e)=>/cannot be READY_FOR_REPORT/.test(e)));
});

test("missing evidence or redaction review blocks publication",()=>{
  const ready=structuredClone(dataset);
  ready.status="READY_FOR_REPORT";
  ready.claim_state="EVALUATED_BASELINE";
  ready.environment={runtime:"nyobakantorai",version:"v0.4-candidate"};
  ready.cases=Array.from({length:20},(_,i)=>makeCase(i+1));
  ready.cases[4].evidence_refs=[];
  ready.cases[5].redaction_reviewed=false;
  const result=validateRealTaskDataset({dataset:ready,policy,employeeIds:ids});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/evidence_refs required/.test(e)));
  assert.ok(result.errors.some((e)=>/redaction_reviewed/.test(e)));
});

test("secret-like content is rejected from redacted summaries",()=>{
  const collecting=structuredClone(dataset);
  collecting.status="COLLECTING";
  collecting.claim_state="COLLECTING";
  collecting.cases=[makeCase(1,{task_summary:"api_key=supersecretvalue123456"})];
  const result=validateRealTaskDataset({dataset:collecting,policy,employeeIds:ids});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/secret-like/.test(e)));
});


test("generated pipeline derivative cannot be relabeled as owner real task",()=>{
  const collecting=structuredClone(dataset);
  collecting.status="COLLECTING";
  collecting.claim_state="COLLECTING";
  collecting.cases=[makeCase(1,{source_generated:true})];
  const result=validateRealTaskDataset({dataset:collecting,policy,employeeIds:ids});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/source_generated must be false/.test(e)));
  assert.equal(result.generated_or_unbound_sources,1);
});

test("real-task metrics must use typed non-negative values",()=>{
  const collecting=structuredClone(dataset);
  collecting.status="COLLECTING";
  collecting.claim_state="COLLECTING";
  collecting.cases=[makeCase(1,{metrics:{
    success:"yes",
    evidence_complete:true,
    false_success:false,
    human_intervention:-1,
    retries:0.5,
    duration_ms:-10,
    cost_known:false,
    verification_passed:true,
    recovered_after_failure:false,
  }})];
  const result=validateRealTaskDataset({dataset:collecting,policy,employeeIds:ids});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/success must be boolean/.test(e)));
  assert.ok(result.errors.some((e)=>/human_intervention must be a non-negative integer/.test(e)));
  assert.ok(result.errors.some((e)=>/retries must be a non-negative integer/.test(e)));
  assert.ok(result.errors.some((e)=>/duration_ms must be a non-negative integer/.test(e)));
});


test("historical source audit excludes sandbox and generated derivative records",()=>{
  assert.equal(sourceAudit.total_records,24);
  assert.equal(sourceAudit.eligible_real_task_records,1);
  assert.equal(sourceAudit.rejected_records,23);
  assert.equal(sourceAudit.categories.explicit_sandbox_or_fictional.count,22);
  assert.equal(sourceAudit.categories.generated_pipeline_derivative.count,1);
  assert.equal(sourceAudit.preserved_failures.count,5);
  assert.equal(firstEvidence.task.source_generated,false);
  assert.equal(firstEvidence.verification.reviewer_prompt_generated_by_pipeline,true);
  assert.equal(firstEvidence.verification.final_truth_state,"NEEDS_EVIDENCE");
  assert.equal(firstEvidence.verification.verification_passed,false);
});


test("duplicate direct source references are rejected",()=>{
  const collecting=structuredClone(dataset);
  collecting.status="COLLECTING";
  collecting.claim_state="COLLECTING";
  collecting.cases=[
    makeCase(1,{source_ref:"owner-task://same-source"}),
    makeCase(2,{source_ref:"owner-task://same-source"}),
  ];
  const result=validateRealTaskDataset({dataset:collecting,policy,employeeIds:ids});
  assert.equal(result.ok,false);
  assert.equal(result.unique_sources,false);
  assert.ok(result.errors.some((e)=>/duplicate source_ref/.test(e)));
});

test("semantic verification contradictions fail closed",()=>{
  const collecting=structuredClone(dataset);
  collecting.status="COLLECTING";
  collecting.claim_state="COLLECTING";
  collecting.cases=[
    makeCase(1,{metrics:{
      success:true,
      evidence_complete:false,
      false_success:false,
      human_intervention:0,
      retries:0,
      duration_ms:60000,
      cost_known:false,
      verification_passed:true,
      recovered_after_failure:false,
    }}),
    makeCase(2,{metrics:{
      success:false,
      evidence_complete:true,
      false_success:true,
      human_intervention:0,
      retries:0,
      duration_ms:60000,
      cost_known:false,
      verification_passed:false,
      recovered_after_failure:false,
    }}),
    makeCase(3,{metrics:{
      success:true,
      evidence_complete:true,
      false_success:true,
      human_intervention:0,
      retries:0,
      duration_ms:60000,
      cost_known:false,
      verification_passed:true,
      recovered_after_failure:false,
    }}),
  ];
  const result=validateRealTaskDataset({dataset:collecting,policy,employeeIds:ids});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/verification_passed requires evidence_complete/.test(e)));
  assert.ok(result.errors.some((e)=>/false_success requires an earlier success claim/.test(e)));
  assert.ok(result.errors.some((e)=>/false_success cannot also be verification_passed/.test(e)));
});

test("credential-bearing source refs are rejected",()=>{
  const collecting=structuredClone(dataset);
  collecting.status="COLLECTING";
  collecting.claim_state="COLLECTING";
  collecting.cases=[makeCase(1,{source_ref:"https://example.invalid/task?token=supersecretvalue123456"})];
  const result=validateRealTaskDataset({dataset:collecting,policy,employeeIds:ids});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>/source_ref contains secret-like material/.test(e)));
});
