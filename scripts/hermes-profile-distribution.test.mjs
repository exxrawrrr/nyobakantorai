import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { WORKFORCE } from "../office/workforce.mjs";

const root = resolve(import.meta.dirname, "..");
const forbidden = [".env","auth.json","state.db","sessions","memories","logs"];

test("all registry employees have native Hermes distributions with canonical skill copies", async () => {
  assert.equal(WORKFORCE.length,16);
  for (const employee of WORKFORCE) {
    const dir = resolve(root,"hermes-profiles",employee.id);
    const manifest = await readFile(resolve(dir,"distribution.yaml"),"utf8");
    const soul = await readFile(resolve(dir,"SOUL.md"),"utf8");
    const profile = await readFile(resolve(dir,"profile.yaml"),"utf8");
    assert.match(manifest,new RegExp(`^name: ${employee.id}$`,"m"));
    assert.match(manifest,new RegExp(`^version: ${employee.profile.distribution_version.replaceAll(".","\\.")}$`,"m"));
    assert.match(manifest,/license: "MIT"/);
    assert.match(profile,/description:/);
    const installed = (await readdir(resolve(dir,"skills","nyobakantorai"))).sort();
    assert.deepEqual(installed,[...employee.skills].sort(),`${employee.id} packaged skill set must match registry`);
    for (const skill of installed) {
      assert.match(soul,new RegExp(skill.replaceAll("-","\\-")));
      const bundled = await readFile(resolve(dir,"skills","nyobakantorai",skill,"SKILL.md"),"utf8");
      const canonical = await readFile(resolve(root,"skills","hermes-custom",skill,"SKILL.md"),"utf8");
      assert.equal(bundled,canonical,`${employee.id}/${skill} must match canonical skill exactly`);
    }
    const rootEntries = await readdir(dir);
    for (const name of forbidden) assert.equal(rootEntries.includes(name),false,`${employee.id} must not distribute ${name}`);
  }
});
