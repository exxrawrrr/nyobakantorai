import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"..");
const readJson=async(rel)=>JSON.parse(await readFile(resolve(root,rel),"utf8"));

test("upstream-derived skills and integrations have explicit provenance",async()=>{
  const [sources,integrations,employees,capabilities,skillProvenance]=await Promise.all([
    readJson("config/upstream-sources.json"),
    readJson("config/integrations.json"),
    readJson("config/employees.json"),
    readJson("config/capabilities.json"),
    readJson("config/skill-provenance.json"),
  ]);
  const sourceIds=new Set(sources.sources.map(s=>s.id));
  assert.equal(sourceIds.size,sources.sources.length);
  for(const source of sources.sources){
    assert.ok(source.repo.startsWith("https://github.com/"));
    assert.ok(source.commit); assert.ok(source.license); assert.ok(source.usage_mode);
    if(source.usage_mode==="excluded-from-copy-or-derivation") assert.match(source.license,/restricted/i);
  }
  const integrationIds=new Set(integrations.integrations.map(i=>i.id));
  const capabilityIds=new Set(capabilities.capabilities.map(c=>c.id));
  assert.equal(integrationIds.size,integrations.integrations.length);
  for(const item of integrations.integrations){
    assert.ok(sourceIds.has(item.source_id),item.id);
    assert.match(item.default_state,/NOT_INSTALLED|REFERENCE_ONLY/);
    if(item.capability) assert.ok(capabilityIds.has(item.capability),item.id+" references unknown capability "+item.capability);
  }
  const skillDirs=(await readdir(resolve(root,"skills/canonical"),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name);
  const declaredDerived=new Set();
  for(const name of skillDirs){
    const text=await readFile(resolve(root,"skills/canonical",name,"SKILL.md"),"utf8");
    const modeMatch=text.match(/^\s*nyoba-provenance-mode:\s*["']?([^"'\n]+)["']?\s*$/m);
    const idsMatch=text.match(/^\s*nyoba-source-ids:\s*["']([^"']+)["']\s*$/m);
    if(modeMatch||idsMatch) declaredDerived.add(name);
    const expected=skillProvenance.skills[name];
    if(!expected){
      assert.equal(modeMatch,null,name+" declares provenance but is missing from config/skill-provenance.json");
      assert.equal(idsMatch,null,name+" declares source IDs but is missing from config/skill-provenance.json");
      continue;
    }
    assert.ok(modeMatch,name+" missing nyoba-provenance-mode");
    assert.equal(modeMatch[1].trim(),expected.mode,name+" provenance mode drift");
    assert.ok(idsMatch,name+" missing nyoba-source-ids");
    const ids=idsMatch[1].split(",").map(x=>x.trim()).filter(Boolean);
    assert.deepEqual(ids,expected.source_ids,name+" source provenance drift");
    for(const id of ids){
      assert.ok(sourceIds.has(id),name+" references unknown source "+id);
      const source=sources.sources.find(s=>s.id===id);
      assert.notEqual(source.usage_mode,"excluded-from-copy-or-derivation",name+" may not derive from excluded "+id);
    }
  }
  const expectedDerived=Object.keys(skillProvenance.skills).sort();
  assert.deepEqual([...declaredDerived].sort(),expectedDerived,"recreated-skill provenance catalog and frontmatter must match exactly");
  for(const e of employees.employees){
    assert.ok(e.skills.includes("nyoba-reflective-memory-learning"),e.id+" missing reflective memory");
    assert.equal(e.learning_profile.memory_mode,"PROFILE_SCOPED_HERMES_FIRST");
    assert.ok(e.reasoning_profile.mental_models.length>=3);
    for(const id of e.optional_integrations||[]) assert.ok(integrationIds.has(id),e.id+" unknown integration "+id);
  }
  const fikri=employees.employees.find(e=>e.id==="fikri");
  assert.match(fikri.role,/Markdown/);
  assert.match(fikri.role,/Context|Prompt/);
  assert.ok(fikri.skills.includes("nyoba-context-prompt-compiler"));
  assert.ok(fikri.external_capabilities.includes("documents.markdown.convert"));
  assert.ok(capabilities.capabilities.some(c=>c.id==="documents.markdown.convert"&&c.risk_class==="READ_ONLY"&&c.default_state==="NOT_CONNECTED"));
});
