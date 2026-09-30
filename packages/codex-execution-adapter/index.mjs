import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { canonicalJson } from "../execution-receipt/index.mjs";
import { PORTABILITY_REFERENCE_SKILLS } from "../portability-reference/index.mjs";

export const CODEX_REFERENCE_CORE_SHA256 = "0c32963e42471e3ab14c74dc99f627cab254d45cfbc2de07bfe870abd7811fee";
export const CODEX_REFERENCE_RESULT_MARKER = "NYOBA_SITI_RESULT=";

const REVIEW_STATES = new Set(["PASS","FAIL","INCOMPLETE"]);
const VERDICTS = new Set(["SUPPORTED","CONTRADICTED","NOT_VERIFIED"]);
const hash = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex");
const assert = (condition,message) => { if(!condition) throw new Error(message); };

function executableAllowed(executable) {
  return ["codex","codex.exe","codex.cmd","codex.bat"].includes(basename(String(executable || "")).toLowerCase());
}

async function snapshotTree(root) {
  const rows=[];
  async function walk(dir) {
    const entries=(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries) {
      const full=join(dir,entry.name);
      const rel=full.slice(root.length+1).replaceAll("\\","/");
      if(entry.isDirectory()){rows.push(["dir",rel]);await walk(full);}
      else if(entry.isFile()){const bytes=await readFile(full);rows.push(["file",rel,hash(bytes)]);}
    }
  }
  await walk(root);
  return canonicalJson(rows);
}

function collectStrings(value,out){
  if(typeof value==="string"){out.push(value);return;}
  if(Array.isArray(value)){for(const item of value) collectStrings(item,out);return;}
  if(value&&typeof value==="object") for(const item of Object.values(value)) collectStrings(item,out);
}

export function extractCodexReferencePayload(raw){
  const text=String(raw||"").trim();
  const fragments=[text];
  if(text){
    try{collectStrings(JSON.parse(text),fragments);}catch{}
    for(const line of text.split(/\r?\n/)){
      const trimmed=line.trim();
      if(!trimmed.startsWith("{")&&!trimmed.startsWith("[")) continue;
      try{collectStrings(JSON.parse(trimmed),fragments);}catch{}
    }
  }
  for(const fragment of fragments){
    const index=fragment.indexOf(CODEX_REFERENCE_RESULT_MARKER);
    if(index<0) continue;
    const payloadText=fragment.slice(index+CODEX_REFERENCE_RESULT_MARKER.length).trim().split(/\r?\n/)[0].trim();
    try{return JSON.parse(payloadText);}catch{}
  }
  throw new Error("Codex reference result marker missing or invalid");
}

function validateReviewPayload(payload,reference){
  assert(payload?.schema===1,"Codex reference payload schema must be 1");
  assert(REVIEW_STATES.has(payload.review_state),"Codex reference review_state invalid");
  assert(Array.isArray(payload.claims),"Codex reference claims must be an array");
  const expectedIds=reference.core_bundle.source_artifact.claims_to_review.map((item)=>item.claim_id);
  assert(payload.claims.length===expectedIds.length,"Codex reference claim count mismatch");
  const seen=new Set();
  for(const item of payload.claims){
    assert(expectedIds.includes(item?.claim_id),"Codex reference claim_id invalid");
    assert(!seen.has(item.claim_id),"Codex reference claim_id duplicated");
    seen.add(item.claim_id);
    assert(VERDICTS.has(item?.verdict),"Codex reference verdict invalid");
    assert(typeof item?.evidence_path==="string"&&item.evidence_path.trim(),"Codex reference evidence_path required");
  }
  assert(Array.isArray(payload.residual_limitations),"Codex reference residual_limitations must be an array");
  assert(payload.residual_limitations.every((item)=>typeof item==="string"),"Codex reference limitations must be strings");
  return payload;
}

export function renderCodexReferencePrompt(reference){
  assert(reference?.manifest?.core_bundle_sha256===CODEX_REFERENCE_CORE_SHA256,"Codex reference core hash mismatch");
  const runtimeFacing={
    reference_case_id:reference.manifest.reference_case_id,
    core_bundle_sha256:reference.manifest.core_bundle_sha256,
    worker:reference.core_bundle.worker,
    task:reference.core_bundle.task,
    source_artifact:reference.core_bundle.source_artifact,
    canonical_skill_ids:[...PORTABILITY_REFERENCE_SKILLS],
  };
  return [
    "NYOBAKANTORAI_PORTABILITY_REFERENCE_CASE",
    "Act as the supplied portable Siti worker contract.",
    "Use the five canonical skills staged in .agents/skills. Do not modify files or perform external actions.",
    "The full canonical bundle is staged only for byte-identity evidence; do not infer an answer from verifier-side expected-result or protected-atom files.",
    "Review the claims from SOURCE using the task contract.",
    "Return exactly one line and no prose before or after it.",
    'Format: '+CODEX_REFERENCE_RESULT_MARKER+'{"schema":1,"review_state":"PASS|FAIL|INCOMPLETE","claims":[{"claim_id":"...","verdict":"SUPPORTED|CONTRADICTED|NOT_VERIFIED","evidence_path":"..."}],"residual_limitations":["..."]}',
    "",
    "RUNTIME_FACING_CANONICAL_INPUT",
    canonicalJson(runtimeFacing),
  ].join("\n");
}

export async function runCodexReferenceProcess({executable,args,stdin,cwd,env,signal,spawnImpl=spawn,maxStdoutBytes=262144,maxStderrBytes=65536}){
  return await new Promise((resolveRun)=>{
    const child=spawnImpl(executable,args,{cwd,env,stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false});
    let stdout="",stderr="",settled=false,aborted=false;
    const finish=(status,signalName,error=null)=>{
      if(settled) return;
      settled=true;
      signal?.removeEventListener?.("abort",onAbort);
      resolveRun(Object.freeze({
        status,signal:signalName,aborted,
        stdout:stdout.slice(-maxStdoutBytes),stderr:stderr.slice(-maxStderrBytes),
        error:error?"CODEX_PROCESS_ERROR":null,
      }));
    };
    const onAbort=()=>{aborted=true;try{child.kill("SIGKILL");}catch{}};
    signal?.addEventListener?.("abort",onAbort,{once:true});
    child.stdout?.on("data",(data)=>{stdout=(stdout+String(data)).slice(-maxStdoutBytes);});
    child.stderr?.on("data",(data)=>{stderr=(stderr+String(data)).slice(-maxStderrBytes);});
    child.once("error",(error)=>finish(null,null,error));
    child.once("exit",(code,signalName)=>finish(code,signalName));
    child.stdin?.on("error",()=>{});
    child.stdin?.end(stdin||undefined);
  });
}

export function createCodexReferenceExecutionAdapter({
  reference,executable="codex",providerVersion=null,adapterVersion="1.0.0",
  tempBase=tmpdir(),env=process.env,codeCommit="UNSPECIFIED",invokeImpl=runCodexReferenceProcess,
}={}){
  assert(reference?.manifest?.core_bundle_sha256===CODEX_REFERENCE_CORE_SHA256,"Codex adapter requires the locked Chat 4 core bundle hash");
  assert(hash(canonicalJson(reference.core_bundle))===reference.manifest.core_bundle_sha256,"Codex adapter core bundle bytes do not match manifest");
  assert(reference.core_bundle?.worker?.id==="siti","Codex reference worker must be Siti");
  assert(reference.core_bundle?.task?.employee_id==="siti","Codex reference task must target Siti");
  assert(reference.core_bundle?.task?.risk_class==="READ_ONLY","Codex reference task must remain READ_ONLY");
  assert(canonicalJson(reference.core_bundle.task.required_skills)===canonicalJson(PORTABILITY_REFERENCE_SKILLS),"Codex reference skill set drifted");
  assert(executableAllowed(executable),"Codex executable is not allowlisted");

  const states=new Map();
  const adapter=defineRuntimeExecutionAdapter({
    id:"codex-reference",
    version:adapterVersion,
    runtime:{provider:"codex",runtime_ref:"codex:ephemeral:read-only",provider_version:providerVersion},
    capabilities:["bounded_process","model_inference","temporary_workspace","evidence_collection"],
    side_effects:{install:false,login:false,account_mutation:false,production_repo_write:false,external_write:false,paid_action:false,destructive:false},
    process_contract:{shell:false,executable_allowlisted:true},

    async prepare({task}){
      assert(canonicalJson(task)===canonicalJson(reference.core_bundle.task),"Codex adapter task bytes differ from canonical Chat 4 task");
      const workspace=await mkdtemp(join(tempBase,"nyoba-codex-ref-"));
      const skillRoot=join(workspace,".agents","skills");
      await mkdir(skillRoot,{recursive:true});
      for(const skill of reference.core_bundle.skills){
        assert(PORTABILITY_REFERENCE_SKILLS.includes(skill.id),"unexpected skill in Codex reference bundle");
        const dir=join(skillRoot,skill.id);
        await mkdir(dir,{recursive:true});
        await writeFile(join(dir,"SKILL.md"),skill.content,"utf8");
      }
      await writeFile(join(workspace,"CORE-BUNDLE.json"),Buffer.from(canonicalJson(reference.core_bundle),"utf8"));
      await writeFile(join(workspace,"CORE-BUNDLE.sha256"),reference.manifest.core_bundle_sha256+"\n","utf8");
      await writeFile(join(workspace,"CANARY.txt"),"NYOBA_CODEX_REFERENCE_CANARY_V1\n","utf8");
      const baseline=await snapshotTree(workspace);
      states.set(workspace,{workspace,skillRoot,baseline,baseline_sha256:hash(baseline),prompt:renderCodexReferencePrompt(reference)});
      return {workspace:{kind:"TEMPORARY",ref:workspace,isolated:true,production_repo:false},session_ref:"codex:ephemeral:"+reference.manifest.core_bundle_sha256};
    },

    async executeBoundedTask({prepared,signal}){
      const state=states.get(prepared?.workspace?.ref);
      assert(state,"Codex staged workspace state missing");
      const args=["exec","--skip-git-repo-check","--sandbox","read-only","--ephemeral","--json","-"];
      const processResult=await invokeImpl({
        executable,args,stdin:state.prompt,cwd:state.workspace,
        env:{...env,NO_COLOR:"1"},signal,
      });
      return {
        status:processResult.status,signal:processResult.signal,aborted:Boolean(processResult.aborted),
        stdout:String(processResult.stdout||""),stderr:String(processResult.stderr||""),error:processResult.error||null,
      };
    },

    async normalizeResult({prepared,raw_result}){
      assert(states.has(prepared?.workspace?.ref),"Codex staged workspace state missing");
      if(raw_result?.status!==0||raw_result?.aborted||raw_result?.error){
        return {
          schema:1,state:"FAILED",summary:"Codex reference process did not complete successfully.",
          output:{process_status:raw_result?.status??null,aborted:Boolean(raw_result?.aborted)},
          artifact_refs:["sha256:"+hash(canonicalJson(raw_result))],
          evidence_refs:["core-bundle-sha256:"+reference.manifest.core_bundle_sha256],
        };
      }
      let payload;
      try{payload=validateReviewPayload(extractCodexReferencePayload(raw_result.stdout),reference);}
      catch{
        return {
          schema:1,state:"FAILED",summary:"Codex reference output did not satisfy the structural result contract.",
          output:{parse_state:"INVALID_REFERENCE_RESULT"},
          artifact_refs:["sha256:"+hash(canonicalJson(raw_result))],
          evidence_refs:["core-bundle-sha256:"+reference.manifest.core_bundle_sha256],
        };
      }
      return {
        schema:1,state:"SUCCEEDED",summary:"Codex returned a structurally valid Siti reference-case review.",
        output:payload,
        artifact_refs:["sha256:"+hash(canonicalJson(raw_result))],
        evidence_refs:["core-bundle-sha256:"+reference.manifest.core_bundle_sha256,"skill-bundle-sha256:"+reference.manifest.component_sha256.skill_bundle_sha256],
      };
    },

    async collectEvidence({prepared,raw_result,normalized_result}){
      const state=states.get(prepared?.workspace?.ref);
      assert(state,"Codex staged workspace state missing");
      const after=await snapshotTree(state.workspace);
      const afterSha=hash(after);
      const unchanged=after===state.baseline;
      return {
        schema:1,
        raw_result_ref:"sha256:"+hash(canonicalJson(raw_result)),
        normalized_result_ref:"sha256:"+hash(canonicalJson(normalized_result)),
        capabilities_used:["bounded_process","model_inference","temporary_workspace","evidence_collection"],
        workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:!unchanged},
        prohibited_action_check:{passed:unchanged,observed:unchanged?[]:["temporary workspace tree changed during Codex execution"]},
        runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},
        evidence_refs:[
          "core-bundle-sha256:"+reference.manifest.core_bundle_sha256,
          "workspace-before-sha256:"+state.baseline_sha256,
          "workspace-after-sha256:"+afterSha,
          "code-commit:"+codeCommit,
          "codex-sandbox:read-only",
          "codex-session:ephemeral",
          "codex-skill-root:.agents/skills",
        ],
        artifact_refs:["sha256:"+hash(canonicalJson(raw_result)),"sha256:"+hash(canonicalJson(normalized_result))],
      };
    },

    async cleanup({prepared}){
      const workspace=prepared?.workspace?.ref;
      if(!workspace) return {ok:true};
      try{await rm(workspace,{recursive:true,force:true});states.delete(workspace);return {ok:true};}
      catch{return {ok:false};}
    },
  });

  return Object.freeze({adapter,reference_case_id:reference.manifest.reference_case_id,core_bundle_sha256:reference.manifest.core_bundle_sha256,executable});
}
