import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildCrossHarnessPlan,
  executeCrossHarnessSelfTest,
  findCommand,
  validateCrossHarnessSelfTestConfig,
} from "../packages/cross-harness-self-test/index.mjs";

const root=resolve(import.meta.dirname,"..");
const config=JSON.parse(await readFile(resolve(root,"config/cross-harness-self-test.json"),"utf8"));
const check=validateCrossHarnessSelfTestConfig(config);
if(!check.ok){
  process.stderr.write("Cross-harness self-test config invalid: "+check.errors.join("; ")+"\n");
  process.exit(1);
}

const argv=process.argv.slice(2);
const command=argv[0]||"plan";
const has=(name)=>argv.includes(name);
const flag=(name)=>{
  const i=argv.indexOf(name);
  return i>=0?argv[i+1]:null;
};
const json=has("--json");

function selectedTargets(){
  const raw=flag("--target")||"all";
  if(raw==="all") return config.harnesses.map(h=>h.id);
  return raw.split(",").map(x=>x.trim()).filter(Boolean);
}

async function detectCommands(){
  const out={};
  for(const harness of config.harnesses){
    const found=await findCommand(harness.command_candidates);
    if(found) out[harness.id]=found;
  }
  return out;
}

function printPlan(plan){
  console.log("Cross-harness self-service parity runner");
  for(const target of plan.targets){
    console.log("  "+target.id.padEnd(20)+" "+target.status);
  }
  console.log("");
  console.log("Plan is detection-only: no harness/model/provider execution.");
  console.log("Run always uses temporary workspaces and never auto-installs or logs in.");
  console.log("Claim limit: "+plan.claim_limit);
}

function printReport(report){
  console.log("Cross-harness self-test: "+report.claim_state);
  for(const target of report.targets){
    const status=target.status==="NOT_RUN"?"NOT_RUN":target.success?"PASS":"FAIL";
    console.log("  "+status.padEnd(8)+" "+target.id);
  }
  console.log("");
  console.log("Completed: "+report.summary.completed+" · Passed: "+report.summary.passed+" · Failed: "+report.summary.failed+" · Not run: "+report.summary.not_run);
  console.log("Comparison ready: "+(report.summary.comparison_ready?"YES":"NO"));
  console.log("Claim limit: "+report.claim_limit);
}

async function save(path,data){
  const out=resolve(path);
  await mkdir(dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(data,null,2)+"\n",{encoding:"utf8",mode:0o600});
  return out;
}

try{
  const selected=selectedTargets();
  const unknown=selected.filter(id=>!config.harnesses.some(h=>h.id===id));
  if(unknown.length) throw new Error("unknown harness id(s): "+unknown.join(", "));

  const detected=await detectCommands();
  const selectedMap=Object.fromEntries(Object.entries(detected).filter(([id])=>selected.includes(id)));

  if(command==="plan"){
    const full=buildCrossHarnessPlan({config,commandMap:detected});
    const plan={...full,targets:full.targets.filter(x=>selected.includes(x.id))};
    if(json) process.stdout.write(JSON.stringify(plan,null,2)+"\n");
    else printPlan(plan);
    process.exit(0);
  }

  if(command!=="run"){
    throw new Error("usage: cross-harness-self-test.mjs <plan|run> [--target all|id,id] [--json] [--out report.json]");
  }

  const report=await executeCrossHarnessSelfTest({
    config,
    selectedIds:selected,
    commandMap:selectedMap,
  });
  const output=flag("--out");
  const out=output?await save(output,report):null;
  const response=out?{...report,report_path:out}:report;
  if(json) process.stdout.write(JSON.stringify(response,null,2)+"\n");
  else{
    printReport(report);
    if(out) console.log("Evidence report: "+out);
  }

  if(report.summary.completed===0||report.summary.failed>0) process.exitCode=1;
}catch(error){
  process.stderr.write("Cross-harness self-test error: "+String(error?.message||error)+"\n");
  process.exitCode=1;
}
