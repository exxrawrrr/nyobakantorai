import { readdir,readFile,stat } from "node:fs/promises";
import { dirname,relative,resolve,sep } from "node:path";

export const REQUIRED_SUBSYSTEMS=Object.freeze([
  "runtime-adapters","cross-harness-runner","provider-doctor","evidence-verifier",
  "execution-receipts","memory-policy-isolation","employee-packs","install-lifecycle-matrices",
  "real-task-recorder","deferred-evidence-release-claims","approval-queue","office-runtime-reconciliation"
]);
export const COMPLEXITY_DECISIONS=Object.freeze(["KEEP","SIMPLIFY","MERGE","DELETE","DEFER DECISION"]);
const nonEmpty=(v)=>typeof v==="string"&&v.trim().length>0;
async function exists(path){try{await stat(path);return true;}catch{return false;}}

async function walkMjs(root,dir=root,out=[]){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if([".git","node_modules","dist"].includes(entry.name))continue;
    const full=resolve(dir,entry.name);
    if(entry.isDirectory())await walkMjs(root,full,out);
    else if(entry.isFile()&&entry.name.endsWith(".mjs"))out.push(full);
  }
  return out;
}

function importSpecifiers(text){
  const found=[];
  for(const re of [/\bfrom\s+["']([^"']+)["']/g,/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,/^\s*import\s+["']([^"']+)["']/gm]){
    for(const match of text.matchAll(re))found.push(match[1]);
  }
  return found;
}

export async function findRelativeImporters(root,target){
  const targetAbs=resolve(root,target);
  const files=await walkMjs(root);
  const importers=[];
  for(const file of files){
    const text=await readFile(file,"utf8");
    for(const spec of importSpecifiers(text)){
      if(!spec.startsWith("."))continue;
      const resolved=resolve(dirname(file),spec);
      if(resolved===targetAbs){importers.push(relative(root,file).split(sep).join("/"));break;}
    }
  }
  return Object.freeze(importers.sort());
}

export async function validateComplexityBudget(ledger,{root=resolve(import.meta.dirname,"../..")}={}){
  const errors=[];
  if(ledger?.schema!==1)errors.push("complexity budget schema must be 1");
  if(!nonEmpty(ledger?.candidate))errors.push("candidate required");
  if(!/^[a-f0-9]{40}$/.test(ledger?.measured_at_commit||""))errors.push("measured_at_commit must be exact git sha");
  if(!Array.isArray(ledger?.subsystems))errors.push("subsystems required");
  const byId=new Map();
  for(const row of ledger?.subsystems||[]){
    if(!nonEmpty(row?.subsystem)){errors.push("subsystem id required");continue;}
    if(byId.has(row.subsystem))errors.push("duplicate subsystem "+row.subsystem);byId.set(row.subsystem,row);
    for(const field of ["problem_solved","property_bought","risk_reduced","runtime_coupling","delete_test_answer","owner_review_note"]){
      if(!nonEmpty(row?.[field]))errors.push(row.subsystem+": "+field+" required");
    }
    if(!Array.isArray(row.evidence)||!row.evidence.length)errors.push(row.subsystem+": evidence required");
    for(const path of row.evidence||[])if(!await exists(resolve(root,path)))errors.push(row.subsystem+": evidence path missing: "+path);
    if(!Array.isArray(row.failure_modes)||!row.failure_modes.length)errors.push(row.subsystem+": failure_modes required");
    if(!COMPLEXITY_DECISIONS.includes(row.keep_simplify_delete))errors.push(row.subsystem+": invalid decision");
    const surface=row.maintenance_surface;
    if(!surface||!Number.isInteger(surface.tracked_files)||surface.tracked_files<1||!Number.isInteger(surface.approx_bytes)||surface.approx_bytes<1)errors.push(row.subsystem+": maintenance_surface metrics required");
    if(!Array.isArray(surface?.primary_paths)||!surface.primary_paths.length)errors.push(row.subsystem+": maintenance_surface primary_paths required");
    for(const path of surface?.primary_paths||[]){
      const normalized=path.endsWith("/")?path.slice(0,-1):path;
      if(!await exists(resolve(root,normalized)))errors.push(row.subsystem+": maintenance path missing: "+path);
    }
  }
  for(const id of REQUIRED_SUBSYSTEMS)if(!byId.has(id))errors.push("missing required subsystem "+id);
  if((ledger?.subsystems||[]).some((row)=>!REQUIRED_SUBSYSTEMS.includes(row.subsystem)))errors.push("unexpected subsystem row");
  const nonKeep=(ledger?.subsystems||[]).filter((row)=>row.keep_simplify_delete!=="KEEP");
  if(!nonKeep.length)errors.push("delete test requires at least one concrete non-KEEP decision");
  if(!Array.isArray(ledger?.deep_evaluations)||!ledger.deep_evaluations.length)errors.push("at least one deep evaluation required");

  const packageJson=JSON.parse(await readFile(resolve(root,"package.json"),"utf8"));
  for(const evaluation of ledger?.deep_evaluations||[]){
    const row=byId.get(evaluation.subsystem);
    if(!row)errors.push(evaluation.id+": unknown subsystem");
    else if(row.keep_simplify_delete!==evaluation.decision)errors.push(evaluation.id+": decision does not match ledger row");
    if(!["SIMPLIFY","MERGE","DELETE","DEFER DECISION"].includes(evaluation.decision))errors.push(evaluation.id+": deep evaluation must target non-KEEP decision");
    for(const field of ["concrete_change","migration_note","rollback_recovery","execute_in"])if(!nonEmpty(evaluation?.[field]))errors.push(evaluation.id+": "+field+" required");
    for(const field of ["preserved_surfaces","planned_changes","risks","replacement_test_plan"])if(!Array.isArray(evaluation?.[field])||!evaluation[field].length)errors.push(evaluation.id+": "+field+" required");
    for(const path of evaluation.preserved_surfaces||[]){
      if(path.includes("historical ")||path.includes("release manifest"))continue;
      if(!await exists(resolve(root,path)))errors.push(evaluation.id+": preserved surface missing: "+path);
    }
    const scan=evaluation.dependency_scan;
    if(!scan||!Array.isArray(scan.targets)||!scan.targets.length)errors.push(evaluation.id+": dependency scan targets required");
    for(const target of scan?.targets||[]){
      if(!await exists(resolve(root,target.module))){errors.push(evaluation.id+": target module missing: "+target.module);continue;}
      const actual=await findRelativeImporters(root,target.module);
      const expected=[...(target.expected_importers||[])].sort();
      if(JSON.stringify(actual)!==JSON.stringify(expected))errors.push(evaluation.id+": dependency scan drift for "+target.module+" expected="+JSON.stringify(expected)+" actual="+JSON.stringify(actual));
    }
    if(scan?.require_private_root_package===true&&packageJson.private!==true)errors.push(evaluation.id+": root package must remain private for internal-only migration assumption");
    if(scan?.require_no_package_exports===true&&packageJson.exports!==undefined)errors.push(evaluation.id+": package exports appeared; migration assumptions must be reviewed");
    if(evaluation.execution_status!==undefined&&!["PLANNED","COMPLETED"].includes(evaluation.execution_status))errors.push(evaluation.id+": invalid execution_status");
    if(evaluation.execution_status==="COMPLETED"){
      if(!nonEmpty(evaluation.executed_in))errors.push(evaluation.id+": executed_in required for completed pruning");
      if(!nonEmpty(evaluation.execution_note))errors.push(evaluation.id+": execution_note required for completed pruning");
      if(!Array.isArray(evaluation.removed_paths)||!evaluation.removed_paths.length)errors.push(evaluation.id+": removed_paths required for completed pruning");
      if(!Array.isArray(evaluation.replacement_paths)||!evaluation.replacement_paths.length)errors.push(evaluation.id+": replacement_paths required for completed pruning");
      for(const path of evaluation.removed_paths||[])if(await exists(resolve(root,path)))errors.push(evaluation.id+": removed path still exists: "+path);
      for(const path of evaluation.replacement_paths||[])if(!await exists(resolve(root,path)))errors.push(evaluation.id+": replacement path missing: "+path);
    }
  }

  const decisions=Object.fromEntries(COMPLEXITY_DECISIONS.map((d)=>[d,(ledger?.subsystems||[]).filter((row)=>row.keep_simplify_delete===d).length]));
  return Object.freeze({ok:!errors.length,errors:Object.freeze(errors),subsystems:(ledger?.subsystems||[]).length,decisions:Object.freeze(decisions),non_keep:Object.freeze(nonKeep.map((row)=>row.subsystem)),deep_evaluations:(ledger?.deep_evaluations||[]).length,completed_pruning:Object.freeze((ledger?.deep_evaluations||[]).filter((item)=>item.execution_status==="COMPLETED").map((item)=>item.id))});
}

export function buildComplexityBudgetSnapshot({ledger,validation}){
  if(!validation?.ok)throw new Error("cannot snapshot invalid complexity budget");
  return Object.freeze({
    schema:1,candidate:ledger.candidate,measured_at_commit:ledger.measured_at_commit,
    subsystem_count:validation.subsystems,decisions:validation.decisions,
    non_keep:validation.non_keep,deep_evaluations:validation.deep_evaluations,
    truth_boundary:"KEEP != free; non-KEEP != permission to delete; pruning requires dependency + replacement + rollback evidence"
  });
}

export async function readAndValidateComplexityBudget({root=resolve(import.meta.dirname,"../..")}={}){
  const ledger=JSON.parse(await readFile(resolve(root,"config/complexity-budget.json"),"utf8"));
  return {ledger,validation:await validateComplexityBudget(ledger,{root})};
}
