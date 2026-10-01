import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateReceiptKeyPair } from "../execution-receipt/index.mjs";
import {
  analyzeRotationOverlap,
  resolveReceiptTrust,
  validateReceiptTrustRegistry,
} from "./index.mjs";

const oldKeys=generateReceiptKeyPair();
const newKeys=generateReceiptKeyPair();
const revokedKeys=generateReceiptKeyPair();
const cutoffKeys=generateReceiptKeyPair();

function entry({
  key_id,
  public_key_pem,
  status,
  valid_from,
  valid_until=null,
  historical_policy="ALLOW_WITHIN_VALIDITY",
  revoked_at=null,
  compromise_cutoff=null,
  revocation_reason=null,
  runtime_provider_scope=["meta-ads"],
  runtime_ref_prefixes=["runtime://meta/"],
}){
  return {
    key_id,
    public_key_pem,
    status,
    signer_identity:"runtime signer "+key_id,
    key_owner:"owner-security",
    generation_boundary:"generated outside repository on signer-controlled runtime",
    storage_expectation:"private key remains outside repository in signer-owned secret storage",
    valid_from,
    valid_until,
    runtime_provider_scope,
    runtime_ref_prefixes,
    revoked_at,
    compromise_cutoff,
    revocation_reason,
    historical_policy,
  };
}

function registry(){
  return {
    schema:1,
    registry_id:"test-trust-registry-v1",
    keys:[
      entry({
        key_id:"key:old",
        public_key_pem:oldKeys.public_key_pem,
        status:"RETIRED",
        valid_from:"2026-09-29T03:00:00.000Z",
        valid_until:"2026-09-29T04:30:00.000Z",
      }),
      entry({
        key_id:"key:new",
        public_key_pem:newKeys.public_key_pem,
        status:"ACTIVE",
        valid_from:"2026-09-29T04:00:00.000Z",
      }),
      entry({
        key_id:"key:revoked-all",
        public_key_pem:revokedKeys.public_key_pem,
        status:"REVOKED",
        valid_from:"2026-09-29T03:00:00.000Z",
        historical_policy:"REJECT_ALL",
        revoked_at:"2026-09-29T04:10:00.000Z",
        revocation_reason:"signer secret may have been exposed",
      }),
      entry({
        key_id:"key:cutoff",
        public_key_pem:cutoffKeys.public_key_pem,
        status:"REVOKED",
        valid_from:"2026-09-29T03:00:00.000Z",
        historical_policy:"ALLOW_PRE_COMPROMISE",
        revoked_at:"2026-09-29T04:10:00.000Z",
        compromise_cutoff:"2026-09-29T03:50:00.000Z",
        revocation_reason:"confirmed compromise with bounded earliest-known exposure",
      }),
    ],
  };
}

const trust=(reg,keyId,finishedAt,provider="meta-ads",runtimeRef="runtime://meta/task-42") =>
  resolveReceiptTrust(reg,{keyId,finishedAt,runtimeProvider:provider,runtimeRef});

test("registry validates public-only lifecycle metadata",()=>{
  assert.deepEqual(validateReceiptTrustRegistry(registry()),[]);
});

test("registry rejects private key material",()=>{
  const reg=registry();
  reg.keys[0].public_key_pem=oldKeys.private_key_pem;
  const errors=validateReceiptTrustRegistry(reg);
  assert.ok(errors.some((item)=>item.includes("public key material only")));
});

test("retired key verifies historical receipts only inside its validity window",()=>{
  assert.equal(trust(registry(),"key:old","2026-09-29T04:15:00.000Z").ok,true);
  const late=trust(registry(),"key:old","2026-09-29T04:31:00.000Z");
  assert.equal(late.ok,false);
  assert.ok(late.reasons.includes("KEY_EXPIRED"));
});

test("new active key is invalid before activation and valid after activation",()=>{
  const before=trust(registry(),"key:new","2026-09-29T03:59:59.000Z");
  assert.equal(before.ok,false);
  assert.ok(before.reasons.includes("KEY_NOT_YET_VALID"));
  assert.equal(trust(registry(),"key:new","2026-09-29T04:05:00.000Z").ok,true);
});

test("rotation overlap is explicit and bounded",()=>{
  const overlap=analyzeRotationOverlap(registry(),"key:old","key:new");
  assert.equal(overlap.ok,true);
  assert.equal(overlap.overlap.from,"2026-09-29T04:00:00.000Z");
  assert.equal(overlap.overlap.until,"2026-09-29T04:30:00.000Z");
});

test("revoked REJECT_ALL key never validates historical or later receipts",()=>{
  for(const when of ["2026-09-29T03:30:00.000Z","2026-09-29T04:20:00.000Z"]){
    const result=trust(registry(),"key:revoked-all",when);
    assert.equal(result.ok,false);
    assert.ok(result.reasons.includes("KEY_REVOKED"));
  }
});

test("revoked ALLOW_PRE_COMPROMISE key preserves only receipts before explicit cutoff",()=>{
  assert.equal(trust(registry(),"key:cutoff","2026-09-29T03:49:59.999Z").ok,true);
  const atCutoff=trust(registry(),"key:cutoff","2026-09-29T03:50:00.000Z");
  assert.equal(atCutoff.ok,false);
  assert.ok(atCutoff.reasons.includes("KEY_COMPROMISED_AFTER_CUTOFF"));
});

test("runtime scope is enforced by the key trust entry",()=>{
  const provider=trust(registry(),"key:new","2026-09-29T04:05:00.000Z","hermes","runtime://meta/task-42");
  assert.ok(provider.reasons.includes("KEY_RUNTIME_PROVIDER_NOT_ALLOWED"));
  const ref=trust(registry(),"key:new","2026-09-29T04:05:00.000Z","meta-ads","runtime://other/task");
  assert.ok(ref.reasons.includes("KEY_RUNTIME_REF_NOT_ALLOWED"));
});

test("unknown key fails closed",()=>{
  const result=trust(registry(),"key:unknown","2026-09-29T04:05:00.000Z");
  assert.equal(result.ok,false);
  assert.deepEqual(result.reasons,["UNTRUSTED_KEY_ID"]);
});

test("invalid lifecycle combinations fail registry validation",()=>{
  const reg=registry();
  reg.keys[0].valid_until=null;
  reg.keys[1].revoked_at="2026-09-29T04:00:00.000Z";
  reg.keys[3].compromise_cutoff="2026-09-29T04:20:00.000Z";
  const errors=validateReceiptTrustRegistry(reg);
  assert.ok(errors.some((item)=>item.includes("RETIRED key requires valid_until")));
  assert.ok(errors.some((item)=>item.includes("ACTIVE key cannot carry revocation fields")));
  assert.ok(errors.some((item)=>item.includes("compromise_cutoff cannot be after revoked_at")));
});


test("canonical public registry is valid and contains no production trust anchors yet",()=>{
  const canonical=JSON.parse(readFileSync(new URL("../../config/receipt-trust-registry.json",import.meta.url),"utf8"));
  assert.deepEqual(validateReceiptTrustRegistry(canonical),[]);
  assert.deepEqual(canonical.keys,[]);
  assert.equal(JSON.stringify(canonical).includes("PRIVATE KEY-----"),false);
});
