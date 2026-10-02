import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assessV07ConnectedEvidence,
  assessV07ConnectedEvidenceInputs,
} from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");
const readJson=async(path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));

test("canonical CHAT 22 evidence truthfully reports partial connected-office proof and blocked live release evidence",async()=>{
  const result=await assessV07ConnectedEvidence({root});
  assert.equal(result.ok,true);
  assert.equal(result.candidate,"v0.7.0");
  assert.equal(result.connected_office_decision,"BLOCKED");

  assert.equal(result.components.SCOPED_WRITE_FLOW,"PASS");
  assert.equal(result.components.CONNECTOR_REVOCATION,"PASS");
  assert.equal(result.components.SCHEDULED_MISSION,"PASS");

  assert.equal(result.components.READ_ONLY_USER_OWNED_CONNECTORS,"BLOCKED");
  assert.equal(result.components.LIVE_BROWSER,"BLOCKED");
  assert.deepEqual(result.blockers,["READ_ONLY_USER_OWNED_CONNECTORS","LIVE_BROWSER"]);

  assert.equal(result.write.issue_number,44);
  assert.equal(result.write.final_state,"closed");
  assert.equal(result.write.direct_readback,true);
  assert.equal(result.write.approval_preceded_execution,true);
  assert.equal(result.revocation.pre_revocation_allowed,true);
  assert.equal(result.revocation.post_revocation_allowed,false);
  assert.equal(result.revocation.post_revocation_reason,"CONNECTOR_REVOKED");
  assert.equal(result.scheduled.dispatch_reason,"NORMAL_MISSION_ENGINE");
  assert.equal(result.scheduled.mission_state,"PLANNED");
  assert.equal(result.scheduled.autonomy_mode,"GUARDED");
  assert.equal(result.scheduled.production_daemon_delivery_claim,false);
  assert.equal(result.claim_boundary.external_read_observations_are_runtime_grants,false);
  assert.equal(result.claim_boundary.provider_credential_revocation_claim,false);
  assert.equal(result.claim_boundary.production_scheduler_daemon_claim,false);
  assert.equal(result.claim_boundary.browser_live_claim,false);
});

test("two live user-owned reads are preserved as observations but fail read-only criterion when permission mode is unproven",async()=>{
  const result=await assessV07ConnectedEvidence({root});
  assert.equal(result.read_only.observed_count,2);
  assert.equal(result.read_only.distinct_provider_count,2);
  assert.deepEqual(result.read_only.providers,["github","google-drive"]);
  assert.equal(result.read_only.status,"BLOCKED");
  assert.ok(result.read_only.errors.some(x=>/github-user-repo-read: connector permission mode is not verified READ_ONLY/.test(x)));
  assert.ok(result.read_only.errors.some(x=>/google-drive-metadata-read: connector permission mode is not verified READ_ONLY/.test(x)));
});

test("write evidence proves committed preview/approval preceded external execution and both create/close were scoped",async()=>{
  const result=await assessV07ConnectedEvidence({root});
  assert.equal(result.write.status,"PASS");
  assert.match(result.write.approval_ref,/^approval-request:sha256:[a-f0-9]{64}$/);
  assert.match(result.write.decision_ref,/^approval-decision:sha256:[a-f0-9]{64}$/);
  assert.equal(result.write.create_authorized,true);
  assert.equal(result.write.close_authorized,true);
  assert.equal(result.write.issue_url,"https://github.com/exxrawrrr/nyobakantorai/issues/44");
});

test("approval chronology tampering fails closed",async()=>{
  const [config,costPolicy,registry]=await Promise.all([
    readJson("config/v0.7-connected-live-evidence.json"),
    readJson("config/cost-governor-policy.json"),
    readJson("config/connector-registry.json"),
  ]);
  const tampered=structuredClone(config);
  tampered.write_flow.approval.plan_commit_at="2026-10-02T07:38:30.000Z";
  assert.throws(()=>assessV07ConnectedEvidenceInputs({config:tampered,costPolicy,registry}),/Approval plan commit must precede external write/);
});

test("browser cannot become PASS by changing the verdict field alone",async()=>{
  const [config,costPolicy,registry]=await Promise.all([
    readJson("config/v0.7-connected-live-evidence.json"),
    readJson("config/cost-governor-policy.json"),
    readJson("config/connector-registry.json"),
  ]);
  const forged=structuredClone(config);
  forged.browser_evidence.state="PASS";
  delete forged.browser_evidence.live_observed;
  delete forged.browser_evidence.provider;
  delete forged.browser_evidence.observed_at;
  delete forged.browser_evidence.evidence_ref;
  delete forged.browser_evidence.disposable_profile;
  delete forged.browser_evidence.read_only_action;
  delete forged.browser_evidence.provider_verified;
  const result=assessV07ConnectedEvidenceInputs({config:forged,costPolicy,registry});
  assert.equal(result.browser.status,"BLOCKED");
  assert.equal(result.connected_office_decision,"BLOCKED");
  assert.ok(result.blockers.includes("LIVE_BROWSER"));
});

test("read-only connector requirement cannot be bypassed by marking observations live while leaving broader permissions",async()=>{
  const [config,costPolicy,registry]=await Promise.all([
    readJson("config/v0.7-connected-live-evidence.json"),
    readJson("config/cost-governor-policy.json"),
    readJson("config/connector-registry.json"),
  ]);
  const forged=structuredClone(config);
  for(const item of forged.read_only_observations){
    item.live_observed=true;
    item.reviewed_live_lifecycle=true;
    item.permission_mode_verified="UNKNOWN_OR_BROADER";
  }
  const result=assessV07ConnectedEvidenceInputs({config:forged,costPolicy,registry});
  assert.equal(result.read_only.status,"BLOCKED");
  assert.equal(result.components.READ_ONLY_USER_OWNED_CONNECTORS,"BLOCKED");
});

test("scheduled mission binds both live connector observation IDs and remains normal guarded Mission Engine work",async()=>{
  const result=await assessV07ConnectedEvidence({root});
  assert.deepEqual(result.scheduled.live_connector_observations_bound,[
    "github-user-repo-read",
    "google-drive-metadata-read",
  ]);
  assert.match(result.scheduled.schedule_ref,/^schedule:sha256:[a-f0-9]{64}$/);
  assert.match(result.scheduled.run_ref,/^schedule-run:sha256:[a-f0-9]{64}$/);
  assert.ok(result.scheduled.mission_id.startsWith("scheduled-chat22-connected-read-briefing-"));
  assert.match(result.scheduled.cost_decision_ref,/^cost-decision:sha256:[a-f0-9]{64}$/);
});

test("application-level revocation remains explicitly narrower than upstream credential revocation",async()=>{
  const result=await assessV07ConnectedEvidence({root});
  assert.equal(result.revocation.status,"PASS");
  assert.equal(result.revocation.provider_credential_revocation_claim,false);
  assert.match(result.revocation.boundary,/does not claim the upstream provider credential itself was revoked/);
});
