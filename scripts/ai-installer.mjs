import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));

function takeValue(argv,index,name){
  const item=argv[index];
  const prefix=name+"=";
  if(item.startsWith(prefix))return {value:item.slice(prefix.length),next:index+1};
  if(item===name){
    if(index+1>=argv.length)throw new Error(`Missing value for ${name}`);
    return {value:argv[index+1],next:index+2};
  }
  return null;
}

export function parseAgentInstallArgs(argv=[]){
  const out={
    apply:false,
    channel:"stable",
    version:"",
    ref:"",
    employees:"all",
    withHermes:false,
    start:false,
    port:4322,
    installDir:"",
  };
  let channelExplicit=false;

  for(let i=0;i<argv.length;){
    const arg=argv[i];
    if(arg==="--apply"){out.apply=true;i++;continue;}
    if(arg==="--with-hermes"){out.withHermes=true;i++;continue;}
    if(arg==="--start"){out.start=true;i++;continue;}

    let pair=null;
    for(const name of ["--channel","--version","--ref","--employees","--port","--dir"]){
      pair=takeValue(argv,i,name);
      if(!pair)continue;
      const key={"--channel":"channel","--version":"version","--ref":"ref","--employees":"employees","--port":"port","--dir":"installDir"}[name];
      out[key]=key==="port"?Number(pair.value):pair.value;
      if(name==="--channel")channelExplicit=true;
      i=pair.next;
      break;
    }
    if(pair)continue;
    throw new Error(`Unknown option: ${arg}`);
  }

  if(out.ref){
    if(channelExplicit&&out.channel!=="development")throw new Error("--ref requires --channel development.");
    out.channel="development";
  }
  if(!["stable","development"].includes(out.channel))throw new Error("Channel must be stable or development.");
  if(!Number.isInteger(out.port)||out.port<1024||out.port>65535)throw new Error("Port must be between 1024 and 65535.");
  if(!/^[a-z0-9,-]+$/i.test(out.employees))throw new Error("Employees must be a comma-separated selector without spaces.");

  if(out.channel==="stable"){
    if(out.ref)throw new Error("Stable installation does not accept --ref.");
    if(out.version&&!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/.test(out.version)){
      throw new Error("Stable --version must be an immutable vX.Y.Z tag.");
    }
  }else{
    if(out.version)throw new Error("--version is only valid for the stable channel.");
    if(!out.ref)out.ref="main";
    if(!/^[A-Za-z0-9._/-]+$/.test(out.ref)||out.ref.includes(".."))throw new Error("Development ref contains unsupported characters.");
  }
  return Object.freeze(out);
}

export function buildAgentInstallPlan(options,{platform=process.platform,repoRoot=root}={}){
  const windows=platform==="win32";
  const executable=windows?"powershell.exe":"bash";
  const installer=resolve(repoRoot,windows?"install.ps1":"install.sh");
  const args=windows
    ? ["-NoProfile","-ExecutionPolicy","Bypass","-File",installer]
    : [installer];

  if(windows){
    args.push("-Channel",options.channel);
    if(options.version)args.push("-Version",options.version);
    if(options.ref)args.push("-Ref",options.ref);
    if(options.installDir)args.push("-InstallDir",options.installDir);
    args.push("-Employees",options.employees,"-Port",String(options.port));
    if(options.withHermes)args.push("-WithHermes");
    if(options.start)args.push("-Start");
  }else{
    args.push("--channel",options.channel);
    if(options.version)args.push("--version",options.version);
    if(options.ref)args.push("--ref",options.ref);
    if(options.installDir)args.push("--dir",options.installDir);
    args.push("--employees",options.employees,"--port",String(options.port));
    if(options.withHermes)args.push("--with-hermes");
    if(options.start)args.push("--start");
  }

  return Object.freeze({
    schema:1,
    kind:"nyobakantorai-ai-install-plan",
    mode:options.apply?"APPLY":"PLAN_ONLY",
    channel:options.channel,
    immutable_source_required:options.channel==="stable",
    selected_employees:options.employees,
    with_hermes:options.withHermes,
    start_after_install:options.start,
    port:options.port,
    install_dir:options.installDir||null,
    version:options.version||null,
    ref:options.ref||null,
    command:Object.freeze({executable,args:Object.freeze(args)}),
    safety:Object.freeze({
      no_secret_input:true,
      no_main_fallback_from_stable:true,
      no_owner_data_copy:true,
      existing_non_empty_stable_dir_refused:true,
      human_owned_provider_setup:true,
      default_is_plan_only:true,
    }),
    next:options.apply
      ?"Run the canonical human installer with the exact bounded arguments above."
      :"Review this plan. Re-run with --apply only if the requested install scope is correct.",
  });
}

export function runAgentInstaller(options,{platform=process.platform,repoRoot=root}={}){
  const plan=buildAgentInstallPlan(options,{platform,repoRoot});
  if(!options.apply)return {plan,result:null};

  const child=spawnSync(plan.command.executable,[...plan.command.args],{
    cwd:repoRoot,
    encoding:"utf8",
    windowsHide:true,
  });
  return {
    plan,
    result:{
      ok:child.status===0&&!child.error,
      exit_code:child.status,
      error:child.error?.message||null,
      stdout:String(child.stdout||"").trim().split(/\r?\n/).slice(-80),
      stderr:String(child.stderr||"").trim().split(/\r?\n/).slice(-80).filter(Boolean),
    },
  };
}

async function main(){
  try{
    const options=parseAgentInstallArgs(process.argv.slice(2));
    const report=runAgentInstaller(options);
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
    if(report.result&&!report.result.ok)process.exitCode=report.result.exit_code||1;
  }catch(error){
    process.stderr.write(JSON.stringify({
      schema:1,
      kind:"nyobakantorai-ai-install-error",
      ok:false,
      error:error instanceof Error?error.message:String(error),
    },null,2)+"\n");
    process.exitCode=2;
  }
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked)await main();
