import test from "node:test";
import assert from "node:assert/strict";
import {
  createExecutionReceiptPayload,
  generateReceiptKeyPair,
  signExecutionReceipt,
  verifyExecutionReceipt,
} from "../execution-receipt/index.mjs";

const now=new Date("2026-09-29T04:20:00.000Z");

function payload({finished_at="2026-09-29T04:10:00.000Z",provider="meta-ads",runtime_ref="runtime://meta/task-42"}={}){
  return createExecutionReceiptPayload({
    receipt_id:"receipt.maya.trust01",
    task_id:"task-42",
    employee_id:"maya",
    action:"Verify trust-registry lifecycle behavior",
    capability_id:"ads.meta.write",
    risk_class:"PAID_ACTION",
    autonomy:"GUARDED",
    authorization:{allowed:true,reason:"OWNER_APPROVED",approval_ref:"approval://task-42/owner"},
    started_at:"2026-09-29T04:09:00.000Z",
    finished_at,
    result:{state:"SUCCEEDED",summary:"Completed.",artifact_refs:[],evidence_refs:["runtime://meta/task-42"]},
    runtime:{provider,runtime_ref,provider_version:"fixture"},
    usage:{input_tokens:1,output_tokens:1,cost_known:false,cost_amount:null,currency:null},
  });
}

function entry(keys,overrides={}){
  return {
    key_id:"key:active",
    public_key_pem:keys.public_key_pem,
    status:"ACTIVE",
    signer_identity:"runtime signer",
    key_owner:"owner-security",
    generation_boundary:"outside repository",
    storage_expectation:"private key stays in signer-owned secret storage",
    valid_from:"2026-09-29T04:00:00.000Z",
    valid_until:null,
    runtime_provider_scope:["meta-ads"],
    runtime_ref_prefixes:["runtime://meta/"],
    revoked_at:null,
    compromise_cutoff:null,
    revocation_reason:null,
    historical_policy:"ALLOW_WITHIN_VALIDITY",
    ...overrides,
  };
}

function registry(keys,overrides={}){
  return {schema:1,registry_id:"integration-registry-v1",keys:[entry(keys,overrides)]};
}

test("valid signature plus ACTIVE registry trust verifies",()=>{
  const keys=generateReceiptKeyPair();
  const envelope=signExecutionReceipt(payload(),{privateKeyPem:keys.private_key_pem,keyId:"key:active"});
  const result=verifyExecutionReceipt(envelope,{trustRegistry:registry(keys),now});
  assert.equal(result.ok,true);
});

test("registry lifecycle takes precedence over legacy publicKeys map",()=>{
  const keys=generateReceiptKeyPair();
  const envelope=signExecutionReceipt(payload(),{privateKeyPem:keys.private_key_pem,keyId:"key:active"});
  const revoked=registry(keys,{
    status:"REVOKED",
    historical_policy:"REJECT_ALL",
    revoked_at:"2026-09-29T04:15:00.000Z",
    revocation_reason:"compromised",
  });
  const result=verifyExecutionReceipt(envelope,{
    publicKeys:{"key:active":keys.public_key_pem},
    trustRegistry:revoked,
    now,
  });
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("KEY_REVOKED"));
  assert.equal(result.reasons.includes("UNTRUSTED_KEY_ID"),false);
});

test("retired key keeps historical receipt valid inside explicit validity window",()=>{
  const keys=generateReceiptKeyPair();
  const envelope=signExecutionReceipt(payload({finished_at:"2026-09-29T04:10:00.000Z"}),{privateKeyPem:keys.private_key_pem,keyId:"key:active"});
  const retired=registry(keys,{
    status:"RETIRED",
    valid_until:"2026-09-29T04:15:00.000Z",
  });
  const result=verifyExecutionReceipt(envelope,{trustRegistry:retired,now});
  assert.equal(result.ok,true);
});

test("runtime scope blocks cryptographically valid receipt outside key scope",()=>{
  const keys=generateReceiptKeyPair();
  const envelope=signExecutionReceipt(payload({provider:"hermes",runtime_ref:"hermes:task:42"}),{privateKeyPem:keys.private_key_pem,keyId:"key:active"});
  const result=verifyExecutionReceipt(envelope,{trustRegistry:registry(keys),now});
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("KEY_RUNTIME_PROVIDER_NOT_ALLOWED"));
  assert.ok(result.reasons.includes("KEY_RUNTIME_REF_NOT_ALLOWED"));
});
