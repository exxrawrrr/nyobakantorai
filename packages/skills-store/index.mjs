import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export const SKILLS_STORE_API=1;
const clean=(v,max=4000)=>String(v??"").trim().slice(0,max);
const validTime=(v)=>typeof v==="string"&&v.trim()&&!Number.isNaN(Date.parse(v));
function assert(c,m){if(!c)throw new Error(m);}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function sha(v){return createHash("sha256").update(v).digest("hex");}
function ref(kind,v){return kind+":sha256:"+sha(JSON.stringify(stable(v)));}
function uniqSorted(items){return [...new Set(items)].sort((a,b)=>a.localeCompare(b));}

function parseFrontmatter(markdown){
  const match=String(markdown).match(/^---\n([\s\S]*?)\n---\n/);
  assert(match,"Skill frontmatter missing.");
  const lines=match[1].split("\n");
  const out={metadata:{}};
  const scalar=(value)=>{
    const raw=String(value??"").trim();
    if(raw.length>=2&&((raw.startsWith('"')&&raw.endsWith('"'))||(raw.startsWith("'")&&raw.endsWith("'")))) return raw.slice(1,-1);
    return raw;
  };
  let inMetadata=false;
  for(const raw of lines){
    const line=raw.replace(/\r$/,"");
    if(/^metadata:\s*$/.test(line)){inMetadata=true;continue;}
    if(inMetadata){
      const m=line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*(.*)$/);
      if(m){out.metadata[m[1]]=scalar(m[2]);continue;}
      if(/^\S/.test(line)) inMetadata=false;
    }
    if(!inMetadata){
      const m=line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if(m) out[m[1]]=scalar(m[2]);
    }
  }
  return out;
}

function normalizeSourceRef(source){
  return Object.freeze({
    source_id:source.id,
    source_commit:source.commit??null,
    license:source.license,
  });
}

export async function buildSkillCatalog({root=resolve(import.meta.dirname,"../..")}={}){
  const [policy,provenance,upstream]=await Promise.all([
    readFile(resolve(root,"config/skills-store-policy.json"),"utf8").then(JSON.parse),
    readFile(resolve(root,"config/skill-provenance.json"),"utf8").then(JSON.parse),
    readFile(resolve(root,"config/upstream-sources.json"),"utf8").then(JSON.parse),
  ]);
  const sourceById=new Map(upstream.sources.map((s)=>[s.id,s]));
  const dirs=(await readdir(resolve(root,policy.catalog_root),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort();
  const skills=[];
  for(const id of dirs){
    const path=resolve(root,policy.catalog_root,id,"SKILL.md");
    const text=await readFile(path,"utf8");
    const fm=parseFrontmatter(text);
    assert(fm.name===id,id+": frontmatter name mismatch");
    const version=clean(fm.metadata?.["nyoba-version"],40);
    assert(/^\d+\.\d+\.\d+$/.test(version),id+": missing/invalid nyoba-version");
    const p=provenance.skills[id]||null;
    const sourceRefs=p
      ? p.source_ids.map((sourceId)=>{
          const source=sourceById.get(sourceId);
          assert(source,id+": unknown provenance source "+sourceId);
          return normalizeSourceRef(source);
        })
      : [{source_id:"project:nyobakantorai",source_commit:null,license:"MIT"}];
    skills.push(Object.freeze({
      schema:1,
      skill_id:id,
      version,
      description:clean(fm.description,1000),
      compatibility:clean(fm.compatibility,1000)||null,
      content_sha256:sha(text),
      provenance_mode:p?.mode||"original",
      source_refs:Object.freeze(sourceRefs),
      authority_effect:"NONE",
      artifact_path:policy.catalog_root+"/"+id+"/SKILL.md",
    }));
  }
  return Object.freeze({
    schema:1,
    catalog_ref:ref("skill-catalog",skills.map(s=>({skill_id:s.skill_id,version:s.version,content_sha256:s.content_sha256,source_refs:s.source_refs}))),
    skills:Object.freeze(skills),
  });
}

function installPayload(x){return Object.freeze({
  schema:1,skill_id:x.skill_id,version:x.version,content_sha256:x.content_sha256,
  source_refs:x.source_refs,installed_by:x.installed_by,installed_at:x.installed_at,
  evidence_ref:x.evidence_ref,authority_effect:x.authority_effect,
});}

function forbiddenAuthorityKeys(input){
  const keys=["capability_scope","capability_grants","connector_grants","permissions","toolsets","preferred_toolsets","external_capabilities","optional_integrations","approval_policy","autonomy"];
  return keys.filter(k=>Object.prototype.hasOwnProperty.call(input||{},k));
}

export function installSkill(input,{catalog,policy}={}){
  assert(input&&typeof input==="object","Skill installation input required.");
  const bad=forbiddenAuthorityKeys(input);
  assert(!bad.length,"Skill install cannot request authority changes: "+bad.join(","));
  const actor=clean(input.actor,80).toLowerCase();
  assert(policy.install_actors.includes(actor),"Only an allowed Skills Store installer may install skills.");
  const skillId=clean(input.skill_id,160);
  const version=clean(input.version,40);
  const entry=catalog.skills.find(s=>s.skill_id===skillId&&s.version===version);
  assert(entry,"Exact catalog skill version not found.");
  assert(validTime(input.installed_at),"installed_at invalid.");
  const evidence=clean(input.evidence_ref,1000);
  assert(/^[a-z][a-z0-9+.-]*:/i.test(evidence),"Installation evidence_ref required.");
  const out={
    schema:1,skill_id:entry.skill_id,version:entry.version,content_sha256:entry.content_sha256,
    source_refs:entry.source_refs,installed_by:actor,installed_at:new Date(input.installed_at).toISOString(),
    evidence_ref:evidence,authority_effect:"NONE",
  };
  return Object.freeze({...out,install_ref:ref("skill-install",installPayload(out))});
}

export function validateSkillInstallation(installation,{catalog}={}){
  const entry=catalog.skills.find(s=>s.skill_id===installation?.skill_id&&s.version===installation?.version);
  assert(entry,"Installed skill is not in exact catalog version.");
  assert(installation.content_sha256===entry.content_sha256,"Installed skill content hash drift.");
  assert(JSON.stringify(installation.source_refs)===JSON.stringify(entry.source_refs),"Installed skill provenance drift.");
  assert(installation.authority_effect==="NONE","Skill installation cannot carry authority.");
  const expected=ref("skill-install",installPayload(installation));
  assert(expected===installation.install_ref,"Skill install_ref checksum mismatch.");
  return true;
}

function preservedAuthority(employee){
  return {
    capability_scope:[...(employee.operational_contract?.capability_scope||[])],
    preferred_toolsets:[...(employee.preferred_toolsets||[])],
    external_capabilities:[...(employee.external_capabilities||[])],
    optional_integrations:[...(employee.optional_integrations||[])],
    approval_policy:structuredClone(employee.approval_policy||{}),
    verification_policy:structuredClone(employee.verification_policy||{}),
    memory_boundary:employee.memory_boundary,
  };
}

function attachPayload(x){return Object.freeze({
  schema:1,employee_id:x.employee_id,skill_id:x.skill_id,version:x.version,
  install_ref:x.install_ref,attached_by:x.attached_by,attached_at:x.attached_at,
  evidence_ref:x.evidence_ref,authority_effect:x.authority_effect,authority_snapshot_sha256:x.authority_snapshot_sha256,
});}

export function attachSkill(input,{installation,employee,policy,catalog}={}){
  assert(input&&typeof input==="object","Skill attachment input required.");
  const bad=forbiddenAuthorityKeys(input);
  assert(!bad.length,"Skill attach cannot request authority changes: "+bad.join(","));
  validateSkillInstallation(installation,{catalog});
  const actor=clean(input.actor,80).toLowerCase();
  assert(policy.attach_actors.includes(actor),"Only an allowed Skills Store attacher may attach skills.");
  assert(clean(input.employee_id,80)===employee.id,"Skill attachment employee mismatch.");
  assert(installation.skill_id===clean(input.skill_id,160),"Skill attachment skill mismatch.");
  assert(installation.version===clean(input.version,40),"Skill attachment version mismatch.");
  assert(validTime(input.attached_at),"attached_at invalid.");
  const evidence=clean(input.evidence_ref,1000);
  assert(/^[a-z][a-z0-9+.-]*:/i.test(evidence),"Attachment evidence_ref required.");
  const authoritySnapshot=preservedAuthority(employee);
  const out={
    schema:1,employee_id:employee.id,skill_id:installation.skill_id,version:installation.version,
    install_ref:installation.install_ref,attached_by:actor,attached_at:new Date(input.attached_at).toISOString(),
    evidence_ref:evidence,authority_effect:"NONE",authority_snapshot_sha256:sha(JSON.stringify(stable(authoritySnapshot))),
  };
  return Object.freeze({...out,attachment_ref:ref("skill-attachment",attachPayload(out))});
}

export function validateSkillAttachment(attachment,{employee}={}){
  assert(attachment?.schema===1,"Skill attachment schema must be 1.");
  assert(attachment.employee_id===employee?.id,"Skill attachment employee mismatch.");
  assert(attachment.attached_by==="owner","Skill attachment must be owner-reviewed.");
  assert(attachment.authority_effect==="NONE","Skill attachment cannot carry authority.");
  assert(/^skill-install:sha256:[a-f0-9]{64}$/.test(clean(attachment.install_ref,200)),"Skill attachment install_ref invalid.");
  assert(/^skill-attachment:sha256:[a-f0-9]{64}$/.test(clean(attachment.attachment_ref,200)),"Skill attachment_ref invalid.");
  const snapshot=sha(JSON.stringify(stable(preservedAuthority(employee))));
  assert(snapshot===attachment.authority_snapshot_sha256,"Skill attachment authority snapshot drift.");
  const expected=ref("skill-attachment",attachPayload(attachment));
  assert(expected===attachment.attachment_ref,"Skill attachment_ref checksum mismatch.");
  return true;
}

export function applySkillAttachments(employee,attachments=[]){
  const before=preservedAuthority(employee);
  const applicable=attachments.filter(a=>a.employee_id===employee.id);
  for(const attachment of applicable) validateSkillAttachment(attachment,{employee});
  const skills=uniqSorted([...(employee.skills||[]),...applicable.map(a=>a.skill_id)]);
  const upgraded=structuredClone(employee);
  upgraded.skills=skills;
  const after=preservedAuthority(upgraded);
  assert(JSON.stringify(stable(before))===JSON.stringify(stable(after)),"Skill attachment changed employee authority.");
  return Object.freeze(upgraded);
}

export function validateCapabilityLoops({employees,loops,catalog}={}){
  const errors=[];
  const employeeIds=employees.employees.map(e=>e.id);
  const loopIds=(loops.loops||[]).map(l=>l.employee_id);
  if(loops?.schema!==1)errors.push("Capability-loop schema must be 1.");
  if(loops?.workforce_size!==employees.employee_count)errors.push("Capability-loop workforce_size drift.");
  if(new Set(loopIds).size!==loopIds.length)errors.push("Capability-loop employee IDs must be unique.");
  if(JSON.stringify([...loopIds].sort())!==JSON.stringify([...employeeIds].sort()))errors.push("Capability loops must cover every employee exactly once.");
  for(const loop of loops.loops||[]){
    const employee=employees.employees.find(e=>e.id===loop.employee_id);
    if(!employee){errors.push(loop.employee_id+": unknown employee");continue;}
    for(const field of ["focus","observe","practice","measure","recommended_upgrade_skill"]){
      if(!clean(loop[field]))errors.push(loop.employee_id+": missing "+field);
    }
    const skill=catalog.skills.find(s=>s.skill_id===loop.recommended_upgrade_skill);
    if(!skill)errors.push(loop.employee_id+": recommended skill missing from catalog");
    if(employee.skills.includes(loop.recommended_upgrade_skill))errors.push(loop.employee_id+": recommended upgrade skill is already baseline-attached");
  }
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});
}

export async function materializeConfiguredUpgrades({root=resolve(import.meta.dirname,"../..")}={}){
  const [policy,employees,loops,attachmentConfig,catalog]=await Promise.all([
    readFile(resolve(root,"config/skills-store-policy.json"),"utf8").then(JSON.parse),
    readFile(resolve(root,"config/employees.json"),"utf8").then(JSON.parse),
    readFile(resolve(root,"config/workforce-capability-loops.json"),"utf8").then(JSON.parse),
    readFile(resolve(root,"config/skill-store-attachments.json"),"utf8").then(JSON.parse),
    buildSkillCatalog({root}),
  ]);
  const loopCheck=validateCapabilityLoops({employees,loops,catalog});
  assert(loopCheck.ok,loopCheck.errors.join("; "));
  assert(attachmentConfig.approved_by==="owner","Configured skill attachments must be owner-approved.");
  assert(validTime(attachmentConfig.approved_at),"Configured skill attachment approval time invalid.");
  assert((attachmentConfig.attachments||[]).length===employees.employee_count,"Configured skill attachments must cover all employees exactly once.");
  const seen=new Set();
  const installations=new Map();
  const attachments=[];
  const upgraded=[];
  for(const req of attachmentConfig.attachments){
    assert(!seen.has(req.employee_id),"Duplicate configured skill attachment employee: "+req.employee_id);seen.add(req.employee_id);
    const employee=employees.employees.find(e=>e.id===req.employee_id);assert(employee,"Unknown configured attachment employee.");
    const loop=loops.loops.find(l=>l.employee_id===req.employee_id);assert(loop,"Missing configured capability loop.");
    assert(loop.recommended_upgrade_skill===req.skill_id,"Configured attachment must match capability-loop recommendation.");
    assert(req.authority_effect==="NONE","Configured attachment authority_effect must be NONE.");
    const key=req.skill_id+"@"+req.version;
    let installation=installations.get(key);
    if(!installation){
      installation=installSkill({
        actor:"owner",skill_id:req.skill_id,version:req.version,installed_at:attachmentConfig.approved_at,
        evidence_ref:attachmentConfig.evidence_ref+":install:"+req.skill_id,
      },{catalog,policy});
      installations.set(key,installation);
    }
    const attachment=attachSkill({
      actor:"owner",employee_id:req.employee_id,skill_id:req.skill_id,version:req.version,
      attached_at:attachmentConfig.approved_at,evidence_ref:attachmentConfig.evidence_ref+":attach:"+req.employee_id,
    },{installation,employee,policy,catalog});
    attachments.push(attachment);
    upgraded.push(applySkillAttachments(employee,[attachment]));
  }
  return Object.freeze({policy,employees,loops,catalog,installations:Object.freeze([...installations.values()]),attachments:Object.freeze(attachments),upgraded:Object.freeze(upgraded)});
}

export function validateEmployeeAdditionGap(gap,{policy}={}){
  const text=clean(gap,4000);
  const min=Number(policy?.employee_addition?.minimum_gap_length||24);
  assert(text.length>=min,"New employee requires a documented capability gap of at least "+min+" characters.");
  assert(!/^(more capacity|extra help|need more people|because we want)/i.test(text),"Capability gap must describe a missing role/capability, not generic headcount demand.");
  return text;
}
