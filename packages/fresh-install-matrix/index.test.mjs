import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { runFullWorkforceFreshInstallMatrix, runOneWorkerFreshInstallMatrix, runSubsetFreshInstallMatrix, runUpgradeUninstallLifecycleMatrix } from "./index.mjs";

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


test("full workforce fresh install covers the entire canonical registry exactly",async()=>{
  const result=await runFullWorkforceFreshInstallMatrix();
  assert.equal(result.passed,true);
  assert.equal(result.claim_state,"DETERMINISTICALLY_VERIFIED");
  assert.equal(result.registry_employee_count,16);
  assert.equal(result.selected_employee_count,16);
  assert.equal(result.initial_profile_count,0);
  assert.equal(result.installed_profiles.length,16);
  assert.equal(result.installed_all_profiles_exactly,true);
  assert.equal(result.pack_directories.length,16);
  assert.equal(result.pack_set_exact,true);
  assert.ok(result.install_actions.every(x=>x.action==="install"));
  assert.equal(result.capability_isolation_passed,true);
  assert.equal(result.all_packs_verified,true);
  assert.equal(result.rerun_profiles_exact,true);
  assert.ok(result.rerun_actions.every(x=>x.action==="native-upgrade"));
  assert.equal(result.all_user_owned_state_preserved,true);
  assert.equal(result.all_profiles_non_empty,true);
  assert.equal(result.external_provider_calls,0);
  assert.equal(result.hermes_cli_executed,false);
  assert.equal(result.real_machine_claim,false);
});

test("full workforce matrix verifies every worker's exact skill and integration closure",async()=>{
  const result=await runFullWorkforceFreshInstallMatrix();
  const expectedIds=[
    "praroro","paijo","subagjo","alex","sumiati","siti","maya","gugun",
    "ratri","bimo","nara","dina","bambang","fikri","tari","caca"
  ].sort();
  assert.deepEqual([...result.expected_profiles],expectedIds);
  assert.deepEqual([...result.installed_profiles],expectedIds);
  assert.equal(result.capability_isolation.length,16);
  for(const item of result.capability_isolation){
    assert.equal(item.skills_exact,true,item.employee_id);
    assert.equal(item.manifest_skills_exact,true,item.employee_id);
    assert.equal(item.optional_integrations_exact,true,item.employee_id);
    assert.equal(item.distribution_contains_user_owned_state,false,item.employee_id);
  }
  assert.equal(result.user_owned_state_preservation.length,16);
  assert.ok(result.user_owned_state_preservation.every(x=>x.preserved));
  assert.equal(result.rerun_distribution_checks.length,16);
  assert.ok(result.rerun_distribution_checks.every(x=>x.pack_verified&&x.distribution_owned_stable));
});

test("full workforce matrix leaves an explicit disposable root inspectable until caller cleanup",async()=>{
  const base=await mkdtemp(resolve(tmpdir(),"nyoba-full-explicit-"));
  try{
    const result=await runFullWorkforceFreshInstallMatrix({baseDir:base});
    assert.equal(result.passed,true);
    const profiles=(await readdir(resolve(base,"hermes-home","profiles"))).sort();
    assert.deepEqual(profiles,[...result.expected_profiles]);
    const packs=(await readdir(resolve(base,"packs"))).sort();
    assert.deepEqual(packs,[...result.expected_profiles]);
    const manifest=await readFile(resolve(base,"packs","praroro","employee-pack.json"),"utf8");
    assert.match(manifest,/"employee_id": "praroro"/);
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});


const lifecycleDefaultRun=runUpgradeUninstallLifecycleMatrix();

test("full lifecycle matrix upgrades all workers, removes safely, fully uninstalls, and reinstalls cleanly",async()=>{
  const result=await lifecycleDefaultRun;
  assert.equal(result.passed,true);
  assert.equal(result.claim_state,"DETERMINISTICALLY_VERIFIED");
  assert.equal(result.registry_employee_count,16);
  assert.equal(result.initial_profiles.length,16);
  assert.ok(result.upgrade_actions.every(x=>x.action==="native-upgrade"));
  assert.equal(result.upgrade_passed,true);
  assert.equal(result.selective_removal.employee_id,"bimo");
  assert.equal(result.selective_removal.preview_action,"PREVIEW_ONLY");
  assert.equal(result.selective_removal.preview_non_destructive,true);
  assert.equal(result.selective_removal.confirmed_action,"DELETE_PROFILE_AND_USER_STATE");
  assert.equal(result.selective_removal.passed,true);
  assert.equal(result.full_uninstall.preview_action,"PREVIEW_ONLY");
  assert.equal(result.full_uninstall.preview_non_destructive,true);
  assert.equal(result.full_uninstall.confirmed_action,"DELETE_PROFILE_AND_USER_STATE");
  assert.deepEqual(result.full_uninstall.remaining_profiles,[]);
  assert.equal(result.full_uninstall.passed,true);
  assert.equal(result.reinstall.profiles.length,16);
  assert.equal(result.reinstall.passed,true);
  assert.equal(result.final_rerun_actions_exact,true);
  assert.equal(result.final_profiles_exact,true);
  assert.equal(result.pack_artifacts_unchanged,true);
  assert.equal(result.external_provider_calls,0);
  assert.equal(result.hermes_cli_executed,false);
  assert.equal(result.real_machine_claim,false);
});

test("lifecycle upgrade replaces drifted distribution while preserving seeded user state for all workers",async()=>{
  const result=await lifecycleDefaultRun;
  assert.equal(result.upgrade_checks.length,16);
  for(const item of result.upgrade_checks){
    assert.equal(item.action,"native-upgrade",item.employee_id);
    assert.equal(item.distribution_exact,true,item.employee_id);
    assert.equal(item.user_owned_state_preserved,true,item.employee_id);
    assert.equal(item.stale_distribution_replaced,true,item.employee_id);
    assert.ok(item.ownership_checks.every(x=>x.match),item.employee_id);
  }
});

test("selective lifecycle removal preserves every survivor byte-for-byte",async()=>{
  const result=await runUpgradeUninstallLifecycleMatrix({removeEmployeeId:"siti"});
  assert.equal(result.passed,true);
  assert.equal(result.selective_removal.employee_id,"siti");
  assert.equal(result.selective_removal.remaining_profiles.includes("siti"),false);
  assert.equal(result.selective_removal.survivor_integrity.length,15);
  assert.ok(result.selective_removal.survivor_integrity.every(x=>x.unchanged));
});

test("reinstall after destructive full uninstall does not resurrect previous user-owned state",async()=>{
  const result=await lifecycleDefaultRun;
  assert.equal(result.reinstall.checks.length,16);
  for(const item of result.reinstall.checks){
    assert.equal(item.distribution_exact,true,item.employee_id);
    assert.equal(item.stale_user_state_resurrected,false,item.employee_id);
    assert.deepEqual(item.resurrected_paths,[],item.employee_id);
  }
});
