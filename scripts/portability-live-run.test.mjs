import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"..");
const script=resolve(root,"scripts","portability-live-run.mjs");

test("live-run plan discloses canonical Live Sandbox policy and declaration",()=>{
  const run=spawnSync(process.execPath,[script,"plan","--runtime","codex"],{
    cwd:root,
    encoding:"utf8",
    windowsHide:true,
    shell:false,
    env:process.env,
  });
  assert.equal(run.status,0,run.stderr||run.stdout);
  const plan=JSON.parse(run.stdout);
  assert.equal(plan.runtime,"codex");
  assert.equal(plan.sandbox.policy_id,"v0-6-live-sandbox");
  assert.equal(plan.sandbox.declaration.provider_id,"codex");
  assert.equal(plan.sandbox.declaration.task_id,plan.reference_task_id);
  assert.equal(plan.sandbox.declaration.risk_class,"READ_ONLY");
  assert.deepEqual(plan.sandbox.declaration.fallback_models,[]);
  assert.equal(plan.sandbox.declaration.credentials_exposed_to_task,false);
  assert.deepEqual(plan.sandbox.declaration.projected_usage.cost,{status:"UNKNOWN",amount_usd:null});
});

test("live-run plan never claims a model identity when the canonical runtime adapter does not expose one",()=>{
  const run=spawnSync(process.execPath,[script,"plan","--runtime","codex"],{
    cwd:root,
    encoding:"utf8",
    windowsHide:true,
    shell:false,
    env:process.env,
  });
  assert.equal(run.status,0,run.stderr||run.stdout);
  const plan=JSON.parse(run.stdout);
  assert.deepEqual(plan.sandbox.declaration.model_identity,{status:"UNKNOWN",model_id:null});
});
