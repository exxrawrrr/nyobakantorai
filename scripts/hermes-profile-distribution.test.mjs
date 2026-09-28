import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ids = ["praroro","paijo","subagjo","alex","sumiati","siti"];
const forbidden = [".env","auth.json","config.yaml","state.db","sessions","memories","logs"];

test("six native Hermes profile distributions are complete and credential-free", async () => {
  for (const id of ids) {
    const dir = resolve(root,"hermes-profiles",id);
    const manifest = await readFile(resolve(dir,"distribution.yaml"),"utf8");
    const soul = await readFile(resolve(dir,"SOUL.md"),"utf8");
    const profile = await readFile(resolve(dir,"profile.yaml"),"utf8");
    assert.match(manifest,new RegExp(`^name: ${id}$`,"m"));
    assert.match(manifest,/^version: 0\.2\.0$/m);
    assert.match(manifest,/license: "MIT"/);
    assert.match(profile,/description:/);
    const skillNames = [...soul.matchAll(/nyoba-[a-z0-9-]+/g)].map((m)=>m[0]);
    const unique = [...new Set(skillNames)].filter((x)=>x !== "nyobakantorai");
    const installed = await readdir(resolve(dir,"skills","nyobakantorai"));
    assert.equal(installed.length,6,`${id} should ship six role skills`);
    for (const skill of installed) {
      assert.ok(unique.includes(skill), `${id} SOUL should name ${skill}`);
      const bundled = await readFile(resolve(dir,"skills","nyobakantorai",skill,"SKILL.md"),"utf8");
      const canonical = await readFile(resolve(root,"skills","hermes-custom",skill,"SKILL.md"),"utf8");
      assert.equal(bundled,canonical,`${id}/${skill} must match canonical skill exactly`);
    }
    const rootEntries = await readdir(dir);
    for (const name of forbidden) assert.equal(rootEntries.includes(name),false,`${id} must not distribute ${name}`);
  }
});