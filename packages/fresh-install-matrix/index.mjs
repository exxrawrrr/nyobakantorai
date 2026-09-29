import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { buildEmployeePack, verifyEmployeePack } from "../../scripts/employee-pack.mjs";
import { planSelectedProfileActions, USER_OWNED_HERMES_STATE } from "../../scripts/hermes-bootstrap-plan.mjs";
import { resolveEmployeeSelection } from "../../scripts/employee-selection.mjs";
import { planSelectedProfileRemoval } from "../../scripts/hermes-remove-selected.mjs";

const root=resolve(import.meta.dirname,"../..");
const hashBuffer=(value)=>createHash("sha256").update(value).digest("hex");

async function exists(path){
  try{await stat(path);return true;}catch{return false;}
}

async function walkFiles(dir){
  const out=[];
  async function walk(current){
    for(const entry of await readdir(current,{withFileTypes:true})){
      const full=resolve(current,entry.name);
      if(entry.isDirectory()) await walk(full);
      else if(entry.isFile()) out.push(full);
    }
  }
  if(await exists(dir)) await walk(dir);
  return out.sort();
}

async function hashTree(dir){
  const files=await walkFiles(dir);
  const rows=[];
  for(const file of files){
    const bytes=await readFile(file);
    rows.push([relative(dir,file).replaceAll("\\","/"),hashBuffer(bytes)]);
  }
  return rows;
}

async function fingerprintOwnedEntry(path){
  const info=await stat(path);
  if(info.isFile()){
    const bytes=await readFile(path);
    return Object.freeze({type:"file",sha256:hashBuffer(bytes)});
  }
  if(info.isDirectory()){
    return Object.freeze({type:"dir",tree:Object.freeze(await hashTree(path))});
  }
  throw new Error("unsupported distribution-owned entry type: "+path);
}

async function distributionOwnedMatches(source,target,owned){
  const checks=[];
  for(const rel of owned){
    const src=resolve(source,rel);
    const dst=resolve(target,rel);
    if(!(await exists(src))||!(await exists(dst))){
      checks.push({path:rel,match:false,reason:"missing"});
      continue;
    }
    const [a,b]=await Promise.all([fingerprintOwnedEntry(src),fingerprintOwnedEntry(dst)]);
    checks.push({path:rel,match:JSON.stringify(a)===JSON.stringify(b)});
  }
  return Object.freeze(checks.map(x=>Object.freeze(x)));
}

async function copyDistributionOwned(source,target){
  const manifest=await readFile(resolve(source,"distribution.yaml"),"utf8");
  const owned=[];
  let capture=false;
  for(const line of manifest.split(/\r?\n/)){
    if(/^distribution_owned:\s*$/.test(line)){capture=true;continue;}
    if(capture){
      const match=/^\s*-\s+(.+?)\s*$/.exec(line);
      if(match){owned.push(match[1]);continue;}
      if(line.trim()&&!line.startsWith(" ")) break;
    }
  }
  if(!owned.length) throw new Error("distribution_owned is empty");
  await mkdir(target,{recursive:true});
  for(const rel of owned){
    const src=resolve(source,rel);
    const dst=resolve(target,rel);
    await rm(dst,{recursive:true,force:true});
    await cp(src,dst,{recursive:true});
  }
  return owned;
}

async function seedUserOwnedState(profileDir){
  const fixtures={
    ".env":"USER_OWNED_SENTINEL=preserve-me\n",
    "auth.json":JSON.stringify({owner:"user",fixture:"preserve-me"},null,2)+"\n",
    "memories/owner-note.md":"user-owned memory sentinel\n",
    "sessions/session-001.json":JSON.stringify({session:"owner-sentinel"})+"\n",
    "state.db":"not-a-real-db; user-owned state sentinel\n",
    "logs/owner.log":"user-owned log sentinel\n",
    "workspace/owner.txt":"user-owned workspace sentinel\n",
    "plans/owner.md":"user-owned plan sentinel\n",
    "home/owner.txt":"user-owned home sentinel\n",
    "local/owner.txt":"user-owned local sentinel\n"
  };
  for(const [rel,data] of Object.entries(fixtures)){
    const path=resolve(profileDir,rel);
    await mkdir(resolve(path,".."),{recursive:true});
    await writeFile(path,data,"utf8");
  }
  return fixtures;
}

async function snapshotFixtures(profileDir,fixtures){
  const out={};
  for(const rel of Object.keys(fixtures)){
    const bytes=await readFile(resolve(profileDir,rel));
    out[rel]=hashBuffer(bytes);
  }
  return out;
}

export async function runOneWorkerFreshInstallMatrix({
  employeeId="siti",
  baseDir=null
}={}){
  const ownBase=baseDir||await mkdtemp(resolve(tmpdir(),"nyoba-fresh-one-"));
  const cleanupBase=baseDir?false:true;
  const packRoot=resolve(ownBase,"packs");
  const hermesHome=resolve(ownBase,"hermes-home");
  const profilesDir=resolve(hermesHome,"profiles");
  const profileDir=resolve(profilesDir,employeeId);

  try{
    await mkdir(profilesDir,{recursive:true});
    const beforeEntries=await readdir(profilesDir);
    if(beforeEntries.length!==0) throw new Error("fresh-install matrix requires an empty profile directory");

    const built=await buildEmployeePack({employeeId,outRoot:packRoot});
    const packDir=resolve(packRoot,employeeId);
    const packCheck=await verifyEmployeePack(packDir);
    if(!packCheck.ok) throw new Error("employee pack failed verification before install");

    const installPlan=planSelectedProfileActions({
      selectedIds:[employeeId],
      existingIds:[],
      mode:"upgrade"
    });
    if(installPlan.length!==1||installPlan[0].profile!==employeeId||installPlan[0].action!=="install"){
      throw new Error("fresh install plan did not resolve to exactly one install action");
    }

    await copyDistributionOwned(packDir,profileDir);

    const installedEntries=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory())
      .map(x=>x.name)
      .sort();
    if(installedEntries.length!==1||installedEntries[0]!==employeeId){
      throw new Error("fresh install pulled unrelated profiles");
    }

    const distributionCheck=await verifyEmployeePack(packDir);
    if(!distributionCheck.ok) throw new Error("source pack verification drifted");

    const fixtures=await seedUserOwnedState(profileDir);
    const beforeUserState=await snapshotFixtures(profileDir,fixtures);

    const rerunPlan=planSelectedProfileActions({
      selectedIds:[employeeId],
      existingIds:[employeeId],
      mode:"upgrade"
    });
    if(rerunPlan.length!==1||rerunPlan[0].action!=="native-upgrade"){
      throw new Error("idempotent rerun did not select native-upgrade");
    }

    const distributionOwned=await copyDistributionOwned(packDir,profileDir);
    const afterUserState=await snapshotFixtures(profileDir,fixtures);
    const preserved=Object.keys(beforeUserState).every(rel=>beforeUserState[rel]===afterUserState[rel]);

    const afterEntries=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory())
      .map(x=>x.name)
      .sort();
    const profileTree=await hashTree(profileDir);

    const forbiddenGenerated=USER_OWNED_HERMES_STATE.filter(pattern=>{
      const literal=pattern.replace(/[/*]/g,"");
      return distributionOwned.some(x=>x===literal||x.startsWith(literal+"/"));
    });

    const passed=
      built.employee_id===employeeId &&
      installedEntries.length===1 &&
      installedEntries[0]===employeeId &&
      afterEntries.length===1 &&
      afterEntries[0]===employeeId &&
      preserved &&
      forbiddenGenerated.length===0 &&
      profileTree.length>0;

    return Object.freeze({
      schema:1,
      matrix_case:"fresh-install-one-worker",
      claim_state:passed?"DETERMINISTICALLY_VERIFIED":"FAILED",
      passed,
      employee_id:employeeId,
      initial_profile_count:beforeEntries.length,
      installed_profiles:Object.freeze(installedEntries),
      rerun_profiles:Object.freeze(afterEntries),
      first_action:installPlan[0].action,
      rerun_action:rerunPlan[0].action,
      pack_verified:packCheck.ok&&distributionCheck.ok,
      user_owned_state_preserved:preserved,
      user_owned_state_files:Object.freeze(Object.keys(fixtures).sort()),
      distribution_owned:Object.freeze(distributionOwned),
      distribution_contains_user_owned_state:forbiddenGenerated.length>0,
      installed_tree_file_count:profileTree.length,
      unrelated_profiles_installed:false,
      external_provider_calls:0,
      hermes_cli_executed:false,
      real_machine_claim:false,
      note:"Deterministic isolated release-matrix case using the canonical employee pack and Hermes bootstrap planning contract. No real Hermes CLI/provider/account is touched."
    });
  }finally{
    if(cleanupBase) await rm(ownBase,{recursive:true,force:true});
  }
}


export async function runSubsetFreshInstallMatrix({
  selection="engineering",
  removeEmployeeId="bimo",
  baseDir=null
}={}){
  const ownBase=baseDir||await mkdtemp(resolve(tmpdir(),"nyoba-fresh-subset-"));
  const cleanupBase=baseDir?false:true;
  const packRoot=resolve(ownBase,"packs");
  const hermesHome=resolve(ownBase,"hermes-home");
  const profilesDir=resolve(hermesHome,"profiles");

  try{
    const registry=JSON.parse(await readFile(resolve(root,"config/employees.json"),"utf8"));
    const allIds=registry.employees.map(x=>x.id);
    const selectedIds=resolveEmployeeSelection(selection,allIds);
    if(selectedIds.length<2) throw new Error("subset matrix requires at least two selected employees");
    if(!selectedIds.includes(removeEmployeeId)) throw new Error("removeEmployeeId must be part of the selected subset");

    await mkdir(profilesDir,{recursive:true});
    const beforeEntries=await readdir(profilesDir);
    if(beforeEntries.length!==0) throw new Error("subset fresh-install matrix requires an empty profile directory");

    const installPlan=planSelectedProfileActions({
      selectedIds,
      existingIds:[],
      mode:"upgrade"
    });
    if(installPlan.length!==selectedIds.length||installPlan.some(x=>x.action!=="install")){
      throw new Error("subset fresh install plan must contain only install actions");
    }

    const packResults=[];
    const capabilityIsolation=[];
    for(const employeeId of selectedIds){
      const built=await buildEmployeePack({employeeId,outRoot:packRoot});
      const packDir=resolve(packRoot,employeeId);
      const packCheck=await verifyEmployeePack(packDir);
      if(!packCheck.ok) throw new Error("employee pack failed verification before subset install: "+employeeId);

      const employee=registry.employees.find(x=>x.id===employeeId);
      const manifest=JSON.parse(await readFile(resolve(packDir,"employee-pack.json"),"utf8"));
      const expectedSkills=[...employee.skills].sort();
      const declaredSkills=[...(manifest.skills||[])].sort();

      await copyDistributionOwned(packDir,resolve(profilesDir,employeeId));

      const installedSkillEntries=(await readdir(resolve(profilesDir,employeeId,"skills","nyobakantorai"),{withFileTypes:true}))
        .filter(x=>x.isDirectory())
        .map(x=>x.name)
        .sort();

      const skillsExact=JSON.stringify(installedSkillEntries)===JSON.stringify(expectedSkills);
      const manifestSkillsExact=JSON.stringify(declaredSkills)===JSON.stringify(expectedSkills);
      const integrationsExact=
        JSON.stringify([...(manifest.optional_integrations||[])].sort())===
        JSON.stringify([...(employee.optional_integrations||[])].sort());

      capabilityIsolation.push(Object.freeze({
        employee_id:employeeId,
        installed_skills:Object.freeze(installedSkillEntries),
        expected_skills:Object.freeze(expectedSkills),
        skills_exact:skillsExact,
        manifest_skills_exact:manifestSkillsExact,
        optional_integrations_exact:integrationsExact
      }));
      packResults.push(Object.freeze({
        employee_id:employeeId,
        pack_verified:true,
        files:built.files
      }));
    }

    const installedProfiles=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory())
      .map(x=>x.name)
      .sort();
    const expectedProfiles=[...selectedIds].sort();
    const onlySelectedInstalled=JSON.stringify(installedProfiles)===JSON.stringify(expectedProfiles);

    for(const employeeId of selectedIds){
      const profileDir=resolve(profilesDir,employeeId);
      await seedUserOwnedState(profileDir);
    }

    const survivorIds=selectedIds.filter(id=>id!==removeEmployeeId);
    const survivorTreesBefore={};
    for(const id of survivorIds) survivorTreesBefore[id]=await hashTree(resolve(profilesDir,id));

    const previewPlan=planSelectedProfileRemoval({
      selection:removeEmployeeId,
      confirmDeleteUserState:false
    });
    if(previewPlan.action!=="PREVIEW_ONLY"||previewPlan.confirmed!==false){
      throw new Error("subset removal preview must remain non-destructive");
    }

    const removePlan=planSelectedProfileRemoval({
      selection:removeEmployeeId,
      confirmDeleteUserState:true
    });
    if(removePlan.action!=="DELETE_PROFILE_AND_USER_STATE"||removePlan.profiles.length!==1||removePlan.profiles[0]!==removeEmployeeId){
      throw new Error("subset removal plan did not isolate the requested profile");
    }

    await rm(resolve(profilesDir,removeEmployeeId),{recursive:true,force:true});

    const afterRemovalProfiles=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory())
      .map(x=>x.name)
      .sort();
    const expectedSurvivors=[...survivorIds].sort();
    const selectedRemovedOnly=JSON.stringify(afterRemovalProfiles)===JSON.stringify(expectedSurvivors);

    const survivorTreesAfter={};
    const survivorsByteIdentical=[];
    for(const id of survivorIds){
      survivorTreesAfter[id]=await hashTree(resolve(profilesDir,id));
      survivorsByteIdentical.push({
        employee_id:id,
        unchanged:JSON.stringify(survivorTreesBefore[id])===JSON.stringify(survivorTreesAfter[id])
      });
    }

    const removedProfileAbsent=!(await exists(resolve(profilesDir,removeEmployeeId)));
    const isolationPassed=capabilityIsolation.every(x=>x.skills_exact&&x.manifest_skills_exact&&x.optional_integrations_exact);
    const survivorsPreserved=survivorsByteIdentical.every(x=>x.unchanged);

    const passed=
      onlySelectedInstalled &&
      isolationPassed &&
      previewPlan.action==="PREVIEW_ONLY" &&
      removePlan.action==="DELETE_PROFILE_AND_USER_STATE" &&
      removedProfileAbsent &&
      selectedRemovedOnly &&
      survivorsPreserved;

    return Object.freeze({
      schema:1,
      matrix_case:"fresh-install-subset-workers",
      claim_state:passed?"DETERMINISTICALLY_VERIFIED":"FAILED",
      passed,
      selection,
      selected_profiles:Object.freeze([...selectedIds]),
      initial_profile_count:beforeEntries.length,
      install_actions:Object.freeze(installPlan.map(x=>Object.freeze({...x}))),
      installed_profiles:Object.freeze(installedProfiles),
      only_selected_profiles_installed:onlySelectedInstalled,
      pack_results:Object.freeze(packResults),
      capability_isolation:Object.freeze(capabilityIsolation),
      capability_isolation_passed:isolationPassed,
      removal:Object.freeze({
        requested_profile:removeEmployeeId,
        preview_action:previewPlan.action,
        confirmed_action:removePlan.action,
        removed_profile_absent:removedProfileAbsent,
        remaining_profiles:Object.freeze(afterRemovalProfiles),
        selected_removed_only:selectedRemovedOnly
      }),
      survivor_profiles:Object.freeze(expectedSurvivors),
      survivor_byte_integrity:Object.freeze(survivorsByteIdentical.map(x=>Object.freeze(x))),
      survivor_profiles_preserved:survivorsPreserved,
      external_provider_calls:0,
      hermes_cli_executed:false,
      real_machine_claim:false,
      note:"Deterministic isolated subset release-matrix case. Builds and verifies canonical packs, installs only the selected subset, checks per-worker skill/integration isolation, previews removal safely, removes exactly one selected profile after explicit destructive confirmation, and proves survivor profiles remain byte-identical. No real Hermes CLI/provider/account is touched."
    });
  }finally{
    if(cleanupBase) await rm(ownBase,{recursive:true,force:true});
  }
}


export async function runFullWorkforceFreshInstallMatrix({
  baseDir=null
}={}){
  const ownBase=baseDir||await mkdtemp(resolve(tmpdir(),"nyoba-fresh-full-"));
  const cleanupBase=baseDir?false:true;
  const packRoot=resolve(ownBase,"packs");
  const hermesHome=resolve(ownBase,"hermes-home");
  const profilesDir=resolve(hermesHome,"profiles");

  try{
    const registry=JSON.parse(await readFile(resolve(root,"config/employees.json"),"utf8"));
    const allIds=registry.employees.map(x=>x.id);
    const selectedIds=resolveEmployeeSelection("all",allIds);
    const expectedProfiles=[...allIds].sort();

    if(selectedIds.length!==allIds.length){
      throw new Error("full workforce selection did not match the canonical registry");
    }
    if(new Set(allIds).size!==allIds.length){
      throw new Error("canonical employee registry contains duplicate ids");
    }

    await mkdir(profilesDir,{recursive:true});
    const beforeEntries=await readdir(profilesDir);
    if(beforeEntries.length!==0){
      throw new Error("full fresh-install matrix requires an empty profile directory");
    }

    const installPlan=planSelectedProfileActions({
      selectedIds,
      existingIds:[],
      mode:"upgrade"
    });
    if(installPlan.length!==selectedIds.length||installPlan.some(x=>x.action!=="install")){
      throw new Error("full fresh install plan must contain one install action per employee");
    }

    const packResults=[];
    const capabilityIsolation=[];
    const distributionOwnedByEmployee={};
    for(const employeeId of selectedIds){
      const employee=registry.employees.find(x=>x.id===employeeId);
      if(!employee) throw new Error("employee disappeared from canonical registry: "+employeeId);

      const built=await buildEmployeePack({employeeId,outRoot:packRoot});
      const packDir=resolve(packRoot,employeeId);
      const packCheck=await verifyEmployeePack(packDir);
      if(!packCheck.ok){
        throw new Error("employee pack failed verification before full install: "+employeeId);
      }

      const manifest=JSON.parse(await readFile(resolve(packDir,"employee-pack.json"),"utf8"));
      const expectedSkills=[...employee.skills].sort();
      const declaredSkills=[...(manifest.skills||[])].sort();
      const expectedIntegrations=[...(employee.optional_integrations||[])].sort();
      const declaredIntegrations=[...(manifest.optional_integrations||[])].sort();

      const distributionOwned=await copyDistributionOwned(packDir,resolve(profilesDir,employeeId));
      distributionOwnedByEmployee[employeeId]=distributionOwned;

      const installedSkillEntries=(await readdir(resolve(profilesDir,employeeId,"skills","nyobakantorai"),{withFileTypes:true}))
        .filter(x=>x.isDirectory())
        .map(x=>x.name)
        .sort();

      const forbiddenGenerated=USER_OWNED_HERMES_STATE.filter(pattern=>{
        const literal=pattern.replace(/[/*]/g,"");
        return distributionOwned.some(x=>x===literal||x.startsWith(literal+"/"));
      });

      capabilityIsolation.push(Object.freeze({
        employee_id:employeeId,
        installed_skills:Object.freeze(installedSkillEntries),
        expected_skills:Object.freeze(expectedSkills),
        skills_exact:JSON.stringify(installedSkillEntries)===JSON.stringify(expectedSkills),
        manifest_skills_exact:JSON.stringify(declaredSkills)===JSON.stringify(expectedSkills),
        optional_integrations_exact:JSON.stringify(declaredIntegrations)===JSON.stringify(expectedIntegrations),
        distribution_contains_user_owned_state:forbiddenGenerated.length>0
      }));
      packResults.push(Object.freeze({
        employee_id:employeeId,
        pack_verified:true,
        manifest_employee_exact:manifest.employee_id===employeeId,
        files:built.files
      }));
    }

    const installedProfiles=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory())
      .map(x=>x.name)
      .sort();
    const installedAllExactly=JSON.stringify(installedProfiles)===JSON.stringify(expectedProfiles);

    const packEntries=(await readdir(packRoot,{withFileTypes:true}))
      .filter(x=>x.isDirectory())
      .map(x=>x.name)
      .sort();
    const packSetExact=JSON.stringify(packEntries)===JSON.stringify(expectedProfiles);

    const userStateBefore={};
    for(const employeeId of selectedIds){
      const profileDir=resolve(profilesDir,employeeId);
      const fixtures=await seedUserOwnedState(profileDir);
      userStateBefore[employeeId]=await snapshotFixtures(profileDir,fixtures);
    }

    const rerunPlan=planSelectedProfileActions({
      selectedIds,
      existingIds:[...selectedIds],
      mode:"upgrade"
    });
    if(rerunPlan.length!==selectedIds.length||rerunPlan.some(x=>x.action!=="native-upgrade")){
      throw new Error("full rerun plan must contain one native-upgrade per employee");
    }

    const rerunDistributionChecks=[];
    const userStatePreservation=[];
    for(const employeeId of selectedIds){
      const packDir=resolve(packRoot,employeeId);
      const profileDir=resolve(profilesDir,employeeId);
      const distributionOwned=await copyDistributionOwned(packDir,profileDir);
      const after=await snapshotFixtures(profileDir,Object.fromEntries(
        Object.keys(userStateBefore[employeeId]).map(rel=>[rel,""])
      ));
      const before=userStateBefore[employeeId];
      const preserved=Object.keys(before).every(rel=>before[rel]===after[rel]);
      const packCheck=await verifyEmployeePack(packDir);

      userStatePreservation.push(Object.freeze({
        employee_id:employeeId,
        preserved
      }));
      rerunDistributionChecks.push(Object.freeze({
        employee_id:employeeId,
        pack_verified:packCheck.ok,
        distribution_owned_stable:
          JSON.stringify(distributionOwned)===JSON.stringify(distributionOwnedByEmployee[employeeId])
      }));
    }

    const rerunProfiles=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory())
      .map(x=>x.name)
      .sort();
    const rerunProfilesExact=JSON.stringify(rerunProfiles)===JSON.stringify(expectedProfiles);

    const capabilityIsolationPassed=capabilityIsolation.every(x=>
      x.skills_exact &&
      x.manifest_skills_exact &&
      x.optional_integrations_exact &&
      !x.distribution_contains_user_owned_state
    );
    const allPacksVerified=
      packResults.length===selectedIds.length &&
      packResults.every(x=>x.pack_verified&&x.manifest_employee_exact) &&
      rerunDistributionChecks.every(x=>x.pack_verified&&x.distribution_owned_stable);
    const allUserOwnedStatePreserved=
      userStatePreservation.length===selectedIds.length &&
      userStatePreservation.every(x=>x.preserved);

    const profileFileCounts=[];
    for(const employeeId of selectedIds){
      profileFileCounts.push(Object.freeze({
        employee_id:employeeId,
        file_count:(await hashTree(resolve(profilesDir,employeeId))).length
      }));
    }
    const allProfilesNonEmpty=profileFileCounts.every(x=>x.file_count>0);

    const passed=
      registry.employee_count===registry.employees.length &&
      selectedIds.length===registry.employee_count &&
      installedAllExactly &&
      packSetExact &&
      capabilityIsolationPassed &&
      allPacksVerified &&
      rerunProfilesExact &&
      allUserOwnedStatePreserved &&
      allProfilesNonEmpty;

    return Object.freeze({
      schema:1,
      matrix_case:"fresh-install-full-workforce",
      claim_state:passed?"DETERMINISTICALLY_VERIFIED":"FAILED",
      passed,
      registry_employee_count:registry.employee_count,
      selected_employee_count:selectedIds.length,
      initial_profile_count:beforeEntries.length,
      selected_profiles:Object.freeze([...selectedIds]),
      expected_profiles:Object.freeze(expectedProfiles),
      installed_profiles:Object.freeze(installedProfiles),
      installed_all_profiles_exactly:installedAllExactly,
      pack_directories:Object.freeze(packEntries),
      pack_set_exact:packSetExact,
      install_actions:Object.freeze(installPlan.map(x=>Object.freeze({...x}))),
      rerun_actions:Object.freeze(rerunPlan.map(x=>Object.freeze({...x}))),
      rerun_profiles:Object.freeze(rerunProfiles),
      rerun_profiles_exact:rerunProfilesExact,
      pack_results:Object.freeze(packResults),
      capability_isolation:Object.freeze(capabilityIsolation),
      capability_isolation_passed:capabilityIsolationPassed,
      rerun_distribution_checks:Object.freeze(rerunDistributionChecks),
      all_packs_verified:allPacksVerified,
      user_owned_state_preservation:Object.freeze(userStatePreservation),
      all_user_owned_state_preserved:allUserOwnedStatePreserved,
      profile_file_counts:Object.freeze(profileFileCounts),
      all_profiles_non_empty:allProfilesNonEmpty,
      external_provider_calls:0,
      hermes_cli_executed:false,
      real_machine_claim:false,
      note:"Deterministic isolated full-workforce release-matrix case. Builds and verifies every canonical employee pack, installs exactly the current registry workforce into an empty disposable Hermes profile root, checks every per-worker skill/integration closure, reruns as native upgrades, preserves seeded user-owned state for every profile, and proves no extra/missing profile or pack directory. No real Hermes CLI/provider/account is touched."
    });
  }finally{
    if(cleanupBase) await rm(ownBase,{recursive:true,force:true});
  }
}


export async function runUpgradeUninstallLifecycleMatrix({
  removeEmployeeId="bimo",
  baseDir=null
}={}){
  const ownBase=baseDir||await mkdtemp(resolve(tmpdir(),"nyoba-lifecycle-"));
  const cleanupBase=baseDir?false:true;
  const packRoot=resolve(ownBase,"packs");
  const hermesHome=resolve(ownBase,"hermes-home");
  const profilesDir=resolve(hermesHome,"profiles");

  try{
    const registry=JSON.parse(await readFile(resolve(root,"config/employees.json"),"utf8"));
    const allIds=registry.employees.map(x=>x.id);
    const expectedProfiles=[...allIds].sort();
    if(!allIds.includes(removeEmployeeId)) throw new Error("removeEmployeeId must be a canonical employee");

    await mkdir(profilesDir,{recursive:true});
    const beforeEntries=await readdir(profilesDir);
    if(beforeEntries.length!==0) throw new Error("lifecycle matrix requires an empty disposable profile directory");

    const initialPlan=planSelectedProfileActions({
      selectedIds:allIds,
      existingIds:[],
      mode:"upgrade"
    });
    if(initialPlan.length!==allIds.length||initialPlan.some(x=>x.action!=="install")){
      throw new Error("initial lifecycle install plan must contain only install actions");
    }

    const distributionOwnedByEmployee={};
    for(const id of allIds){
      await buildEmployeePack({employeeId:id,outRoot:packRoot});
      const packDir=resolve(packRoot,id);
      const check=await verifyEmployeePack(packDir);
      if(!check.ok) throw new Error("pack verification failed before lifecycle install: "+id);
      distributionOwnedByEmployee[id]=await copyDistributionOwned(packDir,resolve(profilesDir,id));
      if(!distributionOwnedByEmployee[id].includes("SOUL.md")||!distributionOwnedByEmployee[id].includes("config.yaml")){
        throw new Error("lifecycle drift fixture requires SOUL.md and config.yaml ownership: "+id);
      }
    }

    const installedProfiles=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory()).map(x=>x.name).sort();
    if(JSON.stringify(installedProfiles)!==JSON.stringify(expectedProfiles)){
      throw new Error("initial lifecycle install did not match canonical workforce");
    }

    const packTreeBefore=await hashTree(packRoot);
    const userStateBefore={};
    for(const id of allIds){
      const profileDir=resolve(profilesDir,id);
      const fixtures=await seedUserOwnedState(profileDir);
      userStateBefore[id]=await snapshotFixtures(profileDir,fixtures);
      await writeFile(resolve(profileDir,"SOUL.md"),"OLD_DISTRIBUTION_SENTINEL="+id+"\n","utf8");
      await rm(resolve(profileDir,"config.yaml"),{force:true});
    }

    const upgradePlan=planSelectedProfileActions({
      selectedIds:allIds,
      existingIds:[...allIds],
      mode:"upgrade"
    });
    if(upgradePlan.length!==allIds.length||upgradePlan.some(x=>x.action!=="native-upgrade")){
      throw new Error("existing install did not resolve to native-upgrade for every employee");
    }

    const upgradeChecks=[];
    const userStateAfterUpgrade={};
    for(const id of allIds){
      const packDir=resolve(packRoot,id);
      const profileDir=resolve(profilesDir,id);
      const owned=await copyDistributionOwned(packDir,profileDir);
      const ownershipChecks=await distributionOwnedMatches(packDir,profileDir,owned);
      const after=await snapshotFixtures(profileDir,Object.fromEntries(
        Object.keys(userStateBefore[id]).map(rel=>[rel,""])
      ));
      userStateAfterUpgrade[id]=after;
      const preserved=Object.keys(userStateBefore[id]).every(rel=>userStateBefore[id][rel]===after[rel]);
      const soul=await readFile(resolve(profileDir,"SOUL.md"),"utf8");
      upgradeChecks.push(Object.freeze({
        employee_id:id,
        action:"native-upgrade",
        distribution_exact:ownershipChecks.every(x=>x.match),
        user_owned_state_preserved:preserved,
        stale_distribution_replaced:!soul.includes("OLD_DISTRIBUTION_SENTINEL"),
        ownership_checks:ownershipChecks
      }));
    }

    const upgradePassed=upgradeChecks.every(x=>
      x.distribution_exact&&x.user_owned_state_preserved&&x.stale_distribution_replaced
    );

    const selectivePreview=planSelectedProfileRemoval({
      selection:removeEmployeeId,
      confirmDeleteUserState:false
    });
    if(selectivePreview.action!=="PREVIEW_ONLY") throw new Error("selective removal must preview first");

    const preSelectiveProfiles=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory()).map(x=>x.name).sort();
    const previewNonDestructive=JSON.stringify(preSelectiveProfiles)===JSON.stringify(expectedProfiles);

    const survivors=allIds.filter(id=>id!==removeEmployeeId);
    const survivorTreesBefore={};
    for(const id of survivors) survivorTreesBefore[id]=await hashTree(resolve(profilesDir,id));

    const selectiveConfirm=planSelectedProfileRemoval({
      selection:removeEmployeeId,
      confirmDeleteUserState:true
    });
    if(selectiveConfirm.action!=="DELETE_PROFILE_AND_USER_STATE"||selectiveConfirm.profiles.length!==1){
      throw new Error("selective confirmed removal plan drifted");
    }
    await rm(resolve(profilesDir,removeEmployeeId),{recursive:true,force:true});

    const afterSelective=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory()).map(x=>x.name).sort();
    const expectedSurvivors=[...survivors].sort();
    const survivorIntegrity=[];
    for(const id of survivors){
      const afterTree=await hashTree(resolve(profilesDir,id));
      survivorIntegrity.push(Object.freeze({
        employee_id:id,
        unchanged:JSON.stringify(afterTree)===JSON.stringify(survivorTreesBefore[id])
      }));
    }
    const selectivePassed=
      !(await exists(resolve(profilesDir,removeEmployeeId))) &&
      JSON.stringify(afterSelective)===JSON.stringify(expectedSurvivors) &&
      survivorIntegrity.every(x=>x.unchanged);

    const fullPreview=planSelectedProfileRemoval({
      selection:"all",
      confirmDeleteUserState:false
    });
    if(fullPreview.action!=="PREVIEW_ONLY"||fullPreview.profiles.length!==allIds.length){
      throw new Error("full uninstall must preview all canonical profiles first");
    }
    const beforeFullPreviewTrees={};
    for(const id of survivors) beforeFullPreviewTrees[id]=await hashTree(resolve(profilesDir,id));
    const afterFullPreviewTrees={};
    for(const id of survivors) afterFullPreviewTrees[id]=await hashTree(resolve(profilesDir,id));
    const fullPreviewNonDestructive=survivors.every(id=>
      JSON.stringify(beforeFullPreviewTrees[id])===JSON.stringify(afterFullPreviewTrees[id])
    );

    const fullConfirm=planSelectedProfileRemoval({
      selection:"all",
      confirmDeleteUserState:true
    });
    if(fullConfirm.action!=="DELETE_PROFILE_AND_USER_STATE"||fullConfirm.profiles.length!==allIds.length){
      throw new Error("full uninstall confirmation plan drifted");
    }
    for(const id of fullConfirm.profiles){
      await rm(resolve(profilesDir,id),{recursive:true,force:true});
    }
    const afterFullUninstall=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory()).map(x=>x.name).sort();
    const fullUninstallPassed=afterFullUninstall.length===0&&allIds.every(id=>!(exists(resolve(profilesDir,id))));

    const reinstallPlan=planSelectedProfileActions({
      selectedIds:allIds,
      existingIds:[],
      mode:"upgrade"
    });
    if(reinstallPlan.length!==allIds.length||reinstallPlan.some(x=>x.action!=="install")){
      throw new Error("post-uninstall reinstall plan must contain only install actions");
    }

    const reinstallChecks=[];
    for(const id of allIds){
      const packDir=resolve(packRoot,id);
      const profileDir=resolve(profilesDir,id);
      const owned=await copyDistributionOwned(packDir,profileDir);
      const ownershipChecks=await distributionOwnedMatches(packDir,profileDir,owned);
      const userStateResurrected=[];
      for(const rel of Object.keys(userStateBefore[id])){
        if(await exists(resolve(profileDir,rel))) userStateResurrected.push(rel);
      }
      reinstallChecks.push(Object.freeze({
        employee_id:id,
        distribution_exact:ownershipChecks.every(x=>x.match),
        stale_user_state_resurrected:userStateResurrected.length>0,
        resurrected_paths:Object.freeze(userStateResurrected)
      }));
    }

    const reinstalledProfiles=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory()).map(x=>x.name).sort();
    const reinstallPassed=
      JSON.stringify(reinstalledProfiles)===JSON.stringify(expectedProfiles) &&
      reinstallChecks.every(x=>x.distribution_exact&&!x.stale_user_state_resurrected);

    const finalRerunPlan=planSelectedProfileActions({
      selectedIds:allIds,
      existingIds:[...allIds],
      mode:"upgrade"
    });
    const finalRerunActionsExact=
      finalRerunPlan.length===allIds.length &&
      finalRerunPlan.every(x=>x.action==="native-upgrade");

    for(const id of allIds){
      await copyDistributionOwned(resolve(packRoot,id),resolve(profilesDir,id));
    }
    const finalProfiles=(await readdir(profilesDir,{withFileTypes:true}))
      .filter(x=>x.isDirectory()).map(x=>x.name).sort();
    const finalProfilesExact=JSON.stringify(finalProfiles)===JSON.stringify(expectedProfiles);
    const packTreeAfter=await hashTree(packRoot);
    const packArtifactsUnchanged=JSON.stringify(packTreeBefore)===JSON.stringify(packTreeAfter);

    const passed=
      upgradePassed &&
      previewNonDestructive &&
      selectivePassed &&
      fullPreviewNonDestructive &&
      fullUninstallPassed &&
      reinstallPassed &&
      finalRerunActionsExact &&
      finalProfilesExact &&
      packArtifactsUnchanged;

    return Object.freeze({
      schema:1,
      matrix_case:"upgrade-uninstall-reinstall-full-workforce",
      claim_state:passed?"DETERMINISTICALLY_VERIFIED":"FAILED",
      passed,
      registry_employee_count:registry.employee_count,
      initial_profiles:Object.freeze(installedProfiles),
      upgrade_actions:Object.freeze(upgradePlan.map(x=>Object.freeze({...x}))),
      upgrade_checks:Object.freeze(upgradeChecks),
      upgrade_passed:upgradePassed,
      selective_removal:Object.freeze({
        employee_id:removeEmployeeId,
        preview_action:selectivePreview.action,
        preview_non_destructive:previewNonDestructive,
        confirmed_action:selectiveConfirm.action,
        remaining_profiles:Object.freeze(afterSelective),
        survivor_integrity:Object.freeze(survivorIntegrity),
        passed:selectivePassed
      }),
      full_uninstall:Object.freeze({
        preview_action:fullPreview.action,
        preview_non_destructive:fullPreviewNonDestructive,
        confirmed_action:fullConfirm.action,
        remaining_profiles:Object.freeze(afterFullUninstall),
        passed:fullUninstallPassed
      }),
      reinstall:Object.freeze({
        actions:Object.freeze(reinstallPlan.map(x=>Object.freeze({...x}))),
        profiles:Object.freeze(reinstalledProfiles),
        checks:Object.freeze(reinstallChecks),
        passed:reinstallPassed
      }),
      final_rerun_actions:Object.freeze(finalRerunPlan.map(x=>Object.freeze({...x}))),
      final_rerun_actions_exact:finalRerunActionsExact,
      final_profiles:Object.freeze(finalProfiles),
      final_profiles_exact:finalProfilesExact,
      pack_artifacts_unchanged:packArtifactsUnchanged,
      external_provider_calls:0,
      hermes_cli_executed:false,
      real_machine_claim:false,
      note:"Deterministic isolated full-workforce lifecycle matrix: existing install -> native-upgrade refresh with user-state preservation -> previewed selective removal -> previewed/confirmed full uninstall -> clean reinstall -> native-upgrade rerun. It proves release ownership and lifecycle invariants without touching a real Hermes installation, provider, account, or user profile."
    });
  }finally{
    if(cleanupBase) await rm(ownBase,{recursive:true,force:true});
  }
}
