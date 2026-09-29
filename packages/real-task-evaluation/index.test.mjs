import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateRealTaskDataset } from "./index.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [policy,dataset,employees] = await Promise.all([
  readJson("../../config/real-task-evaluation.json"),
  readJson("../../benchmarks/real-tasks/dataset.json"),
  readJson("../../config/employees.json"),
]);
const ids=employees.employees.map((e)=>e.id);

test("empty real-task dataset is valid only as NOT_READY/UNPROVEN",()=>{
  const result=validateRealTaskDataset({dataset,policy,employeeIds:ids});
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(result.cases,0);
  assert.equal(result.acceptance_passed,false);
});

function makeCase(index, overrides={}) {
  return {
    case_id:`real-${String(index).padStart(3,"0")}`,
    source_type:"owner_real_task",
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
