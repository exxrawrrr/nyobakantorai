import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  createExecutionReceiptPayload,
  executionReceiptRef,
  generateReceiptKeyPair,
  signExecutionReceipt,
  verifyExecutionReceipt,
} from "./index.mjs";

const now = new Date("2026-09-29T03:45:00.000Z");

function basePayload(overrides = {}) {
  return createExecutionReceiptPayload({
    receipt_id:"receipt.maya.0001",
    task_id:"task-42",
    employee_id:"maya",
    action:"Update approved Meta campaign budget",
    capability_id:"ads.meta.write",
    risk_class:"PAID_ACTION",
    autonomy:"GUARDED",
    authorization:{
      allowed:true,
      reason:"CONNECTED_AND_OWNER_APPROVED",
      approval_ref:"approval://task-42/owner",
    },
    started_at:"2026-09-29T03:40:00.000Z",
    finished_at:"2026-09-29T03:41:00.000Z",
    result:{
      state:"SUCCEEDED",
      summary:"Budget update completed and provider read-back matched.",
      artifact_refs:["artifact://meta/change-42.json"],
      evidence_refs:["runtime://meta/change-42","test://readback/change-42"],
    },
    runtime:{
      provider:"meta-ads",
      runtime_ref:"runtime://meta/change-42",
      provider_version:"test-fixture",
    },
    usage:{
      input_tokens:1200,
      output_tokens:240,
      cost_known:true,
      cost_amount:0.031,
      currency:"USD",
    },
    ...overrides,
  });
}

test("canonical JSON is stable across object key order", () => {
  const a = canonicalJson({ b:2, a:{ z:3, y:1 } });
  const b = canonicalJson({ a:{ y:1, z:3 }, b:2 });
  assert.equal(a, b);
});

test("signed execution receipt verifies with trusted key and exact bindings", () => {
  const keys = generateReceiptKeyPair();
  const payload = basePayload();
  const envelope = signExecutionReceipt(payload, {
    privateKeyPem:keys.private_key_pem,
    keyId:"local:test-key",
  });
  const result = verifyExecutionReceipt(envelope, {
    publicKeys:{ "local:test-key":keys.public_key_pem },
    now,
    requiredTaskId:"task-42",
    requiredEmployeeId:"maya",
    requiredCapabilityId:"ads.meta.write",
    requiredResultStates:["SUCCEEDED"],
  });
  assert.equal(result.ok, true);
  assert.equal(result.decision, "VALID");
  assert.equal(result.receipt_ref, executionReceiptRef(envelope));
  assert.match(result.receipt_ref, /^receipt:sha256:[a-f0-9]{64}$/);
});

test("payload tampering breaks hash/signature verification", () => {
  const keys = generateReceiptKeyPair();
  const envelope = signExecutionReceipt(basePayload(), {
    privateKeyPem:keys.private_key_pem,
    keyId:"local:test-key",
  });
  const tampered = structuredClone(envelope);
  tampered.payload.result.summary = "Actually changed a different budget.";
  const result = verifyExecutionReceipt(tampered, {
    publicKeys:{ "local:test-key":keys.public_key_pem },
    now,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("PAYLOAD_HASH_MISMATCH"));
  assert.ok(result.reasons.includes("SIGNATURE_INVALID"));
});

test("unknown signing key fails closed", () => {
  const keys = generateReceiptKeyPair();
  const envelope = signExecutionReceipt(basePayload(), {
    privateKeyPem:keys.private_key_pem,
    keyId:"local:unknown",
  });
  const result = verifyExecutionReceipt(envelope, {
    publicKeys:{},
    now,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("UNTRUSTED_KEY_ID"));
});

test("receipt binding rejects wrong task worker capability and result state", () => {
  const keys = generateReceiptKeyPair();
  const envelope = signExecutionReceipt(basePayload(), {
    privateKeyPem:keys.private_key_pem,
    keyId:"local:test-key",
  });
  const result = verifyExecutionReceipt(envelope, {
    publicKeys:{ "local:test-key":keys.public_key_pem },
    now,
    requiredTaskId:"task-other",
    requiredEmployeeId:"gugun",
    requiredCapabilityId:"ads.google.write",
    requiredResultStates:["FAILED"],
  });
  assert.equal(result.ok, false);
  for (const code of [
    "TASK_BINDING_MISMATCH",
    "EMPLOYEE_BINDING_MISMATCH",
    "CAPABILITY_BINDING_MISMATCH",
    "RESULT_STATE_NOT_ALLOWED",
  ]) assert.ok(result.reasons.includes(code));
});

test("high-impact successful receipt requires explicit approval reference", () => {
  assert.throws(
    () => basePayload({ authorization:{ allowed:true, reason:"approved", approval_ref:null } }),
    /requires approval_ref/
  );
});

test("unknown cost cannot smuggle an amount or currency", () => {
  assert.throws(
    () => basePayload({
      usage:{ input_tokens:10, output_tokens:5, cost_known:false, cost_amount:2.5, currency:"USD" },
    }),
    /unknown cost must not claim cost_amount/
  );
});

test("blocked receipt may record authorization denial without pretending execution succeeded", () => {
  const payload = basePayload({
    authorization:{ allowed:false, reason:"OWNER_APPROVAL_REQUIRED", approval_ref:null },
    result:{
      state:"BLOCKED",
      summary:"Execution did not start because owner approval was missing.",
      artifact_refs:[],
      evidence_refs:["approval://task-42/pending"],
    },
    usage:{ input_tokens:null, output_tokens:null, cost_known:false, cost_amount:null, currency:null },
  });
  assert.equal(payload.result.state, "BLOCKED");
  assert.equal(payload.authorization.allowed, false);
});

test("non-blocked result cannot claim execution without authorization", () => {
  assert.throws(
    () => basePayload({
      authorization:{ allowed:false, reason:"OWNER_APPROVAL_REQUIRED", approval_ref:null },
      result:{
        state:"FAILED",
        summary:"Attempt failed.",
        artifact_refs:[],
        evidence_refs:[],
      },
    }),
    /requires authorization.allowed=true/
  );
});

test("secret-like content is rejected before signing", () => {
  assert.throws(
    () => basePayload({
      result:{
        state:"SUCCEEDED",
        summary:"api_key=supersecretvalue123456789",
        artifact_refs:[],
        evidence_refs:[],
      },
    }),
    /secret-like content prohibited/
  );
});

test("receipt chain pointer must be a SHA-256 digest", () => {
  assert.throws(
    () => basePayload({ previous_receipt_sha256:"not-a-digest" }),
    /invalid previous_receipt_sha256/
  );
});


test("stale signed receipt fails when freshness policy is enabled", () => {
  const keys = generateReceiptKeyPair();
  const envelope = signExecutionReceipt(basePayload(), {
    privateKeyPem:keys.private_key_pem,
    keyId:"local:test-key",
  });
  const result = verifyExecutionReceipt(envelope, {
    publicKeys:{ "local:test-key":keys.public_key_pem },
    now:new Date("2026-09-29T04:30:00.000Z"),
    maxReceiptAgeMs:15 * 60 * 1000,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("RECEIPT_STALE"));
});

test("consumed signed receipt is rejected as replay", () => {
  const keys = generateReceiptKeyPair();
  const envelope = signExecutionReceipt(basePayload(), {
    privateKeyPem:keys.private_key_pem,
    keyId:"local:test-key",
  });
  const ref = executionReceiptRef(envelope);
  const result = verifyExecutionReceipt(envelope, {
    publicKeys:{ "local:test-key":keys.public_key_pem },
    now,
    consumedReceiptRefs:new Set([ref]),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("RECEIPT_REPLAYED"));
});

test("trusted key cannot authorize an unexpected runtime identity", () => {
  const keys = generateReceiptKeyPair();
  const envelope = signExecutionReceipt(basePayload(), {
    privateKeyPem:keys.private_key_pem,
    keyId:"local:test-key",
  });
  const result = verifyExecutionReceipt(envelope, {
    publicKeys:{ "local:test-key":keys.public_key_pem },
    now,
    allowedRuntimeProviders:["hermes"],
    allowedRuntimeRefPrefixes:["hermes-kanban:"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("RUNTIME_PROVIDER_NOT_ALLOWED"));
  assert.ok(result.reasons.includes("RUNTIME_REF_NOT_ALLOWED"));
});
