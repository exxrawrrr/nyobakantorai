import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildSkillCatalog,
  installSkill,
  validateSkillInstallation,
  attachSkill,
  applySkillAttachments,
  validateCapabilityLoops,
  materializeConfiguredUpgrades,
  validateEmployeeAdditionGap,
} from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");
const readJson=async(path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
const authority=(employee)=>({
  capability_scope:employee.operational_contract.capability_scope,
  preferred_toolsets:employee.preferred_toolsets,
  external_capabilities:employee.external_capabilities,
  optional_integrations:employee.optional_integrations,
  approval_policy:employee.approval_policy,
  verification_policy:employee.verification_policy,
  memory_boundary:employee.memory_boundary,
});

test("skill catalog is built from canonical SKILL.md with exact version, hash, and provenance",async()=>{
  const catalog=await buildSkillCatalog({root});
  assert.equal(catalog.schema,1);
  assert.match(catalog.catalog_ref,/^skill-catalog:sha256:[a-f0-9]{64}$/);
  assert.ok(catalog.skills.length>=35);

  const taskTruth=catalog.skills.find(s=>s.skill_id==="nyoba-task-truth");
  assert.equal(taskTruth.version,"1.0.0");
  assert.match(taskTruth.content_sha256,/^[a-f0-9]{64}$/);
  assert.equal(taskTruth.authority_effect,"NONE");
  assert.deepEqual(taskTruth.source_refs,[{source_id:"project:nyobakantorai",source_commit:null,license:"MIT"}]);

  const engineering=catalog.skills.find(s=>s.skill_id==="nyoba-skill-engineering");
  assert.equal(engineering.provenance_mode,"recreated");
  assert.ok(engineering.source_refs.some(ref=>ref.source_id==="superpowers"));
  assert.ok(engineering.source_refs.some(ref=>ref.source_id==="ecc"));
});

test("skill installation is owner-reviewed, exact-version pinned, and authority-free",async()=>{
  const [catalog,policy]=await Promise.all([buildSkillCatalog({root}),readJson("config/skills-store-policy.json")]);
  const installed=installSkill({
    actor:"owner",skill_id:"nyoba-follow-up",version:"1.0.0",
    installed_at:"2026-10-02T07:05:00.000Z",evidence_ref:"chat21:test-install",
  },{catalog,policy});
  assert.equal(installed.authority_effect,"NONE");
  assert.match(installed.install_ref,/^skill-install:sha256:[a-f0-9]{64}$/);
  assert.equal(validateSkillInstallation(installed,{catalog}),true);

  assert.throws(()=>installSkill({
    actor:"praroro",skill_id:"nyoba-follow-up",version:"1.0.0",
    installed_at:"2026-10-02T07:05:00.000Z",evidence_ref:"chat21:self-install",
  },{catalog,policy}),/allowed Skills Store installer/);

  assert.throws(()=>installSkill({
    actor:"owner",skill_id:"nyoba-follow-up",version:"9.9.9",
    installed_at:"2026-10-02T07:05:00.000Z",evidence_ref:"chat21:wrong-version",
  },{catalog,policy}),/Exact catalog skill version not found/);

  assert.throws(()=>installSkill({
    actor:"owner",skill_id:"nyoba-follow-up",version:"1.0.0",
    installed_at:"2026-10-02T07:05:00.000Z",evidence_ref:"chat21:malicious",
    capability_scope:["ads.google.write"],
  },{catalog,policy}),/cannot request authority changes/);
});

test("skill attachment can extend procedures but cannot self-grant tools, connectors, or permissions",async()=>{
  const [catalog,policy,employees]=await Promise.all([
    buildSkillCatalog({root}),readJson("config/skills-store-policy.json"),readJson("config/employees.json"),
  ]);
  const employee=employees.employees.find(e=>e.id==="praroro");
  const installed=installSkill({
    actor:"owner",skill_id:"nyoba-follow-up",version:"1.0.0",
    installed_at:"2026-10-02T07:05:00.000Z",evidence_ref:"chat21:install-follow-up",
  },{catalog,policy});

  assert.throws(()=>attachSkill({
    actor:"praroro",employee_id:"praroro",skill_id:"nyoba-follow-up",version:"1.0.0",
    attached_at:"2026-10-02T07:06:00.000Z",evidence_ref:"chat21:self-attach",
  },{installation:installed,employee,policy,catalog}),/allowed Skills Store attacher/);

  assert.throws(()=>attachSkill({
    actor:"owner",employee_id:"praroro",skill_id:"nyoba-follow-up",version:"1.0.0",
    attached_at:"2026-10-02T07:06:00.000Z",evidence_ref:"chat21:bad-attach",
    connector_grants:["google-ads-readonly"],preferred_toolsets:["connections"],
  },{installation:installed,employee,policy,catalog}),/cannot request authority changes/);

  const attachment=attachSkill({
    actor:"owner",employee_id:"praroro",skill_id:"nyoba-follow-up",version:"1.0.0",
    attached_at:"2026-10-02T07:06:00.000Z",evidence_ref:"chat21:attach-follow-up",
  },{installation:installed,employee,policy,catalog});
  assert.equal(attachment.authority_effect,"NONE");
  assert.match(attachment.attachment_ref,/^skill-attachment:sha256:[a-f0-9]{64}$/);

  const before=structuredClone(authority(employee));
  const upgraded=applySkillAttachments(employee,[attachment]);
  assert.ok(upgraded.skills.includes("nyoba-follow-up"));
  assert.deepEqual(authority(upgraded),before);
});

test("capability-loop config covers all 16 employees exactly once with a real new reusable skill",async()=>{
  const [catalog,employees,loops]=await Promise.all([
    buildSkillCatalog({root}),readJson("config/employees.json"),readJson("config/workforce-capability-loops.json"),
  ]);
  const check=validateCapabilityLoops({employees,loops,catalog});
  assert.equal(check.ok,true,check.errors.join("\n"));
  assert.equal(loops.loops.length,16);
  assert.equal(new Set(loops.loops.map(x=>x.employee_id)).size,16);
  for(const loop of loops.loops){
    const employee=employees.employees.find(e=>e.id===loop.employee_id);
    assert.equal(employee.skills.includes(loop.recommended_upgrade_skill),false);
  }
});

test("configured CHAT 21 upgrades attach one reviewed skill to all 16 employees without authority drift",async()=>{
  const state=await materializeConfiguredUpgrades({root});
  assert.equal(state.attachments.length,16);
  assert.equal(state.upgraded.length,16);
  assert.ok(state.installations.length>=1);
  assert.ok(state.installations.length<16);

  for(const employee of state.employees.employees){
    const loop=state.loops.loops.find(x=>x.employee_id===employee.id);
    const upgraded=state.upgraded.find(x=>x.id===employee.id);
    assert.ok(upgraded.skills.includes(loop.recommended_upgrade_skill),employee.id+" missing upgrade skill");
    assert.equal(upgraded.skills.length,employee.skills.length+1,employee.id+" should gain exactly one skill");
    assert.deepEqual(authority(upgraded),authority(employee),employee.id+" authority changed through skill attachment");
  }
  for(const attachment of state.attachments){
    assert.equal(attachment.authority_effect,"NONE");
    assert.match(attachment.authority_snapshot_sha256,/^[a-f0-9]{64}$/);
  }
});

test("configured attachment version/provenance is exact and catalog-backed",async()=>{
  const state=await materializeConfiguredUpgrades({root});
  for(const attachment of state.attachments){
    const installation=state.installations.find(x=>x.install_ref===attachment.install_ref);
    assert.ok(installation,attachment.employee_id+" missing installation");
    assert.equal(validateSkillInstallation(installation,{catalog:state.catalog}),true);
    assert.equal(attachment.version,installation.version);
  }
});

test("employee-addition rule requires a concrete documented capability gap",async()=>{
  const policy=await readJson("config/skills-store-policy.json");
  assert.throws(()=>validateEmployeeAdditionGap("",{policy}),/documented capability gap/);
  assert.throws(()=>validateEmployeeAdditionGap("more capacity for the team",{policy}),/generic headcount demand/);
  const gap=validateEmployeeAdditionGap(
    "Existing employees can run current research skills, but none owns regulated procurement analysis and evidence-specific review.",
    {policy},
  );
  assert.match(gap,/regulated procurement analysis/);
});
