import { runOneWorkerFreshInstallMatrix } from "../packages/fresh-install-matrix/index.mjs";

const argv=process.argv.slice(2);
const employeeArg=argv.find((x)=>x.startsWith("--employee="));
const employeeIndex=argv.indexOf("--employee");
let employeeId="siti";
if(employeeArg) employeeId=employeeArg.slice("--employee=".length);
else if(employeeIndex>=0){
  const next=argv[employeeIndex+1];
  if(!next||next.startsWith("--")) throw new Error("--employee requires an employee id");
  employeeId=next;
}
const json=argv.includes("--json");

const result=await runOneWorkerFreshInstallMatrix({employeeId});
if(json) process.stdout.write(JSON.stringify(result,null,2)+"\n");
else{
  console.log("Fresh-install matrix: one worker");
  console.log("Employee: "+result.employee_id);
  console.log("First action: "+result.first_action);
  console.log("Rerun action: "+result.rerun_action);
  console.log("Installed profiles: "+result.installed_profiles.join(", "));
  console.log("User-owned state preserved: "+(result.user_owned_state_preserved?"YES":"NO"));
  console.log("Pack verified: "+(result.pack_verified?"YES":"NO"));
  console.log("Claim: "+result.claim_state);
  console.log(result.note);
}
if(!result.passed) process.exitCode=1;
