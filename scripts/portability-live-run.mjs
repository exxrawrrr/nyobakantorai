import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { buildPortabilityReferenceCase } from "../packages/portability-reference/index.mjs";
import { findExecutable, inspectProviders } from "../packages/provider-doctor/index.mjs";
import { runReferenceEvidence } from "../packages/portability-live-run/index.mjs";

const root=resolve(import.meta.dirname,"..");
const argv=process.argv.slice(2);
const command=argv[0]||"plan";
const flag=(name)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:null;};
const has=(name)=>argv.includes(name);
const runtime=String(flag("--runtime")||"").trim().toLowerCase();
if(!["hermes","codex"].includes(runtime)) throw new Error("provide --runtime hermes|codex");

const readJson=async(rel)=>JSON.parse(await readFile(resolve(root,rel),"utf8"));
const [catalog,policy,livePolicy]=await Promise.all([
  readJson("config/provider-doctor.json"),
  readJson("config/runtime-execution-policy.json"),
  readJson("config/portability-live-run.json"),
]);
const reference=await buildPortabilityReferenceCase({root});
if(reference.manifest.core_bundle_sha256!==livePolicy.core_bundle_sha256) throw new Error("live-run policy core hash drift");

function git(args){
  return execFileSync("git",args,{cwd:root,encoding:"utf8",windowsHide:true}).trim();
}
const repository={
  commit:git(["rev-parse","HEAD"]),
  clean:git(["status","--porcelain"])==="",
};
const providerReport=inspectProviders({catalog,selectedIds:[runtime],root});
const providerItem=providerReport.providers[0];
const executable=findExecutable(runtime);
const provider={
  install_state:providerItem.install_state,
  command_detected:providerItem.evidence.command_detected===true && Boolean(executable),
  readiness:providerItem.readiness,
};
let versionProbe={ok:false,version:null};
if(executable){
  const probe=spawnSync(executable,["--version"],{encoding:"utf8",windowsHide:true,shell:false,env:process.env,timeout:5000});
  const version=String(probe.stdout||probe.stderr||"").trim().split(/\r?\n/)[0].slice(0,120);
  versionProbe={ok:probe.status===0 && Boolean(version),version:probe.status===0?version:null};
}

const plan={
  schema:1,
  command,
  runtime,
  reference_case_id:reference.manifest.reference_case_id,
  core_bundle_sha256:reference.manifest.core_bundle_sha256,
  repository,
  provider,
  version_probe:versionProbe,
  explicit_confirmation_present:has("--confirm-live"),
  side_effects:{
    provider_install:false,
    provider_login:false,
    credential_creation:false,
    production_repository_mutation:false
  }
};

if(command==="plan"){
  process.stdout.write(JSON.stringify(plan,null,2)+"\n");
  process.exit(0);
}
if(command!=="run") throw new Error("usage: portability-live-run.mjs <plan|run> --runtime hermes|codex [--confirm-live] [--out file]");
if(!has("--confirm-live")) throw new Error("live run requires explicit --confirm-live");
if(!repository.clean) throw new Error("live run requires a clean Git worktree");
if(!provider.command_detected || provider.install_state!=="INSTALLED") throw new Error("live run requires installed detected runtime command");
if(!versionProbe.ok) throw new Error("live run requires successful runtime --version probe");

const result=await runReferenceEvidence({
  runtime,
  mode:"live",
  reference,
  policy,
  repository,
  provider,
  versionProbe,
  executable
});

const out=resolve(flag("--out")||resolve(root,livePolicy.default_local_output_dir,runtime+"-"+repository.commit+".json"));
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(result.record,null,2)+"\n",{encoding:"utf8",mode:0o600});
process.stdout.write(JSON.stringify({
  ok:true,
  runtime,
  evidence_class:result.record.evidence_class,
  record_sha256:result.record_sha256,
  out:basename(out),
  qualification:result.qualification
},null,2)+"\n");
if(result.record.evidence_class!=="LIVE_RUNTIME_EVIDENCE") process.exitCode=3;
