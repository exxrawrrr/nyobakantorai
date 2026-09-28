import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"..");
const args=Object.fromEntries(process.argv.slice(2).filter((v)=>v.startsWith("--")&&v.includes("=")).map((v)=>{const i=v.indexOf("=");return[v.slice(2,i),v.slice(i+1)];}));
const id=String(args.id||"").trim().toLowerCase();
const name=String(args.name||"").trim();
const role=String(args.role||"").trim();
const department=String(args.department||"Custom");
if(!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new Error("--id must be lowercase kebab-case");
if(!name||!role) throw new Error("--name and --role are required");
const path=resolve(root,"config/employees.json"),registry=JSON.parse(readFileSync(path,"utf8"));
if(registry.employees.some((e)=>e.id===id)) throw new Error("Employee id already exists");
const common=["nyoba-task-truth","nyoba-manual-chatgpt-handoff","nyoba-approval-and-evidence","nyoba-safe-tool-use"];
const extra=String(args.skills||"").split(",").map((x)=>x.trim()).filter(Boolean);
const employee={
 id,name,role,department,summary:String(args.summary||`${role} custom employee.`),aliases:[],
 personality:{traits:["custom","scoped"],communication_style:"Direct, scoped, and evidence-aware.",catchphrases:[]},
 habits:{idle_habit:"Waits for scoped work.",thinking_habit:"Checks scope and evidence.",working_habit:"Works only within assigned scope.",stress_habit:"Escalates unclear authority.",success_habit:"Reports result and evidence."},
 work_style:{decision_style:"Use the smallest safe action.",handoff:"Artifact + evidence + next owner.",escalation:"Escalate unclear permissions or high-impact actions."},
 expertise:[],skills:[...new Set([...common,...extra])],preferred_toolsets:["skills","clarify"],external_capabilities:[],
 routing:{keywords:[role.toLowerCase(),id],collaborators:["praroro","siti"]},
 visual:{color:"#777777",asset_status:"pending-original-art",asset_id:null,scene_position:[1000,640],desk_slot:registry.employees.length,initials:name.slice(0,2).toUpperCase()},
 memory_boundary:"PROFILE_SCOPED",
 approval_policy:{autonomy:"GUARDED",read_only_without_approval:true,requires_approval:["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"],delegated_policy_required:true},
 verification_policy:{independent_required:true,self_verify:false,reviewer_candidates:["siti","fikri"]},
 profile:{distribution_version:"0.3.0"}
};
registry.employees.push(employee);registry.employee_count=registry.employees.length;
writeFileSync(path,JSON.stringify(registry,null,2)+"\n");
const generated=spawnSync(process.execPath,[resolve(root,"scripts/generate-workforce.mjs")],{stdio:"inherit"});
if(generated.status!==0) process.exit(generated.status??1);
console.log(`Added ${id}. Review registry metadata, routing, skills, visual position, and generated profile before committing.`);
