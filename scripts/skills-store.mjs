import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { materializeConfiguredUpgrades } from "../packages/skills-store/index.mjs";

const root=resolve(import.meta.dirname,"..");

export async function auditSkillsStore(){
  const state=await materializeConfiguredUpgrades({root});
  const rows=state.upgraded.map((employee)=>{
    const attachment=state.attachments.find((item)=>item.employee_id===employee.id);
    const baseline=state.employees.employees.find((item)=>item.id===employee.id);
    return {
      employee_id:employee.id,
      added_skill:attachment.skill_id,
      version:attachment.version,
      baseline_skill_count:baseline.skills.length,
      effective_skill_count:employee.skills.length,
      authority_effect:attachment.authority_effect,
      attachment_ref:attachment.attachment_ref,
    };
  });
  return {
    ok:rows.length===state.employees.employee_count
      && rows.every((row)=>row.effective_skill_count===row.baseline_skill_count+1&&row.authority_effect==="NONE"),
    catalog_ref:state.catalog.catalog_ref,
    catalog_size:state.catalog.skills.length,
    install_count:state.installations.length,
    attachment_count:state.attachments.length,
    workforce_count:state.employees.employee_count,
    rows,
  };
}

async function main(){
  const command=process.argv[2]||"check";
  if(command!=="check") throw new Error("Usage: node scripts/skills-store.mjs check");
  const result=await auditSkillsStore();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok) process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch((error)=>{console.error(error.stack||error.message);process.exitCode=1;});
}
