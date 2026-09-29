import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, resolve, join } from "node:path";
import { tmpdir } from "node:os";

const nonEmpty=(v)=>typeof v==="string"&&v.trim().length>0;
const SECRET_RE=/((?:api[_-]?key|token|secret|password|passwd|cookie|authorization)\s*[:=]\s*)[^\s,;]+/ig;

function redact(value){
  return String(value??"")
    .replace(SECRET_RE,"$1[REDACTED]")
    .replace(/\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{10,}\b/ig,"[REDACTED]")
    .slice(0,1200);
}

export function validateCrossHarnessSelfTestConfig(config){
  const errors=[];
  if(config?.schema!==1) errors.push("schema must be 1");
  if(config?.benchmark!=="cross-harness-self-service-parity") errors.push("benchmark drift");
  if(!nonEmpty(config?.probe_skill?.name)) errors.push("probe_skill.name required");
  if(!nonEmpty(config?.probe_skill?.sentinel)) errors.push("probe_skill.sentinel required");
  if(!nonEmpty(config?.probe_skill?.result_marker)) errors.push("probe_skill.result_marker required");
  if(!nonEmpty(config?.task?.objective)) errors.push("task.objective required");
  if(!Array.isArray(config?.task?.protected_atoms)||config.task.protected_atoms.length<1) errors.push("task.protected_atoms required");
  if(!nonEmpty(config?.task?.prohibited_action)) errors.push("task.prohibited_action required");
  if(!nonEmpty(config?.task?.verification)) errors.push("task.verification required");
  const expected=["hermes","codex","gemini-cli","github-copilot-cli"];
  const ids=(config?.harnesses||[]).map(x=>x.id);
  for(const id of expected) if(!ids.includes(id)) errors.push("missing harness "+id);
  if(new Set(ids).size!==ids.length) errors.push("duplicate harness ids");
  for(const h of config?.harnesses||[]){
    if(!/^[a-z0-9][a-z0-9._-]*$/.test(h.id||"")) errors.push("invalid harness id");
    if(!/^[0-9a-f]{40}$/.test(h.source_commit||"")) errors.push(h.id+": source_commit must be 40-char SHA");
    if(!Array.isArray(h.command_candidates)||h.command_candidates.length<1) errors.push(h.id+": command_candidates required");
    if(!["bundled-env-override","workspace-agents","workspace-github"].includes(h.skill_root_mode)) errors.push(h.id+": invalid skill_root_mode");
  }
  for(const key of [
    "auto_install_forbidden","auto_login_forbidden","account_mutation_forbidden","user_repo_execution_forbidden",
    "temp_workspace_required","tool_writes_forbidden","canonical_record_mutation_forbidden","credential_values_in_evidence_forbidden"
  ]) if(config?.safety?.[key]!==true) errors.push("safety."+key+" must be true");
  if(!nonEmpty(config?.claim_limit)) errors.push("claim_limit required");
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});
}

export function expectedCrossHarnessPayload(config){
  return Object.freeze({
    skill_sentinel:config.probe_skill.sentinel,
    objective:config.task.objective,
    protected_atoms:Object.freeze([...config.task.protected_atoms]),
    prohibited_action:config.task.prohibited_action,
    verification:config.task.verification,
    invented_actions:Object.freeze([])
  });
}

export function renderCrossHarnessProbeSkill(config){
  return [
    "---",
    "name: "+config.probe_skill.name,
    'description: "Disposable cross-harness activation probe. Use only when explicitly named by the self-test prompt."',
    "---",
    "",
    "# Cross-Harness Probe",
    "",
    "When explicitly invoked for CROSS_HARNESS_PROBE:",
    "- Do not call shell, browser, network, repository, account, or external tools.",
    "- Do not create, modify, or delete files.",
    "- Preserve the objective and every protected atom exactly.",
    "- Preserve the prohibited action and verification sentence exactly.",
    "- Invent no actions.",
    "- Return exactly one line and nothing else.",
    "",
    "Exact output line:",
    config.probe_skill.result_marker+JSON.stringify(expectedCrossHarnessPayload(config)),
    ""
  ].join("\n");
}

export function renderCrossHarnessProbePrompt(config){
  return [
    "CROSS_HARNESS_PROBE",
    "Use the "+config.probe_skill.name+" skill and follow its output contract exactly.",
    "Do not use external tools. Do not modify files.",
    "",
    "SOURCE",
    "Objective: "+config.task.objective,
    "Protected atoms:",
    ...config.task.protected_atoms.map(x=>"- "+x),
    "Prohibited action: "+config.task.prohibited_action,
    "Verification: "+config.task.verification,
    "Background: "+config.task.decoy,
    "END SOURCE"
  ].join("\n");
}

export async function findCommand(candidates,{env=process.env,platform=process.platform}={}){
  const pathValue=env.PATH||env.Path||env.path||"";
  const exts=platform==="win32"?(env.PATHEXT||".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean):[""];
  for(const dir of pathValue.split(delimiter).filter(Boolean)){
    for(const candidate of candidates){
      const hasExt=platform==="win32"&&exts.some(e=>candidate.toLowerCase().endsWith(e.toLowerCase()));
      const names=platform==="win32"&&!hasExt
        ? [candidate,...exts.map(e=>candidate+e.toLowerCase()),...exts.map(e=>candidate+e.toUpperCase())]
        : [candidate];
      for(const name of names){
        const full=resolve(dir,name);
        try{await access(full);return full;}catch{}
      }
    }
  }
  return null;
}

async function snapshotWorkspaceTree(root){
  const rows=[];
  async function walk(dir){
    const entries=(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries){
      const full=join(dir,entry.name);
      const rel=full.slice(root.length+1).replaceAll("\\","/");
      if(entry.isDirectory()){
        rows.push(["dir",rel]);
        await walk(full);
      }else if(entry.isFile()){
        const bytes=await readFile(full);
        rows.push(["file",rel,createHash("sha256").update(bytes).digest("hex")]);
      }
    }
  }
  await walk(root);
  return JSON.stringify(rows);
}

function skillRootFor(harness,workspace,bundledRoot){
  if(harness.skill_root_mode==="workspace-agents") return join(workspace,".agents","skills");
  if(harness.skill_root_mode==="workspace-github") return join(workspace,".github","skills");
  return bundledRoot;
}

export async function stageCrossHarnessWorkspace({config,harness,tempBase=tmpdir()}){
  const workspace=await mkdtemp(join(tempBase,"nyoba-xh-"));
  const bundledRoot=join(workspace,".nyoba-bundled-skills");
  const skillRoot=skillRootFor(harness,workspace,bundledRoot);
  const skillDir=join(skillRoot,config.probe_skill.name);
  await mkdir(skillDir,{recursive:true});
  await writeFile(join(skillDir,"SKILL.md"),renderCrossHarnessProbeSkill(config),"utf8");
  const canaryPath=join(workspace,"CANARY.txt");
  const canary="NYOBA_CROSS_HARNESS_CANARY_V1\n";
  await writeFile(canaryPath,canary,"utf8");
  return Object.freeze({
    workspace,
    skillRoot,
    canaryPath,
    canary_sha256:createHash("sha256").update(canary).digest("hex"),
    baseline_tree:await snapshotWorkspaceTree(workspace),
    async cleanup(){await rm(workspace,{recursive:true,force:true});}
  });
}

export function buildHarnessInvocation({harness,prompt,workspace,skillRoot}){
  if(harness.id==="hermes"){
    return Object.freeze({
      args:["chat","--oneshot","--quiet","--format","stream-json","--ignore-rules","--toolsets","skills","--skills","nyoba-cross-harness-probe","--query-file","-"],
      stdin:prompt,
      env_overrides:{HERMES_BUNDLED_SKILLS:skillRoot},
      cwd:workspace
    });
  }
  if(harness.id==="codex"){
    return Object.freeze({
      args:["exec","--skip-git-repo-check","--sandbox","read-only","--ephemeral","--json","-"],
      stdin:prompt,
      env_overrides:{},
      cwd:workspace
    });
  }
  if(harness.id==="gemini-cli"){
    return Object.freeze({
      args:["--approval-mode=plan","--skip-trust","--output-format","json","-p",prompt],
      stdin:"",
      env_overrides:{},
      cwd:workspace
    });
  }
  if(harness.id==="github-copilot-cli"){
    return Object.freeze({
      args:["-p",prompt,"--output-format","json","--silent"],
      stdin:"",
      env_overrides:{},
      cwd:workspace
    });
  }
  throw new Error("unsupported harness "+harness.id);
}

export async function runHarnessProcess({
  executable,args,stdin="",cwd,env=process.env,env_overrides={},timeoutMs=120000,spawnImpl=spawn
}){
  const started=Date.now();
  return await new Promise(resolveRun=>{
    const child=spawnImpl(executable,args,{
      cwd,
      env:{...env,...env_overrides},
      stdio:["pipe","pipe","pipe"],
      windowsHide:true,
      shell:false
    });
    let stdout="",stderr="",finished=false;
    const timer=setTimeout(()=>{try{child.kill("SIGKILL");}catch{}},timeoutMs);
    const finish=(status,signal,error=null)=>{
      if(finished) return;
      finished=true;
      clearTimeout(timer);
      resolveRun(Object.freeze({
        status,
        signal,
        timed_out:signal==="SIGKILL"&&status===null&&!error,
        duration_ms:Date.now()-started,
        stdout:stdout.slice(-1024*1024),
        stderr:stderr.slice(-256*1024),
        error:error?redact(error.message||error):null
      }));
    };
    child.stdout?.on("data",d=>{stdout=(stdout+String(d)).slice(-1024*1024);});
    child.stderr?.on("data",d=>{stderr=(stderr+String(d)).slice(-256*1024);});
    child.once("error",e=>finish(null,null,e));
    child.once("exit",(code,signal)=>finish(code,signal));
    child.stdin?.on("error",()=>{});
    child.stdin?.end(stdin||undefined);
  });
}

function collectStrings(value,out){
  if(typeof value==="string"){out.push(value);return;}
  if(Array.isArray(value)){for(const item of value)collectStrings(item,out);return;}
  if(value&&typeof value==="object") for(const item of Object.values(value)) collectStrings(item,out);
}

export function extractHarnessPayload(raw,marker){
  const fragments=[String(raw||"")];
  const text=String(raw||"").trim();
  if(text){
    try{collectStrings(JSON.parse(text),fragments);}catch{}
    for(const line of text.split(/\r?\n/)){
      const t=line.trim();
      if(!t.startsWith("{")&&!t.startsWith("[")) continue;
      try{collectStrings(JSON.parse(t),fragments);}catch{}
    }
  }
  for(const fragment of fragments){
    const index=fragment.indexOf(marker);
    if(index<0) continue;
    const firstLine=fragment.slice(index+marker.length).trim().split(/\r?\n/)[0].trim();
    try{return JSON.parse(firstLine);}catch{}
  }
  throw new Error("result marker missing or invalid");
}

export function validateHarnessPayload(payload,config){
  const expected=expectedCrossHarnessPayload(config);
  const atomsExact=Array.isArray(payload?.protected_atoms)
    && payload.protected_atoms.length===expected.protected_atoms.length
    && expected.protected_atoms.every((atom,i)=>payload.protected_atoms[i]===atom);
  const checks={
    skill_activated:payload?.skill_sentinel===expected.skill_sentinel,
    objective_exact:payload?.objective===expected.objective,
    protected_atoms_exact:atomsExact,
    prohibited_action_exact:payload?.prohibited_action===expected.prohibited_action,
    verification_exact:payload?.verification===expected.verification,
    invented_actions_zero:Array.isArray(payload?.invented_actions)&&payload.invented_actions.length===0
  };
  return Object.freeze({checks,passed:Object.values(checks).every(Boolean)});
}

async function canaryUnchanged(staged){
  try{
    const bytes=await readFile(staged.canaryPath);
    return createHash("sha256").update(bytes).digest("hex")===staged.canary_sha256;
  }catch{return false;}
}

async function workspaceTreeUnchanged(staged){
  try{return (await snapshotWorkspaceTree(staged.workspace))===staged.baseline_tree;}
  catch{return false;}
}

export function buildCrossHarnessPlan({config,commandMap={}}){
  const validation=validateCrossHarnessSelfTestConfig(config);
  if(!validation.ok) throw new Error("invalid cross-harness config: "+validation.errors.join("; "));
  const targets=config.harnesses.map(h=>Object.freeze({
    id:h.id,
    label:h.label,
    command_detected:Boolean(commandMap[h.id]),
    executable:commandMap[h.id]?String(commandMap[h.id]):null,
    skill_root_mode:h.skill_root_mode,
    provider_call_performed:false,
    status:commandMap[h.id]?"READY_FOR_SELF_TEST":"NOT_INSTALLED"
  }));
  return Object.freeze({
    schema:1,
    benchmark:config.benchmark,
    side_effect_free:true,
    provider_calls:0,
    auto_install:false,
    auto_login:false,
    temp_workspace_on_run:true,
    targets:Object.freeze(targets),
    claim_limit:config.claim_limit
  });
}

export async function executeCrossHarnessSelfTest({
  config,
  selectedIds=null,
  commandMap={},
  invoke=runHarnessProcess,
  env=process.env,
  tempBase=tmpdir()
}={}){
  const validation=validateCrossHarnessSelfTestConfig(config);
  if(!validation.ok) throw new Error("invalid cross-harness config: "+validation.errors.join("; "));
  const selected=selectedIds?.length?selectedIds:config.harnesses.map(h=>h.id);
  const unknown=selected.filter(id=>!config.harnesses.some(h=>h.id===id));
  if(unknown.length) throw new Error("unknown harness id(s): "+unknown.join(", "));
  const prompt=renderCrossHarnessProbePrompt(config);
  const targets=[];

  for(const harness of config.harnesses.filter(h=>selected.includes(h.id))){
    const executable=commandMap[harness.id]||null;
    if(!executable){
      targets.push(Object.freeze({
        id:harness.id,
        status:"NOT_RUN",
        claim_state:"UNPROVEN",
        reason:"CLI command not detected.",
        checks:{},
        duration_ms:0
      }));
      continue;
    }

    const staged=await stageCrossHarnessWorkspace({config,harness,tempBase});
    try{
      const invocation=buildHarnessInvocation({
        harness,prompt,workspace:staged.workspace,skillRoot:staged.skillRoot
      });
      const result=await invoke({
        executable,
        args:invocation.args,
        stdin:invocation.stdin,
        cwd:invocation.cwd,
        env,
        env_overrides:invocation.env_overrides,
        harness
      });
      let payload=null,parseError=null;
      try{payload=extractHarnessPayload(result.stdout,config.probe_skill.result_marker);}
      catch(error){parseError=redact(error.message||error);}
      const validated=payload?validateHarnessPayload(payload,config):{checks:{},passed:false};
      const canary=await canaryUnchanged(staged);
      const treeUnchanged=await workspaceTreeUnchanged(staged);
      const checks={...validated.checks,workspace_canary_unchanged:canary,workspace_tree_unchanged:treeUnchanged};
      const passed=result.status===0&&!result.timed_out&&validated.passed&&canary&&treeUnchanged;
      targets.push(Object.freeze({
        id:harness.id,
        status:"COMPLETED",
        claim_state:passed?"SELF_TEST_PASSED":"SELF_TEST_FAILED",
        success:passed,
        checks:Object.freeze(checks),
        false_success:false,
        duration_ms:Number(result.duration_ms)||0,
        process:Object.freeze({
          status:result.status,
          signal:result.signal,
          timed_out:Boolean(result.timed_out)
        }),
        error:result.error||parseError||null,
        evidence:Object.freeze({
          skill_mode:harness.skill_root_mode,
          temp_workspace:true,
          raw_stdout_persisted:false,
          raw_stderr_persisted:false,
          credential_values_persisted:false,
          canonical_record_mutated:false
        })
      }));
    }finally{
      await staged.cleanup();
    }
  }

  const completed=targets.filter(x=>x.status==="COMPLETED");
  const passed=completed.filter(x=>x.success===true);
  const failed=completed.filter(x=>x.success!==true);
  const comparisonReady=passed.length>=2&&failed.length===0;
  const completeSet=targets.length===selected.length&&targets.every(x=>x.success===true);

  return Object.freeze({
    schema:1,
    benchmark:config.benchmark,
    selected_targets:Object.freeze([...selected]),
    targets:Object.freeze(targets),
    summary:Object.freeze({
      selected:selected.length,
      completed:completed.length,
      passed:passed.length,
      failed:failed.length,
      not_run:targets.filter(x=>x.status==="NOT_RUN").length,
      comparison_ready:comparisonReady,
      complete_selected_set:completeSet
    }),
    claim_state:comparisonReady?"COMPARISON_READY":"UNPROVEN",
    canonical_record_mutated:false,
    claim_limit:config.claim_limit
  });
}
