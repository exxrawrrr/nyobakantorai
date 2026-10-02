import test from "node:test";
import assert from "node:assert/strict";
import { auditSkillsStore } from "./skills-store.mjs";

test("Skills Store audit CLI model reports 16 authority-free upgrades",async()=>{
  const result=await auditSkillsStore();
  assert.equal(result.ok,true);
  assert.equal(result.workforce_count,16);
  assert.equal(result.attachment_count,16);
  assert.equal(result.rows.length,16);
  assert.ok(result.catalog_size>=35);
  assert.ok(result.rows.every(row=>row.effective_skill_count===row.baseline_skill_count+1));
  assert.ok(result.rows.every(row=>row.authority_effect==="NONE"));
  assert.match(result.catalog_ref,/^skill-catalog:sha256:[a-f0-9]{64}$/);
});
