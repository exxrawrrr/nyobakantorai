import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateRequirements, inspectProviders } from "../packages/provider-doctor/index.mjs";

const root=resolve(import.meta.dirname,"..");
const catalog=JSON.parse(await readFile(resolve(root,"config/provider-doctor.json"),"utf8"));
const argv=process.argv.slice(2);
const flag=(name)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:null;};
const list=(name)=>(flag(name)||"").split(",").map(x=>x.trim()).filter(Boolean);
const selected=list("--provider");
const requireInstalled=list("--require-installed");
const requireReady=list("--require-ready");
const report=inspectProviders({catalog,selectedIds:selected.length?selected:null,root});
const requirements=evaluateRequirements(report,{requireInstalled,requireReady});

if(argv.includes("--json")) {
  process.stdout.write(JSON.stringify({...report,requirements},null,2)+"\n");
} else {
  console.log("Unified Provider Doctor");
  console.log("Detection only: no install, login, provider call, credential print, or self-test is performed.\n");
  for(const item of report.providers) {
    console.log(`${item.label} [${item.id}]`);
    console.log(`  support       ${item.support_state}`);
    console.log(`  install       ${item.install_state}`);
    console.log(`  configuration ${item.configuration_state}`);
    console.log(`  readiness     ${item.readiness}`);
    console.log(`  self-test     ${item.self_test_state}`);
    console.log(`  next          ${item.readiness==="READY_FOR_SELF_TEST"?item.self_test_hint:item.setup_hint}`);
    console.log("");
  }
  console.log(`Summary: ${report.summary.installed} installed · ${report.summary.available_on_demand} on-demand · ${report.summary.not_installed} not installed · ${report.summary.ready_for_self_test} ready for self-test`);
  if(!requirements.ok) {
    console.log("\nRequirement failures:");
    for(const error of requirements.errors) console.log("  - "+error);
  }
}
if(!requirements.ok) process.exitCode=1;
