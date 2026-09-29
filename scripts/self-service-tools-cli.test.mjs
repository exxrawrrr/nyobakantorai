import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root=resolve(import.meta.dirname,"..");
const run=(args,options={})=>{
  const structured=Object.prototype.hasOwnProperty.call(options,"env") || Object.prototype.hasOwnProperty.call(options,"input");
  const env=structured?(options.env||{}):options;
  const input=structured?options.input:undefined;
  return spawnSync(process.execPath,args,{cwd:root,encoding:"utf8",windowsHide:true,input,env:{...process.env,...env}});
};

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


test("provider doctor CLI never prints credential values",()=>{
  const secret="CLI-SECRET-MUST-NOT-LEAK-123456";
  const result=run(["scripts/provider-doctor.mjs","--json","--provider","cognee"],{
    env:{COGNEE_API_KEY:secret}
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout.includes(secret),false);
  assert.equal(result.stderr.includes(secret),false);
  const data=JSON.parse(result.stdout);
  assert.equal(data.catalog_valid,true);
  assert.equal(data.credentials_exposed,false);
  assert.equal(data.providers[0].evidence.configuration_signal_count,1);
});

test("real-task recorder CLI completes a full verified lifecycle and exports one case",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"nyoba-recorder-e2e-"));
  const ledger=join(dir,"ledger.jsonl");
  const out=join(dir,"dataset.json");

  const start=run(["scripts/real-task-recorder.mjs","start","--ledger",ledger,"--stdin"],{
    input:JSON.stringify({
      case_id:"cli-real-001",
      source_type:"owner_real_task",
      source_ref:"owner-task://cli/001",
      source_generated:false,
      source_attestation:"OWNER_DIRECT",
      employee_id:"subagjo",
      task_summary:"Implement and verify a real repository change with redacted evidence.",
      redaction_reviewed:true
    })
  });
  assert.equal(start.status,0,start.stderr);
  assert.equal(JSON.parse(start.stdout).case_id,"cli-real-001");

  const finish=run(["scripts/real-task-recorder.mjs","finish","--ledger",ledger,"--stdin"],{
    input:JSON.stringify({
      case_id:"cli-real-001",
      success:true,
      evidence_refs:["commit://cli-real-001"],
      human_intervention:0,
      retries:0,
      cost_known:false,
      recovered_after_failure:false,
      outcome_note:"Implementation completed and deterministic checks passed."
    })
  });
  assert.equal(finish.status,0,finish.stderr);

  const verify=run(["scripts/real-task-recorder.mjs","verify","--ledger",ledger,"--stdin"],{
    input:JSON.stringify({
      case_id:"cli-real-001",
      reviewer_employee_id:"siti",
      verification_passed:true,
      false_success:false,
      evidence_complete:true,
      evidence_refs:["ci://cli-real-001"],
      verification_note:"Independent verification accepted the evidence."
    })
  });
  assert.equal(verify.status,0,verify.stderr);

  const validate=run(["scripts/real-task-recorder.mjs","validate","--ledger",ledger]);
  assert.equal(validate.status,0,validate.stderr);
  assert.equal(JSON.parse(validate.stdout).events,3);

  const exported=run(["scripts/real-task-recorder.mjs","export","--ledger",ledger,"--out",out]);
  assert.equal(exported.status,0,exported.stderr);
  const exportSummary=JSON.parse(exported.stdout);
  assert.equal(exportSummary.cases,1);
  assert.equal(exportSummary.false_successes,0);
  assert.equal(exportSummary.acceptance_passed,false);
});


test("browser self-test plan CLI is side-effect free and claim-limited",()=>{
  const result=run(["scripts/browser-self-test.mjs","plan","--json"]);
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.provider_id,"browser-use");
  assert.equal(data.pinned_package_version,"0.13.10");
  assert.ok(Array.isArray(data.forbidden));
  assert.ok(data.forbidden.includes("automatic package installation"));
  assert.ok(data.forbidden.includes("reuse of the user's normal browser profile"));
  assert.match(data.claim_limit,/not agent-mode\/model quality proof/i);
});


test("Cognee self-test plan CLI is side-effect free, key-safe, and remote-fail-closed",()=>{
  const secret="COGNEE-CLI-SECRET-123456789";
  const local=run(["scripts/cognee-self-test.mjs","plan","--json"],{
    env:{COGNEE_BASE_URL:"http://127.0.0.1:8011",COGNEE_API_KEY:secret}
  });
  assert.equal(local.status,0,local.stderr);
  assert.equal(local.stdout.includes(secret),false);
  assert.equal(local.stderr.includes(secret),false);
  const localData=JSON.parse(local.stdout);
  assert.equal(localData.provider_id,"cognee-hermes");
  assert.equal(localData.provider_call_performed,false);
  assert.equal(localData.endpoint_reachability,"NOT_CHECKED");
  assert.equal(localData.target_scope,"LOOPBACK");

  const remote=run(["scripts/cognee-self-test.mjs","plan","--json","--base-url","https://memory.example.test"],{
    env:{COGNEE_API_KEY:secret}
  });
  assert.equal(remote.status,0,remote.stderr);
  const remoteData=JSON.parse(remote.stdout);
  assert.equal(remoteData.configuration_ready,false);
  assert.equal(remoteData.target_scope,"REMOTE");
  assert.equal(remoteData.api_key_present,true);
  assert.equal(remoteData.remote_opt_in,false);
});
