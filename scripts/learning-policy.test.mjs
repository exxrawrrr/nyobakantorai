import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WORKFORCE } from "../lib/workforce.mjs";

const mandatorySkills=["nyoba-memory-stewardship","nyoba-learning-loop"];
const mandatoryToolsets=["memory","session_search"];

test("every worker has profile memory and governed learning",()=>{
  assert.ok(WORKFORCE.length>=16);
  for(const employee of WORKFORCE){
    for(const skill of mandatorySkills) assert.ok(employee.skills.includes(skill), `${employee.id} missing ${skill}`);
    for(const toolset of mandatoryToolsets) assert.ok(employee.preferred_toolsets.includes(toolset), `${employee.id} missing ${toolset}`);
    assert.equal(employee.learning_policy.profile_memory_required,true);
    assert.equal(employee.learning_policy.session_search_required,true);
    assert.equal(employee.learning_policy.canonical_skill_updates,"PROPOSE_PR_FOR_REVIEW");
    assert.equal(employee.learning_policy.cross_profile_memory,"EXPLICIT_HANDOFF_ONLY");
    assert.equal(employee.verification_policy.self_verify,false);
  }
});

test("adapted public skills have explicit source and license provenance",async()=>{
  const sources=JSON.parse(await readFile(new URL("../config/skill-sources.json",import.meta.url),"utf8"));
  const sourceIds=new Set(sources.sources.map((source)=>source.id));
  for(const source of sources.sources){
    assert.ok(source.repo);
    assert.ok(source.license);
  }
  for(const [skill,refs] of Object.entries(sources.skills)){
    assert.ok(refs.length>0,skill);
    for(const ref of refs)assert.ok(sourceIds.has(ref),`${skill} unknown source ${ref}`);
    const content=await readFile(new URL(`../skills/hermes-custom/${skill}/SKILL.md`,import.meta.url),"utf8");
    assert.match(content,/Sources and adaptation/);
  }
});
