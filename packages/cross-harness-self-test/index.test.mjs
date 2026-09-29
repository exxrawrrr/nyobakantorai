import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCrossHarnessPlan,
  buildHarnessInvocation,
  executeCrossHarnessSelfTest,
  expectedCrossHarnessPayload,
  extractHarnessPayload,
  renderCrossHarnessProbePrompt,
  renderCrossHarnessProbeSkill,
  stageCrossHarnessWorkspace,
  validateCrossHarnessSelfTestConfig,
  validateHarnessPayload,
} from "./index.mjs";

const config=JSON.parse(await readFile(new URL("../../config/cross-harness-self-test.json",import.meta.url),"utf8"));

function marker(){
  return config.probe_skill.result_marker+JSON.stringify(expectedCrossHarnessPayload(config));
}

test("cross-harness config is pinned and safety defaults fail closed",()=>{
  const result=validateCrossHarnessSelfTestConfig(config);
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(config.harnesses.length,4);
  assert.equal(config.safety.auto_install_forbidden,true);
  assert.equal(config.safety.auto_login_forbidden,true);
  assert.equal(config.safety.user_repo_execution_forbidden,true);
  assert.equal(config.safety.temp_workspace_required,true);

  const bad=structuredClone(config);
  bad.safety.tool_writes_forbidden=false;
  bad.harnesses[0].source_commit="bad";
  const failed=validateCrossHarnessSelfTestConfig(bad);
  assert.equal(failed.ok,false);
  assert.ok(failed.errors.some(x=>/tool_writes_forbidden/.test(x)));
  assert.ok(failed.errors.some(x=>/source_commit/.test(x)));
});

test("probe sentinel lives in the skill, not the task prompt",()=>{
  const skill=renderCrossHarnessProbeSkill(config);
  const prompt=renderCrossHarnessProbePrompt(config);
  assert.match(skill,/NYOBA_SKILL_ACTIVE_V1/);
  assert.equal(prompt.includes("NYOBA_SKILL_ACTIVE_V1"),false);
  assert.equal(prompt.includes(config.probe_skill.result_marker),false);
  for(const atom of config.task.protected_atoms) assert.ok(prompt.includes(atom));
});

test("staging is temporary and places skill in each harness-specific root",async()=>{
  const base=await mkdtemp(join(tmpdir(),"nyoba-xh-stage-"));
  try{
    for(const harness of config.harnesses){
      const staged=await stageCrossHarnessWorkspace({config,harness,tempBase:base});
      const skill=await readFile(join(staged.skillRoot,config.probe_skill.name,"SKILL.md"),"utf8");
      assert.match(skill,/Cross-Harness Probe/);
      assert.equal(await readFile(staged.canaryPath,"utf8"),"NYOBA_CROSS_HARNESS_CANARY_V1\n");
      await staged.cleanup();
    }
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});

test("invocations are non-interactive and use read-only or constrained modes where available",()=>{
  const prompt=renderCrossHarnessProbePrompt(config);
  for(const harness of config.harnesses){
    const inv=buildHarnessInvocation({harness,prompt,workspace:"/tmp/ws",skillRoot:"/tmp/skills"});
    assert.equal(inv.cwd,"/tmp/ws");
    assert.equal(inv.args.some(x=>String(x).includes("yolo")),false);
    assert.equal(inv.args.some(x=>String(x).includes("allow-all")),false);
    if(harness.id==="hermes"){
      assert.ok(inv.args.includes("--oneshot"));
      assert.ok(inv.args.includes("--ignore-rules"));
      assert.ok(inv.args.includes("--toolsets"));
      assert.equal(inv.env_overrides.HERMES_BUNDLED_SKILLS,"/tmp/skills");
      assert.equal(inv.stdin,prompt);
    }
    if(harness.id==="codex"){
      assert.ok(inv.args.includes("read-only"));
      assert.ok(inv.args.includes("--ephemeral"));
      assert.equal(inv.stdin,prompt);
    }
    if(harness.id==="gemini-cli"){
      assert.ok(inv.args.includes("--approval-mode=plan"));
      assert.ok(inv.args.includes("--skip-trust"));
    }
    if(harness.id==="github-copilot-cli"){
      assert.ok(inv.args.includes("--silent"));
      assert.ok(inv.args.includes("--output-format"));
    }
  }
});

test("payload parser handles text, JSON, and JSONL wrappers",()=>{
  const m=marker();
  assert.deepEqual(extractHarnessPayload(m,config.probe_skill.result_marker),expectedCrossHarnessPayload(config));
  assert.deepEqual(
    extractHarnessPayload(JSON.stringify({response:m}),config.probe_skill.result_marker),
    expectedCrossHarnessPayload(config)
  );
  const jsonl=JSON.stringify({type:"progress",message:"working"})+"\n"+JSON.stringify({type:"result",text:m})+"\n";
  assert.deepEqual(extractHarnessPayload(jsonl,config.probe_skill.result_marker),expectedCrossHarnessPayload(config));
  assert.throws(()=>extractHarnessPayload("done",config.probe_skill.result_marker),/marker missing/);
});

test("payload validation requires exact atoms and zero invented actions",()=>{
  const good=validateHarnessPayload(expectedCrossHarnessPayload(config),config);
  assert.equal(good.passed,true);

  const lost=structuredClone(expectedCrossHarnessPayload(config));
  lost.protected_atoms[1]="Rp1.750";
  assert.equal(validateHarnessPayload(lost,config).passed,false);

  const invented=structuredClone(expectedCrossHarnessPayload(config));
  invented.invented_actions=["deploy"];
  assert.equal(validateHarnessPayload(invented,config).passed,false);
});

test("plan is side-effect free and distinguishes installed commands without executing them",()=>{
  const plan=buildCrossHarnessPlan({
    config,
    commandMap:{hermes:"/fake/hermes",codex:"/fake/codex"}
  });
  assert.equal(plan.side_effect_free,true);
  assert.equal(plan.provider_calls,0);
  assert.equal(plan.targets.find(x=>x.id==="hermes").status,"READY_FOR_SELF_TEST");
  assert.equal(plan.targets.find(x=>x.id==="gemini-cli").status,"NOT_INSTALLED");
});

test("four injected harnesses can satisfy the same probe contract without raw-output persistence",async()=>{
  const base=await mkdtemp(join(tmpdir(),"nyoba-xh-pass-"));
  const commandMap=Object.fromEntries(config.harnesses.map(h=>[h.id,"/fake/"+h.id]));
  try{
    const report=await executeCrossHarnessSelfTest({
      config,
      commandMap,
      tempBase:base,
      invoke:async({harness})=>({
        status:0,signal:null,timed_out:false,duration_ms:7,
        stdout:JSON.stringify({harness:harness.id,response:marker()}),
        stderr:"api_key=SHOULD-NOT-BE-PERSISTED-123456",
        error:null
      })
    });
    assert.equal(report.claim_state,"COMPARISON_READY");
    assert.equal(report.summary.passed,4);
    assert.equal(report.summary.complete_selected_set,true);
    assert.ok(report.targets.every(x=>x.claim_state==="SELF_TEST_PASSED"));
    assert.ok(report.targets.every(x=>x.checks.workspace_canary_unchanged));
    assert.equal(JSON.stringify(report).includes("SHOULD-NOT-BE-PERSISTED"),false);
    assert.ok(report.targets.every(x=>x.evidence.raw_stdout_persisted===false));
    assert.ok(report.targets.every(x=>x.evidence.raw_stderr_persisted===false));
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});

test("missing harness stays NOT_RUN without blocking a truthful two-target comparison",async()=>{
  const base=await mkdtemp(join(tmpdir(),"nyoba-xh-partial-"));
  try{
    const report=await executeCrossHarnessSelfTest({
      config,
      selectedIds:["codex","gemini-cli","github-copilot-cli"],
      commandMap:{codex:"/fake/codex","gemini-cli":"/fake/gemini"},
      tempBase:base,
      invoke:async()=>({
        status:0,signal:null,timed_out:false,duration_ms:5,stdout:marker(),stderr:"",error:null
      })
    });
    assert.equal(report.summary.passed,2);
    assert.equal(report.summary.not_run,1);
    assert.equal(report.summary.comparison_ready,true);
    assert.equal(report.summary.complete_selected_set,false);
    assert.equal(report.targets.find(x=>x.id==="github-copilot-cli").claim_state,"UNPROVEN");
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});

test("wrong skill sentinel forces SELF_TEST_FAILED",async()=>{
  const base=await mkdtemp(join(tmpdir(),"nyoba-xh-wrong-"));
  try{
    const payload=structuredClone(expectedCrossHarnessPayload(config));
    payload.skill_sentinel="FORGED";
    const report=await executeCrossHarnessSelfTest({
      config,
      selectedIds:["codex"],
      commandMap:{codex:"/fake/codex"},
      tempBase:base,
      invoke:async()=>({
        status:0,signal:null,timed_out:false,duration_ms:5,
        stdout:config.probe_skill.result_marker+JSON.stringify(payload),stderr:"",error:null
      })
    });
    assert.equal(report.targets[0].claim_state,"SELF_TEST_FAILED");
    assert.equal(report.targets[0].checks.skill_activated,false);
    assert.equal(report.claim_state,"UNPROVEN");
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});

test("canary mutation overrides otherwise valid model output",async()=>{
  const base=await mkdtemp(join(tmpdir(),"nyoba-xh-mutate-"));
  try{
    const report=await executeCrossHarnessSelfTest({
      config,
      selectedIds:["gemini-cli"],
      commandMap:{"gemini-cli":"/fake/gemini"},
      tempBase:base,
      invoke:async({cwd})=>{
        await writeFile(join(cwd,"CANARY.txt"),"MUTATED\n","utf8");
        return {status:0,signal:null,timed_out:false,duration_ms:5,stdout:marker(),stderr:"",error:null};
      }
    });
    assert.equal(report.targets[0].checks.workspace_canary_unchanged,false);
    assert.equal(report.targets[0].claim_state,"SELF_TEST_FAILED");
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});

test("non-zero process or missing marker cannot be greenwashed",async()=>{
  const base=await mkdtemp(join(tmpdir(),"nyoba-xh-fail-"));
  try{
    const report=await executeCrossHarnessSelfTest({
      config,
      selectedIds:["hermes","codex"],
      commandMap:{hermes:"/fake/hermes",codex:"/fake/codex"},
      tempBase:base,
      invoke:async({harness})=>harness.id==="hermes"
        ? {status:1,signal:null,timed_out:false,duration_ms:4,stdout:marker(),stderr:"failed",error:null}
        : {status:0,signal:null,timed_out:false,duration_ms:4,stdout:"no marker",stderr:"",error:null}
    });
    assert.equal(report.summary.failed,2);
    assert.equal(report.claim_state,"UNPROVEN");
    assert.ok(report.targets.every(x=>x.claim_state==="SELF_TEST_FAILED"));
  }finally{
    await rm(base,{recursive:true,force:true});
  }
});
