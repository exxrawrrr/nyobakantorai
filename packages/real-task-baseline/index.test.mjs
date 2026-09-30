import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildRealTaskCollectionReport,
  mergeRealTaskSnapshots,
  prepareRealTaskBaseline,
  summarizeRealTaskCoverage,
  validateImportSnapshot,
} from "./index.mjs";

const readJson=async(path)=>JSON.parse(await readFile(new URL(path,import.meta.url),"utf8"));
const [evaluationPolicy,baselinePolicy,canonical,employees,checkpoint]=await Promise.all([
  readJson("../../config/real-task-evaluation.json"),
  readJson("../../config/real-task-baseline.json"),
  readJson("../../benchmarks/real-tasks/dataset.json"),
  readJson("../../config/employees.json"),
  readJson("../../benchmarks/real-tasks/collection-status-2026-09-29.json"),
]);
const employeeIds=employees.employees.map(x=>x.id);

function makeCase(index,overrides={}){
  const n=String(index).padStart(3,"0");
  return {
    case_id:"real-import-"+n,
    source_type:"owner_real_task",
    source_ref:"owner-task://real-import/"+n,
    source_generated:false,
    employee_id:index%3===0?"siti":index%2===0?"subagjo":"praroro",
    task_summary:"Redacted genuine owner task "+n,
    evidence_refs:["receipt://real-import/"+n,"review://real-import/"+n],
    redaction_reviewed:true,
    started_at:"2026-09-29T09:"+String(index%60).padStart(2,"0")+":00.000Z",
    finished_at:"2026-09-29T09:"+String(index%60).padStart(2,"0")+":30.000Z",
    metrics:{
      success:index%5!==0,
      evidence_complete:true,
      false_success:false,
      human_intervention:index%4===0?1:0,
      retries:index%6===0?1:0,
      duration_ms:30000,
      cost_known:false,
      verification_passed:index%5!==0,
      recovered_after_failure:false,
    },
    outcome_note:index%5===0?"Task failed truthfully and remained unverified.":"Task completed and independent verification passed.",
    ...overrides,
  };
}

function snapshot(cases){
  return {
    schema:1,
    status:"COLLECTING",
    claim_state:"COLLECTING",
    note:"Local recorder export.",
    environment:{runtime:"test-recorder",source:"unit-test"},
    cases,
    summary:{
      acceptance_passed:false,
      eligible_cases:cases.length,
      minimum_cases_required:20,
      task_successes:cases.filter(x=>x.metrics.success).length,
      verification_passes:cases.filter(x=>x.metrics.verification_passed).length,
      false_successes:cases.filter(x=>x.metrics.false_success).length,
      note:"test"
    }
  };
}

test("current canonical collection truthfully reports 1/20 and preserves the known failure",()=>{
  const report=buildRealTaskCollectionReport({dataset:canonical,evaluationPolicy,baselinePolicy,employeeIds});
  assert.equal(report.valid,true,report.errors.join("\n"));
  assert.equal(report.cases,1);
  assert.equal(report.remaining,19);
  assert.equal(report.failures,1);
  assert.equal(report.successes,0);
  assert.equal(report.false_successes,0);
  assert.equal(report.publication_gate_passed,false);
  assert.ok(report.coverage_warnings.some(x=>/No successful task/.test(x)));
});

test("valid recorder snapshot imports without mutating the canonical input",()=>{
  const original=JSON.stringify(canonical);
  const incoming=snapshot([makeCase(2)]);
  const check=validateImportSnapshot({snapshot:incoming,evaluationPolicy,employeeIds});
  assert.equal(check.ok,true,check.errors.join("\n"));

  const merged=mergeRealTaskSnapshots({
    canonical,
    snapshots:[incoming],
    evaluationPolicy,
    baselinePolicy,
    employeeIds,
  });
  assert.equal(merged.ok,true,merged.errors.join("\n"));
  assert.deepEqual(merged.added,["real-import-002"]);
  assert.equal(merged.dataset.cases.length,2);
  assert.equal(merged.coverage.failures,1);
  assert.equal(JSON.stringify(canonical),original);
});

test("identical duplicate case is skipped rather than double-counted",()=>{
  const first=snapshot([makeCase(2)]);
  const merged1=mergeRealTaskSnapshots({canonical,snapshots:[first],evaluationPolicy,baselinePolicy,employeeIds});
  assert.equal(merged1.ok,true);
  const merged2=mergeRealTaskSnapshots({
    canonical:merged1.dataset,
    snapshots:[first],
    evaluationPolicy,
    baselinePolicy,
    employeeIds,
  });
  assert.equal(merged2.ok,true);
  assert.equal(merged2.added.length,0);
  assert.equal(merged2.skipped_identical.length,1);
  assert.equal(merged2.dataset.cases.length,2);
});

test("same source reference under a different case id is rejected",()=>{
  const one=makeCase(2);
  const two=makeCase(3,{source_ref:one.source_ref});
  const result=mergeRealTaskSnapshots({
    canonical,
    snapshots:[snapshot([one,two])],
    evaluationPolicy,
    baselinePolicy,
    employeeIds,
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>/duplicate source_ref/.test(x)||/duplicate-source-ref/.test(x)));
});

test("generated or synthetic-looking recorder input remains ineligible",()=>{
  const bad=snapshot([makeCase(2,{source_generated:true})]);
  const result=validateImportSnapshot({snapshot:bad,evaluationPolicy,employeeIds});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>/source_generated must be false/.test(x)));
});

test("nineteen valid cases cannot be prepared as a baseline",()=>{
  const dataset=snapshot(Array.from({length:19},(_,i)=>makeCase(i+1)));
  assert.throws(
    ()=>prepareRealTaskBaseline({dataset,evaluationPolicy,baselinePolicy,employeeIds}),
    /publication gate not satisfied: 19\/20/
  );
});

test("twenty eligible cases with zero false-success prepare to READY_FOR_REPORT but never PUBLISHED",()=>{
  const dataset=snapshot(Array.from({length:20},(_,i)=>makeCase(i+1)));
  const ready=prepareRealTaskBaseline({dataset,evaluationPolicy,baselinePolicy,employeeIds});
  assert.equal(ready.status,"READY_FOR_REPORT");
  assert.equal(ready.claim_state,"EVALUATED_BASELINE");
  assert.equal(ready.summary.acceptance_passed,true);
  assert.equal(ready.summary.false_successes,0);
  assert.equal(ready.summary.task_failures,4);
  assert.notEqual(ready.status,"PUBLISHED");
});

test("a single false-success blocks preparation even with twenty cases",()=>{
  const cases=Array.from({length:20},(_,i)=>makeCase(i+1));
  cases[0]=makeCase(1,{metrics:{
    ...cases[0].metrics,
    success:true,
    verification_passed:false,
    false_success:true,
  }});
  const dataset=snapshot(cases);
  assert.throws(
    ()=>prepareRealTaskBaseline({dataset,evaluationPolicy,baselinePolicy,employeeIds}),
    /publication gate not satisfied/
  );
});

test("coverage recommendations are warnings, not hidden publication requirements",()=>{
  const cases=Array.from({length:20},(_,i)=>makeCase(i+1,{employee_id:"subagjo"}));
  const dataset=snapshot(cases);
  const coverage=summarizeRealTaskCoverage(dataset,baselinePolicy);
  assert.equal(coverage.distinct_employees,1);
  assert.ok(coverage.coverage_warnings.some(x=>/recommendation is at least 3/.test(x)));
  const ready=prepareRealTaskBaseline({dataset,evaluationPolicy,baselinePolicy,employeeIds});
  assert.equal(ready.summary.acceptance_passed,true);
});


test("committed collection checkpoint matches the canonical dataset",()=>{
  const report=buildRealTaskCollectionReport({dataset:canonical,evaluationPolicy,baselinePolicy,employeeIds});
  assert.equal(checkpoint.status,report.status);
  assert.equal(checkpoint.claim_state,report.claim_state);
  assert.equal(checkpoint.eligible_cases,report.cases);
  assert.equal(checkpoint.minimum_cases_required,report.minimum_cases_required);
  assert.equal(checkpoint.remaining_cases,report.remaining);
  assert.equal(checkpoint.successes,report.successes);
  assert.equal(checkpoint.failures,report.failures);
  assert.equal(checkpoint.verification_passes,report.verification_passes);
  assert.equal(checkpoint.verification_failures,report.verification_failures);
  assert.equal(checkpoint.false_successes,report.false_successes);
  assert.equal(checkpoint.distinct_employees,report.distinct_employees);
  assert.deepEqual(checkpoint.employees,report.employees);
  assert.deepEqual(checkpoint.source_types,report.source_types);
  assert.equal(checkpoint.publication_gate_passed,report.publication_gate_passed);
});
