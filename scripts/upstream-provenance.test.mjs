import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"..");
const readJson=async(rel)=>JSON.parse(await readFile(resolve(root,rel),"utf8"));

test("upstream-derived skills and integrations have explicit provenance",async()=>{
  const [sources,integrations,employees,capabilities]=await Promise.all([
    readJson("config/upstream-sources.json"),
    readJson("config/integrations.json"),
    readJson("config/employees.json"),
    readJson("config/capabilities.json"),
  ]);
  const sourceIds=new Set(sources.sources.map(s=>s.id));
  assert.equal(sourceIds.size,sources.sources.length);
  for(const source of sources.sources){
    assert.ok(source.repo.startsWith("https://github.com/"));
    assert.ok(source.commit); assert.ok(source.license); assert.ok(source.usage_mode);
    if(source.usage_mode==="excluded-from-copy-or-derivation") assert.match(source.license,/restricted/i);
  }
  const integrationIds=new Set(integrations.integrations.map(i=>i.id));
  assert.equal(integrationIds.size,integrations.integrations.length);
  for(const item of integrations.integrations){
    assert.ok(sourceIds.has(item.source_id),item.id);
    assert.match(item.default_state,/NOT_INSTALLED|REFERENCE_ONLY/);
  }
  const skillDirs=(await readdir(resolve(root,"skills/hermes-custom"),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name);
  for(const name of skillDirs){
    const text=await readFile(resolve(root,"skills/hermes-custom",name,"SKILL.md"),"utf8");
    if(!/provenance_mode:\s*recreated/.test(text)) continue;
    const match=text.match(/source_ids:\s*\[([^\]]+)\]/);
    assert.ok(match,name+" missing source_ids");
    const ids=match[1].split(",").map(x=>x.trim()).filter(Boolean);
    assert.ok(ids.length,name+" has empty source_ids");
    for(const id of ids){
      assert.ok(sourceIds.has(id),name+" references unknown source "+id);
      const source=sources.sources.find(s=>s.id===id);
      assert.notEqual(source.usage_mode,"excluded-from-copy-or-derivation",name+" may not derive from excluded "+id);
    }
  }
  for(const e of employees.employees){
    assert.ok(e.skills.includes("nyoba-reflective-memory-learning"),e.id+" missing reflective memory");
    assert.equal(e.learning_profile.memory_mode,"PROFILE_SCOPED_HERMES_FIRST");
    assert.ok(e.reasoning_profile.mental_models.length>=3);
    for(const id of e.optional_integrations||[]) assert.ok(integrationIds.has(id),e.id+" unknown integration "+id);
  }
  const fikri=employees.employees.find(e=>e.id==="fikri");
  assert.match(fikri.role,/Markdown/);
  assert.ok(fikri.external_capabilities.includes("documents.markdown.convert"));
  assert.ok(capabilities.capabilities.some(c=>c.id==="documents.markdown.convert"&&c.risk_class==="READ_ONLY"&&c.default_state==="NOT_CONNECTED"));
});
