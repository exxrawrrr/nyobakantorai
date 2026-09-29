import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { runOneWorkerFreshInstallMatrix, runSubsetFreshInstallMatrix } from "./index.mjs";

test("fresh install from an empty Hermes home installs exactly one selected worker",async()=>{
  const result=await runOneWorkerFreshInstallMatrix({employeeId:"siti"});
  assert.equal(result.passed,true);
  assert.equal(result.claim_state,"DETERMINISTICALLY_VERIFIED");
  assert.equal(result.employee_id,"siti");
  assert.equal(result.initial_profile_count,0);
  assert.deepEqual(result.installed_profiles,["siti"]);
  assert.deepEqual(result.rerun_profiles,["siti"]);
  assert.equal(result.first_action,"install");
  assert.equal(result.rerun_action,"native-upgrade");
  assert.equal(result.pack_verified,true);
  assert.equal(result.user_owned_state_preserved,true);
  assert.equal(result.distribution_contains_user_owned_state,false);
  assert.equal(result.unrelated_profiles_installed,false);
  assert.equal(result.external_provider_calls,0);
  assert.equal(result.hermes_cli_executed,false);
  assert.equal(result.real_machine_claim,false);
});

test("one-worker rerun preserves all named user-owned state fixtures byte-for-byte",async()=>{
  const result=await runOneWorkerFreshInstallMatrix({employeeId:"siti"});
  for(const expected of [
    ".env","auth.json","memories/owner-note.md","sessions/session-001.json",
    "state.db","logs/owner.log","workspace/owner.txt","plans/owner.md",
    "home/owner.txt","local/owner.txt"
  ]){
    assert.ok(result.user_owned_state_files.includes(expected),expected);
  }
  assert.equal(result.user_owned_state_preserved,true);
});

test("matrix works in an explicit disposable root and leaves evidence inspectable until caller cleanup",async()=>{
  const base=await mkdtemp(resolve(tmpdir(),"nyoba-one-worker-explicit-"));
  try{
    const result=await runOneWorkerFreshInstallMatrix({employeeId:"siti",baseDir:base});
    assert.equal(result.passed,true);
    const profiles=await readdir(resolve(base,"hermes-home","profiles"));
    assert.deepEqual(profiles,["siti"]);
    const manifest=await readFile(resolve(base,"packs","siti","employee-pack.json"),"utf8");
    assert.match(manifest,/"employee_id": "siti"/);
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});


test("engineering subset fresh install selects exactly Subagjo, Siti, and Bimo then removes only Bimo",async()=>{
  const result=await runSubsetFreshInstallMatrix();
  assert.equal(result.passed,true);
  assert.equal(result.claim_state,"DETERMINISTICALLY_VERIFIED");
  assert.equal(result.selection,"engineering");
  assert.deepEqual(result.selected_profiles,["subagjo","siti","bimo"]);
  assert.deepEqual(result.installed_profiles,["bimo","siti","subagjo"]);
  assert.equal(result.only_selected_profiles_installed,true);
  assert.ok(result.install_actions.every(x=>x.action==="install"));
  assert.equal(result.capability_isolation_passed,true);
  assert.equal(result.removal.requested_profile,"bimo");
  assert.equal(result.removal.preview_action,"PREVIEW_ONLY");
  assert.equal(result.removal.confirmed_action,"DELETE_PROFILE_AND_USER_STATE");
  assert.equal(result.removal.removed_profile_absent,true);
  assert.equal(result.removal.selected_removed_only,true);
  assert.deepEqual(result.removal.remaining_profiles,["siti","subagjo"]);
  assert.equal(result.survivor_profiles_preserved,true);
  assert.ok(result.survivor_byte_integrity.every(x=>x.unchanged));
  assert.equal(result.external_provider_calls,0);
  assert.equal(result.hermes_cli_executed,false);
  assert.equal(result.real_machine_claim,false);
});

test("subset capability isolation preserves worker-specific skill closures without union leakage",async()=>{
  const result=await runSubsetFreshInstallMatrix();
  const byId=new Map(result.capability_isolation.map(x=>[x.employee_id,x]));
  for(const id of ["subagjo","siti","bimo"]){
    const item=byId.get(id);
    assert.ok(item,id);
    assert.equal(item.skills_exact,true,id);
    assert.equal(item.manifest_skills_exact,true,id);
    assert.equal(item.optional_integrations_exact,true,id);
  }
  assert.ok(byId.get("subagjo").installed_skills.includes("nyoba-github-readonly"));
  assert.equal(byId.get("bimo").installed_skills.includes("nyoba-github-readonly"),false);
  assert.ok(byId.get("bimo").installed_skills.includes("nyoba-automation-queue"));
  assert.equal(byId.get("siti").installed_skills.includes("nyoba-automation-queue"),false);
  assert.ok(byId.get("siti").installed_skills.includes("nyoba-independent-qa"));
  assert.equal(byId.get("subagjo").installed_skills.includes("nyoba-independent-qa"),false);
});

test("custom two-worker subset removal preserves the non-removed profile byte-for-byte",async()=>{
  const result=await runSubsetFreshInstallMatrix({
    selection:"subagjo,siti",
    removeEmployeeId:"siti"
  });
  assert.equal(result.passed,true);
  assert.deepEqual(result.selected_profiles,["subagjo","siti"]);
  assert.deepEqual(result.installed_profiles,["siti","subagjo"]);
  assert.deepEqual(result.removal.remaining_profiles,["subagjo"]);
  assert.deepEqual(result.survivor_profiles,["subagjo"]);
  assert.deepEqual(result.survivor_byte_integrity,[{employee_id:"subagjo",unchanged:true}]);
});

test("subset matrix leaves an explicit disposable root inspectable until caller cleanup",async()=>{
  const base=await mkdtemp(resolve(tmpdir(),"nyoba-subset-explicit-"));
  try{
    const result=await runSubsetFreshInstallMatrix({baseDir:base});
    assert.equal(result.passed,true);
    const profiles=(await readdir(resolve(base,"hermes-home","profiles"))).sort();
    assert.deepEqual(profiles,["siti","subagjo"]);
    const bimoPack=await readFile(resolve(base,"packs","bimo","employee-pack.json"),"utf8");
    assert.match(bimoPack,/"employee_id": "bimo"/);
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});
