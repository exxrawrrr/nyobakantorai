import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(fileURLToPath(new URL(".",import.meta.url)));
const result=JSON.parse(await readFile(resolve(root,"run-2026-09-29.json"),"utf8"));
const failures=[];
if(result.schema!==1) failures.push("schema must be 1");
if(result.claim_state!=="LIVE_MODEL_EVALUATED_ON_CONTROLLED_SYNTHETIC_SET") failures.push("unexpected claim_state");
if(result.summary?.cases!==5) failures.push("expected 5 cases");
if(result.summary?.passed!==5 || result.summary?.failed!==0) failures.push("all cases must pass");
if(result.summary?.average_reduction < result.acceptance.minimum_case_reduction) failures.push("average reduction below gate");
for(const item of result.results||[]){
  if(item.reduction < result.acceptance.minimum_case_reduction) failures.push(`${item.id}: reduction below gate`);
  if(item.strict_protected_atom_recall < result.acceptance.minimum_protected_atom_recall) failures.push(`${item.id}: protected atom recall below gate`);
  if(item.required_fact_recall_compiled < result.acceptance.minimum_compiled_required_fact_recall) failures.push(`${item.id}: compiled required-fact recall below gate`);
  if(item.exact_category_fidelity!==1) failures.push(`${item.id}: exact source/numeric fidelity below gate`);
  if(item.blind_compiled?.pass!==true) failures.push(`${item.id}: blind compiled downstream review failed`);
  if(item.blind_compiled?.critical_loss===true) failures.push(`${item.id}: blind review found critical loss`);
}
const blindPass=(result.results||[]).filter(x=>x.blind_compiled?.pass).length/Math.max(1,result.results?.length||0);
if(blindPass < result.acceptance.compiled_downstream_blind_pass_rate) failures.push("blind compiled pass rate below gate");
const critical=(result.results||[]).filter(x=>x.blind_compiled?.critical_loss).length;
if(critical > result.acceptance.maximum_compiled_downstream_critical_losses) failures.push("critical-loss gate failed");
if(/real[-_ ]?task/i.test(result.claim_state||"")) failures.push("controlled synthetic run must not masquerade as real-task evidence");
console.log(JSON.stringify({benchmark:result.benchmark,valid:failures.length===0,failures},null,2));
if(process.argv.includes("--check") && failures.length) process.exitCode=1;
