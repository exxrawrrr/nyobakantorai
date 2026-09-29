import { createHash } from "node:crypto";
import { validateRealTaskDataset } from "../real-task-evaluation/index.mjs";

const nonEmpty=(v)=>typeof v==="string"&&v.trim().length>0;

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
function hash(value){
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function summarizeRealTaskCoverage(dataset,policy){
  const cases=Array.isArray(dataset?.cases)?dataset.cases:[];
  const successes=cases.filter(x=>x?.metrics?.success===true).length;
  const failures=cases.filter(x=>x?.metrics?.success===false).length;
  const verificationPasses=cases.filter(x=>x?.metrics?.verification_passed===true).length;
  const verificationFailures=cases.filter(x=>x?.metrics?.verification_passed===false).length;
  const falseSuccesses=cases.filter(x=>x?.metrics?.false_success===true).length;
  const recovered=cases.filter(x=>x?.metrics?.recovered_after_failure===true).length;
  const costKnown=cases.filter(x=>x?.metrics?.cost_known===true).length;
  const employees=[...new Set(cases.map(x=>x.employee_id).filter(nonEmpty))].sort();
  const sourceTypes=[...new Set(cases.map(x=>x.source_type).filter(nonEmpty))].sort();
  const remaining=Math.max(0,(policy?.minimum_cases||20)-cases.length);
  const rec=policy?.coverage_recommendations||{};
  const warnings=[];
  if(rec.minimum_distinct_employees&&employees.length<rec.minimum_distinct_employees){
    warnings.push("Coverage currently spans "+employees.length+" employee(s); recommendation is at least "+rec.minimum_distinct_employees+".");
  }
  if(rec.include_at_least_one_failure&&failures===0) warnings.push("No task failure is represented yet.");
  if(rec.include_at_least_one_success&&successes===0) warnings.push("No successful task is represented yet.");
  if(rec.include_at_least_one_verification_failure&&verificationFailures===0) warnings.push("No independent verification failure is represented yet.");

  return Object.freeze({
    cases:cases.length,
    minimum_cases_required:policy?.minimum_cases||20,
    remaining,
    successes,
    failures,
    verification_passes:verificationPasses,
    verification_failures:verificationFailures,
    false_successes:falseSuccesses,
    recovered_after_failure:recovered,
    cost_known:costKnown,
    distinct_employees:employees.length,
    employees:Object.freeze(employees),
    source_types:Object.freeze(sourceTypes),
    coverage_warnings:Object.freeze(warnings)
  });
}

export function validateImportSnapshot({snapshot,evaluationPolicy,employeeIds=[]}){
  const validation=validateRealTaskDataset({dataset:snapshot,policy:evaluationPolicy,employeeIds});
  const errors=[...validation.errors];
  if(!["COLLECTING","READY_FOR_REPORT"].includes(snapshot?.status)){
    errors.push("import snapshot status must be COLLECTING or READY_FOR_REPORT");
  }
  if(snapshot?.claim_state==="PUBLISHED_BASELINE"){
    errors.push("published snapshots cannot be imported as collection input");
  }
  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    cases:validation.cases,
    acceptance_passed:validation.acceptance_passed,
    sha256:hash(snapshot)
  });
}

function normalizeSummary(dataset,evaluationPolicy,baselinePolicy){
  const coverage=summarizeRealTaskCoverage(dataset,baselinePolicy);
  const validation=validateRealTaskDataset({
    dataset:{...dataset,summary:undefined},
    policy:evaluationPolicy,
    employeeIds:[]
  });
  return {
    acceptance_passed:validation.acceptance_passed,
    eligible_cases:coverage.cases,
    minimum_cases_required:evaluationPolicy.publication_gate.minimum_cases,
    task_successes:coverage.successes,
    task_failures:coverage.failures,
    verification_passes:coverage.verification_passes,
    verification_failures:coverage.verification_failures,
    false_successes:coverage.false_successes,
    recovered_after_failure:coverage.recovered_after_failure,
    distinct_employees:coverage.distinct_employees,
    source_types:[...coverage.source_types],
    remaining_cases:coverage.remaining,
    coverage_warnings:[...coverage.coverage_warnings],
    note:validation.acceptance_passed
      ?"Publication gate is satisfied, but publication still requires explicit human/reviewer promotion."
      :"Collection remains below the publication gate or has unresolved evidence constraints."
  };
}

export function mergeRealTaskSnapshots({
  canonical,
  snapshots,
  evaluationPolicy,
  baselinePolicy,
  employeeIds=[]
}){
  const canonicalCheck=validateRealTaskDataset({dataset:canonical,policy:evaluationPolicy,employeeIds});
  if(!canonicalCheck.ok) throw new Error("canonical dataset invalid: "+canonicalCheck.errors.join("; "));

  const byId=new Map((canonical.cases||[]).map(x=>[x.case_id,x]));
  const sourceToId=new Map((canonical.cases||[]).map(x=>[x.source_ref,x.case_id]));
  const added=[];
  const skippedIdentical=[];
  const conflicts=[];
  const imports=[];

  for(const snapshot of snapshots||[]){
    const check=validateImportSnapshot({snapshot,evaluationPolicy,employeeIds});
    imports.push({sha256:check.sha256,cases:check.cases,ok:check.ok,errors:[...check.errors]});
    if(!check.ok) continue;
    for(const item of snapshot.cases){
      const existingById=byId.get(item.case_id);
      const existingSourceId=sourceToId.get(item.source_ref);
      if(existingById){
        if(hash(existingById)===hash(item)){
          skippedIdentical.push({case_id:item.case_id,reason:"identical-case"});
          continue;
        }
        conflicts.push({case_id:item.case_id,reason:"case-id-conflict"});
        continue;
      }
      if(existingSourceId){
        conflicts.push({case_id:item.case_id,reason:"duplicate-source-ref",existing_case_id:existingSourceId});
        continue;
      }
      byId.set(item.case_id,item);
      sourceToId.set(item.source_ref,item.case_id);
      added.push(item.case_id);
    }
  }

  if(imports.some(x=>!x.ok)){
    return Object.freeze({
      ok:false,
      errors:Object.freeze(imports.flatMap((x,i)=>x.ok?[]:x.errors.map(e=>"snapshot "+(i+1)+": "+e))),
      added:Object.freeze([]),
      skipped_identical:Object.freeze(skippedIdentical),
      conflicts:Object.freeze(conflicts),
      imports:Object.freeze(imports),
      dataset:null
    });
  }
  if(conflicts.length){
    return Object.freeze({
      ok:false,
      errors:Object.freeze(conflicts.map(x=>x.reason+" for "+x.case_id)),
      added:Object.freeze([]),
      skipped_identical:Object.freeze(skippedIdentical),
      conflicts:Object.freeze(conflicts),
      imports:Object.freeze(imports),
      dataset:null
    });
  }

  const mergedCases=[...byId.values()].sort((a,b)=>{
    const ta=Date.parse(a.started_at)||0;
    const tb=Date.parse(b.started_at)||0;
    return ta-tb||String(a.case_id).localeCompare(String(b.case_id));
  });

  const merged={
    ...canonical,
    status:"COLLECTING",
    claim_state:"COLLECTING",
    note:"Merged collection candidate. This file is not a published baseline and must pass explicit prepare/review before promotion.",
    environment:{
      ...(canonical.environment||{}),
      collection_tool:"nyobakantorai-real-task-baseline",
      merged_snapshot_count:(snapshots||[]).length,
      merged_snapshot_sha256:imports.map(x=>x.sha256)
    },
    cases:mergedCases
  };
  merged.summary=normalizeSummary(merged,evaluationPolicy,baselinePolicy);

  const finalCheck=validateRealTaskDataset({dataset:merged,policy:evaluationPolicy,employeeIds});
  if(!finalCheck.ok){
    return Object.freeze({
      ok:false,
      errors:Object.freeze(finalCheck.errors),
      added:Object.freeze([]),
      skipped_identical:Object.freeze(skippedIdentical),
      conflicts:Object.freeze(conflicts),
      imports:Object.freeze(imports),
      dataset:null
    });
  }

  return Object.freeze({
    ok:true,
    errors:Object.freeze([]),
    added:Object.freeze(added),
    skipped_identical:Object.freeze(skippedIdentical),
    conflicts:Object.freeze([]),
    imports:Object.freeze(imports),
    dataset:merged,
    coverage:summarizeRealTaskCoverage(merged,baselinePolicy)
  });
}

export function prepareRealTaskBaseline({dataset,evaluationPolicy,baselinePolicy,employeeIds=[]}){
  const collecting={...dataset,status:"COLLECTING",claim_state:"COLLECTING"};
  collecting.summary=normalizeSummary(collecting,evaluationPolicy,baselinePolicy);
  const check=validateRealTaskDataset({dataset:collecting,policy:evaluationPolicy,employeeIds});
  if(!check.ok) throw new Error("dataset invalid: "+check.errors.join("; "));
  if(!check.acceptance_passed){
    const coverage=summarizeRealTaskCoverage(collecting,baselinePolicy);
    throw new Error("publication gate not satisfied: "+coverage.cases+"/"+coverage.minimum_cases_required+" cases, remaining="+coverage.remaining+", false_successes="+coverage.false_successes);
  }
  const ready={
    ...collecting,
    status:baselinePolicy.prepare.ready_state,
    claim_state:baselinePolicy.prepare.ready_claim_state,
    note:"Initial real-task baseline candidate passed the machine publication gate. Human/reviewer publication is still required."
  };
  ready.summary=normalizeSummary(ready,evaluationPolicy,baselinePolicy);
  const finalCheck=validateRealTaskDataset({dataset:ready,policy:evaluationPolicy,employeeIds});
  if(!finalCheck.ok||!finalCheck.acceptance_passed) throw new Error("prepared baseline failed validation: "+finalCheck.errors.join("; "));
  return Object.freeze(ready);
}

export function buildRealTaskCollectionReport({dataset,evaluationPolicy,baselinePolicy,employeeIds=[]}){
  const validation=validateRealTaskDataset({dataset,policy:evaluationPolicy,employeeIds});
  const coverage=summarizeRealTaskCoverage(dataset,baselinePolicy);
  return Object.freeze({
    schema:1,
    valid:validation.ok,
    status:dataset.status,
    claim_state:dataset.claim_state,
    publication_gate_passed:validation.acceptance_passed,
    ...coverage,
    canonical_source_uniqueness:validation.unique_sources,
    next:validation.acceptance_passed
      ?"Run explicit prepare/reviewer flow. Do not auto-publish."
      :"Collect "+coverage.remaining+" additional eligible real task(s) with direct provenance, complete evidence, and independent verification.",
    truth_boundary:baselinePolicy.truth_boundary,
    errors:Object.freeze([...validation.errors])
  });
}
