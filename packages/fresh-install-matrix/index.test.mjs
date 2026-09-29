import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { runOneWorkerFreshInstallMatrix } from "./index.mjs";

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
