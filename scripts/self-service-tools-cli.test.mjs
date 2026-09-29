import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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


test("cross-harness plan CLI is side-effect free and never upgrades detection into parity proof",()=>{
  const result=run(["scripts/cross-harness-self-test.mjs","plan","--json","--target","hermes,codex,gemini-cli,github-copilot-cli"]);
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.side_effect_free,true);
  assert.equal(data.provider_calls,0);
  assert.equal(data.auto_install,false);
  assert.equal(data.auto_login,false);
  assert.equal(data.targets.length,4);
  assert.ok(data.targets.every((x)=>x.provider_call_performed===false));
  assert.ok(data.targets.every((x)=>["READY_FOR_SELF_TEST","NOT_INSTALLED"].includes(x.status)));
  assert.match(data.claim_limit,/neither state proves all canonical skills/i);
});


test("real-task baseline CLI reports current 1/20 without mutating canonical data",()=>{
  const result=run(["scripts/real-task-baseline.mjs","status"]);
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.valid,true);
  assert.equal(data.cases,1);
  assert.equal(data.remaining,19);
  assert.equal(data.false_successes,0);
  assert.equal(data.publication_gate_passed,false);
});

test("real-task baseline CLI rejects automatic publication",()=>{
  const result=run(["scripts/real-task-baseline.mjs","publish"]);
  assert.equal(result.status,1);
  assert.match(result.stderr,/automatic publication is forbidden/i);
});

test("real-task baseline CLI audits and merges a valid recorder snapshot only to a separate candidate",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"nyoba-baseline-cli-"));
  const snapshotPath=join(dir,"snapshot.json");
  const candidatePath=join(dir,"candidate.json");
  const snapshot={
    schema:1,
    status:"COLLECTING",
    claim_state:"COLLECTING",
    note:"CLI real-task snapshot.",
    environment:{runtime:"cli-test"},
    cases:[{
      case_id:"cli-baseline-real-002",
      source_type:"owner_real_task",
      source_ref:"owner-task://cli-baseline/002",
      source_generated:false,
      employee_id:"subagjo",
      task_summary:"Redacted real owner task for baseline CLI integration coverage.",
      evidence_refs:["receipt://cli-baseline/002","review://cli-baseline/002"],
      redaction_reviewed:true,
      started_at:"2026-09-29T09:00:00.000Z",
      finished_at:"2026-09-29T09:01:00.000Z",
      metrics:{
        success:true,
        evidence_complete:true,
        false_success:false,
        human_intervention:0,
        retries:0,
        duration_ms:60000,
        cost_known:false,
        verification_passed:true,
        recovered_after_failure:false
      },
      outcome_note:"Task completed and independent verification passed."
    }],
    summary:{
      acceptance_passed:false,
      eligible_cases:1,
      minimum_cases_required:20,
      task_successes:1,
      verification_passes:1,
      false_successes:0,
      note:"Recorder export."
    }
  };
  await writeFile(snapshotPath,JSON.stringify(snapshot,null,2));

  const audit=run(["scripts/real-task-baseline.mjs","audit","--snapshot",snapshotPath]);
  assert.equal(audit.status,0,audit.stderr);
  assert.equal(JSON.parse(audit.stdout).snapshots[0].ok,true);

  const merge=run(["scripts/real-task-baseline.mjs","merge","--snapshot",snapshotPath,"--out",candidatePath]);
  assert.equal(merge.status,0,merge.stderr);
  const result=JSON.parse(merge.stdout);
  assert.equal(result.canonical_mutated,false);
  assert.equal(result.coverage.cases,2);
  assert.equal(result.coverage.remaining,18);

  const candidate=JSON.parse(await readFile(candidatePath,"utf8"));
  assert.equal(candidate.status,"COLLECTING");
  assert.equal(candidate.claim_state,"COLLECTING");
  assert.equal(candidate.cases.length,2);
});


test("fresh-install one-worker CLI reports deterministic isolated success",()=>{
  const result=run(["scripts/fresh-install-matrix.mjs","--employee=siti","--json"]);
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.matrix_case,"fresh-install-one-worker");
  assert.equal(data.claim_state,"DETERMINISTICALLY_VERIFIED");
  assert.equal(data.passed,true);
  assert.deepEqual(data.installed_profiles,["siti"]);
  assert.deepEqual(data.rerun_profiles,["siti"]);
  assert.equal(data.first_action,"install");
  assert.equal(data.rerun_action,"native-upgrade");
  assert.equal(data.user_owned_state_preserved,true);
  assert.equal(data.unrelated_profiles_installed,false);
  assert.equal(data.external_provider_calls,0);
  assert.equal(data.hermes_cli_executed,false);
  assert.equal(data.real_machine_claim,false);
});


test("subset fresh-install CLI installs only the engineering preset and removes only Bimo",()=>{
  const result=run(["scripts/fresh-install-matrix.mjs","--mode=subset","--employees=engineering","--remove=bimo","--json"]);
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.matrix_case,"fresh-install-subset-workers");
  assert.equal(data.passed,true);
  assert.deepEqual(data.selected_profiles,["subagjo","siti","bimo"]);
  assert.deepEqual(data.installed_profiles,["bimo","siti","subagjo"]);
  assert.equal(data.only_selected_profiles_installed,true);
  assert.equal(data.capability_isolation_passed,true);
  assert.equal(data.removal.preview_action,"PREVIEW_ONLY");
  assert.equal(data.removal.confirmed_action,"DELETE_PROFILE_AND_USER_STATE");
  assert.equal(data.removal.requested_profile,"bimo");
  assert.deepEqual(data.removal.remaining_profiles,["siti","subagjo"]);
  assert.equal(data.survivor_profiles_preserved,true);
  assert.equal(data.external_provider_calls,0);
  assert.equal(data.hermes_cli_executed,false);
  assert.equal(data.real_machine_claim,false);
});
