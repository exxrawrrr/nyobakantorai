import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { EMPLOYEES } from "../registry.mjs";
import { WORKFORCE } from "../workforce.mjs";
import { EMPLOYEE_PLAYBOOK, PERSONA_SNAPSHOT } from "../src/persona-ops.mjs";

test("all public employees have complete registry-driven operating styles", async () => {
  assert.ok(EMPLOYEES.length >= 16);
  assert.deepEqual(EMPLOYEES.map(({id})=>id),WORKFORCE.map(({id})=>id));
  assert.deepEqual(Object.keys(EMPLOYEE_PLAYBOOK),WORKFORCE.map(({id})=>id));
  for (const employee of WORKFORCE) {
    const p=EMPLOYEE_PLAYBOOK[employee.id];
    for (const field of ["voice","thinking","workflow","toolState"]) assert.ok(typeof p[field]==="string"&&p[field].length>20,employee.id+":"+field);
    assert.deepEqual(p.skillNames,employee.skills,employee.id);
    for(const skill of p.skillNames){const path=new URL(`../../skills/hermes-custom/${skill}/SKILL.md`,import.meta.url);await access(path);const doc=await readFile(path,"utf8");assert.match(doc,new RegExp(`name: ${skill}`));}
  }
  assert.match(PERSONA_SNAPSHOT,/canonical workforce/);
});

test("frontend exposes operating style without claiming live tools",async()=>{
  const app=await readFile(new URL("../src/app.mjs",import.meta.url),"utf8");
  for(const field of ["voice","thinking","workflow","skillNames","toolState"])assert.match(app,new RegExp("playbook\\."+field));
  assert.match(app,/Skills are instructions/);
  assert.match(app,/PENDING ORIGINAL ART/);
});
