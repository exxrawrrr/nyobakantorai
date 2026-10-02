import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentInstallPlan, parseAgentInstallArgs } from "./ai-installer.mjs";

test("AI installer is plan-only and stable by default",()=>{
  const options=parseAgentInstallArgs([]);
  const plan=buildAgentInstallPlan(options,{platform:"linux",repoRoot:"/repo"});
  assert.equal(options.apply,false);
  assert.equal(plan.mode,"PLAN_ONLY");
  assert.equal(plan.channel,"stable");
  assert.equal(plan.immutable_source_required,true);
  assert.equal(plan.safety.no_main_fallback_from_stable,true);
  assert.equal(plan.safety.no_secret_input,true);
  assert.equal(plan.command.executable,"bash");
});

test("explicit apply preserves bounded stable selection",()=>{
  const options=parseAgentInstallArgs(["--apply","--with-hermes","--employees","siti,praroro","--version","v0.5.1"]);
  const plan=buildAgentInstallPlan(options,{platform:"win32",repoRoot:"C:\\repo"});
  assert.equal(plan.mode,"APPLY");
  assert.equal(plan.version,"v0.5.1");
  assert.equal(plan.selected_employees,"siti,praroro");
  assert.ok(plan.command.args.includes("-WithHermes"));
  assert.ok(plan.command.args.includes("v0.5.1"));
});

test("stable channel cannot be mixed with a mutable ref",()=>{
  assert.throws(
    ()=>parseAgentInstallArgs(["--channel","stable","--ref","main"]),
    /requires --channel development/
  );
});

test("development channel rejects stable version mixing",()=>{
  assert.throws(
    ()=>parseAgentInstallArgs(["--channel","development","--version","v0.5.1"]),
    /only valid for the stable channel/
  );
});

test("unsafe employee selector is rejected before execution",()=>{
  assert.throws(
    ()=>parseAgentInstallArgs(["--employees","siti;rm -rf /"]),
    /comma-separated selector/
  );
});
