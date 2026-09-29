import { runFullWorkforceFreshInstallMatrix, runOneWorkerFreshInstallMatrix, runSubsetFreshInstallMatrix } from "../packages/fresh-install-matrix/index.mjs";

const argv=process.argv.slice(2);
const modeArg=argv.find((x)=>x.startsWith("--mode="));
const mode=modeArg?modeArg.slice("--mode=".length):(argv.includes("--subset")?"subset":"one-worker");
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

let result;
if(mode==="subset"){
  const employeesEq=argv.find((x)=>x.startsWith("--employees="));
  const employeesIndex=argv.indexOf("--employees");
  let selection=employeesEq?employeesEq.slice("--employees=".length):"engineering";
  if(employeesIndex>=0){
    const next=argv[employeesIndex+1];
    if(!next||next.startsWith("--")) throw new Error("--employees requires a comma-separated value or preset");
    selection=next;
  }
  const removeEq=argv.find((x)=>x.startsWith("--remove="));
  const removeIndex=argv.indexOf("--remove");
  let removeEmployeeId=removeEq?removeEq.slice("--remove=".length):"bimo";
  if(removeIndex>=0){
    const next=argv[removeIndex+1];
    if(!next||next.startsWith("--")) throw new Error("--remove requires an employee id");
    removeEmployeeId=next;
  }
  result=await runSubsetFreshInstallMatrix({selection,removeEmployeeId});
}else if(mode==="full"){
  result=await runFullWorkforceFreshInstallMatrix();
}else if(mode==="one-worker"){
  result=await runOneWorkerFreshInstallMatrix({employeeId});
}else{
  throw new Error("Unknown --mode. Use one-worker, subset, or full.");
}

if(json) process.stdout.write(JSON.stringify(result,null,2)+"\n");
else if(mode==="full"){
  console.log("Fresh-install matrix: full workforce");
  console.log("Registry employees: "+result.registry_employee_count);
  console.log("Installed profiles: "+result.installed_profiles.length);
  console.log("Exact workforce set: "+(result.installed_all_profiles_exactly?"PASS":"FAIL"));
  console.log("Capability isolation: "+(result.capability_isolation_passed?"PASS":"FAIL"));
  console.log("All packs verified: "+(result.all_packs_verified?"YES":"NO"));
  console.log("Rerun profiles exact: "+(result.rerun_profiles_exact?"YES":"NO"));
  console.log("User-owned state preserved: "+(result.all_user_owned_state_preserved?"YES":"NO"));
  console.log("Claim: "+result.claim_state);
  console.log(result.note);
}else if(mode==="subset"){
  console.log("Fresh-install matrix: subset workers");
  console.log("Selection: "+result.selection+" -> "+result.selected_profiles.join(", "));
  console.log("Installed profiles: "+result.installed_profiles.join(", "));
  console.log("Capability isolation: "+(result.capability_isolation_passed?"PASS":"FAIL"));
  console.log("Removal preview: "+result.removal.preview_action);
  console.log("Removal confirmed action: "+result.removal.confirmed_action+" ("+result.removal.requested_profile+")");
  console.log("Remaining profiles: "+result.removal.remaining_profiles.join(", "));
  console.log("Survivors preserved: "+(result.survivor_profiles_preserved?"YES":"NO"));
  console.log("Claim: "+result.claim_state);
  console.log(result.note);
}else{
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

