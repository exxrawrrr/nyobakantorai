import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { EMPLOYEES } from "../registry.mjs";
import { EMPLOYEE_PLAYBOOK, PERSONA_SNAPSHOT } from "../src/persona-ops.mjs";

const expected = ["praroro","paijo","subagjo","alex","sumiati","siti"];
const common = ["nyoba-task-truth","nyoba-manual-chatgpt-handoff","nyoba-approval-and-evidence","nyoba-safe-tool-use"];

test("six public personas have complete operating styles and exactly six skills", async () => {
  assert.deepEqual(EMPLOYEES.map(({id})=>id), expected);
  assert.deepEqual(Object.keys(EMPLOYEE_PLAYBOOK), expected);
  for (const id of expected) {
    const p = EMPLOYEE_PLAYBOOK[id];
    for (const field of ["voice","thinking","workflow","toolState"]) assert.ok(typeof p[field] === "string" && p[field].length > 40, id + ":" + field);
    assert.equal(p.skillNames.length, 6, id);
    assert.deepEqual(p.skillNames.slice(0,4), common, id);
    for (const skill of p.skillNames) {
      const path = new URL(`../../skills/hermes-custom/${skill}/SKILL.md`, import.meta.url);
      await access(path);
      const doc = await readFile(path,"utf8");
      assert.match(doc,new RegExp(`name: ${skill}`));
    }
  }
  assert.match(PERSONA_SNAPSHOT, /Public example profiles/);
});

test("frontend exposes operating style without claiming live tools", async () => {
  const app = await readFile(new URL("../src/app.mjs", import.meta.url),"utf8");
  for (const field of ["voice","thinking","workflow","skillNames","toolState"]) assert.match(app,new RegExp("EMPLOYEE_PLAYBOOK\\[id\\]\\."+field));
  assert.match(app,/Skills are instructions/);
});
