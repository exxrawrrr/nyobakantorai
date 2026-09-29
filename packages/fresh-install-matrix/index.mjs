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

      const installedSkillEntries=(await readdir(resolve(profilesDir,employeeId,"skills"),{withFileTypes:true}))
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

    const userStateByProfile={};
    for(const employeeId of selectedIds){
      const profileDir=resolve(profilesDir,employeeId);
      const fixtures=await seedUserOwnedState(profileDir);
      userStateByProfile[employeeId]=await snapshotFixtures(profileDir,fixtures);
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
