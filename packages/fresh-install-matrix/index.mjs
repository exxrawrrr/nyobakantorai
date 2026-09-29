import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { buildEmployeePack, verifyEmployeePack } from "../../scripts/employee-pack.mjs";
import { planSelectedProfileActions, USER_OWNED_HERMES_STATE } from "../../scripts/hermes-bootstrap-plan.mjs";

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
    ".env":"MODEL_PROVIDER=user-owned\nAPI_KEY=[placeholder-not-a-real-key]\n",
    "auth.json":JSON.stringify({owner:"user",token:"placeholder-not-a-real-token"},null,2)+"\n",
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
