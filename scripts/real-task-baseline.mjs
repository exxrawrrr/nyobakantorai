import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildRealTaskCollectionReport,
  mergeRealTaskSnapshots,
  prepareRealTaskBaseline,
  validateImportSnapshot,
} from "../packages/real-task-baseline/index.mjs";

const root=resolve(import.meta.dirname,"..");
const readJson=async(path)=>JSON.parse(await readFile(resolve(path),"utf8"));
const [evaluationPolicy,baselinePolicy,employees]=await Promise.all([
  readJson(resolve(root,"config/real-task-evaluation.json")),
  readJson(resolve(root,"config/real-task-baseline.json")),
  readJson(resolve(root,"config/employees.json")),
]);
const employeeIds=employees.employees.map(x=>x.id);
const argv=process.argv.slice(2);
const command=argv[0]||"status";
const flag=(name)=>{
  const i=argv.indexOf(name);
  return i>=0?argv[i+1]:null;
};
const flags=(name)=>{
  const values=[];
  for(let i=0;i<argv.length;i++) if(argv[i]===name&&argv[i+1]) values.push(argv[i+1]);
  return values;
};
const canonicalPath=resolve(flag("--canonical")||resolve(root,baselinePolicy.canonical_dataset));

async function loadCanonical(){
  return readJson(canonicalPath);
}
async function loadSnapshots(){
  const paths=flags("--snapshot");
  if(!paths.length) throw new Error("provide at least one --snapshot <file>");
  return Promise.all(paths.map(async path=>({path:resolve(path),data:await readJson(resolve(path))})));
}
async function writePrivateJson(path,value){
  const out=resolve(path);
  await mkdir(dirname(out),{recursive:true});
  const tmp=out+".tmp-"+process.pid;
  await writeFile(tmp,JSON.stringify(value,null,2)+"\n",{encoding:"utf8",mode:0o600});
  const {rename}=await import("node:fs/promises");
  await rename(tmp,out);
  return out;
}
function print(value){
  process.stdout.write(JSON.stringify(value,null,2)+"\n");
}

try{
  if(command==="status"){
    const dataset=await loadCanonical();
    const report=buildRealTaskCollectionReport({dataset,evaluationPolicy,baselinePolicy,employeeIds});
    print({...report,canonical:canonicalPath});
    if(!report.valid) process.exitCode=1;
  }else if(command==="audit"){
    const snapshots=await loadSnapshots();
    const results=snapshots.map(({path,data})=>{
      const check=validateImportSnapshot({snapshot:data,evaluationPolicy,employeeIds});
      return {path,...check};
    });
    print({
      ok:results.every(x=>x.ok),
      provider_calls:0,
      canonical_mutated:false,
      snapshots:results,
    });
    if(results.some(x=>!x.ok)) process.exitCode=1;
  }else if(command==="merge"){
    const outFlag=flag("--out");
    if(!outFlag) throw new Error("merge requires --out <candidate.json>; canonical overwrite is forbidden");
    const out=resolve(outFlag);
    if(out===canonicalPath) throw new Error("refusing to overwrite canonical dataset; write a review candidate to a separate --out path");
    const canonical=await loadCanonical();
    const snapshots=await loadSnapshots();
    const merged=mergeRealTaskSnapshots({
      canonical,
      snapshots:snapshots.map(x=>x.data),
      evaluationPolicy,
      baselinePolicy,
      employeeIds,
    });
    if(!merged.ok){
      print({
        ok:false,
        canonical_mutated:false,
        errors:merged.errors,
        conflicts:merged.conflicts,
        imports:merged.imports,
      });
      process.exitCode=1;
    }else{
      const written=await writePrivateJson(out,merged.dataset);
      print({
        ok:true,
        canonical_mutated:false,
        out:written,
        added:merged.added,
        skipped_identical:merged.skipped_identical,
        coverage:merged.coverage,
      });
    }
  }else if(command==="prepare"){
    const inputFlag=flag("--input");
    const outFlag=flag("--out");
    if(!inputFlag||!outFlag) throw new Error("prepare requires --input <collection.json> --out <ready.json>");
    const input=resolve(inputFlag);
    const out=resolve(outFlag);
    if(out===canonicalPath) throw new Error("refusing to overwrite canonical dataset; prepared baseline requires explicit reviewer promotion");
    const dataset=await readJson(input);
    const ready=prepareRealTaskBaseline({dataset,evaluationPolicy,baselinePolicy,employeeIds});
    const written=await writePrivateJson(out,ready);
    print({
      ok:true,
      published:false,
      canonical_mutated:false,
      out:written,
      status:ready.status,
      claim_state:ready.claim_state,
      cases:ready.cases.length,
      false_successes:ready.summary.false_successes,
      acceptance_passed:ready.summary.acceptance_passed,
    });
  }else if(command==="publish"){
    throw new Error("automatic publication is forbidden; review READY_FOR_REPORT evidence and promote through an explicit repository review");
  }else{
    throw new Error("usage: real-task-baseline.mjs <status|audit|merge|prepare> [--canonical path] [--snapshot file ...] [--input file] [--out file]");
  }
}catch(error){
  process.stderr.write("Real Task Baseline error: "+String(error?.message||error)+"\n");
  process.exitCode=1;
}
