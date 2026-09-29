import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root=resolve(import.meta.dirname,"..");
const run=(args,env={})=>spawnSync(process.execPath,args,{cwd:root,encoding:"utf8",windowsHide:true,env:{...process.env,...env}});

test("provider doctor JSON CLI is parseable and side-effect-free",()=>{
  const result=run(["scripts/provider-doctor.mjs","--json","--provider","playwright-mcp"]);
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.side_effect_free,true);
  assert.equal(data.credentials_exposed,false);
  assert.equal(data.providers.length,1);
  assert.equal(data.providers[0].id,"playwright-mcp");
  assert.equal(data.providers[0].self_test_state,"NOT_RUN");
});

test("provider doctor requirement flag fails closed",()=>{
  const result=run(["scripts/provider-doctor.mjs","--json","--provider","browser-use","--require-ready","browser-use"],{
    PATH:process.env.PATH || "",
    BROWSER_USE_API_KEY:"",
  });
  if(result.status===0) {
    const data=JSON.parse(result.stdout);
    assert.equal(data.providers[0].readiness,"READY_FOR_SELF_TEST");
  } else {
    assert.equal(result.status,1);
    const data=JSON.parse(result.stdout);
    assert.equal(data.requirements.ok,false);
  }
});

test("real-task recorder status CLI initializes no provider or network side effect",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-cli-"));
  const ledger=join(dir,"ledger.jsonl");
  const result=run(["scripts/real-task-recorder.mjs","status","--ledger",ledger]);
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.ok,true);
  assert.equal(data.events,0);
  assert.equal(data.cases,0);
  assert.equal(data.verified,0);
  assert.equal(data.ledger,resolve(ledger));
});
