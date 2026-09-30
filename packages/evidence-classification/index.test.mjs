import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { buildEvidenceClassificationSnapshot,readAndValidateEvidenceInventory,validateEvidenceInventory } from "./index.mjs";
const root=resolve(import.meta.dirname,"../..");
test("canonical evidence inventory validates without promoting open portability",async()=>{
 const {inventory,validation}=await readAndValidateEvidenceInventory({root});
 assert.equal(validation.ok,true,validation.errors.join("\n"));
 assert.equal(validation.claims["independent-verifier-consistency"].computed_status,"SUPPORTED");
 assert.equal(validation.claims["controlled-fikri-context-compaction"].computed_status,"SUPPORTED");
 assert.equal(validation.claims["controlled-playwright-browser-behavior"].computed_status,"SUPPORTED");
 assert.equal(validation.claims["reference-case-portability"].computed_status,"UNPROVEN");
 assert.equal(validation.claims["real-world-workflow-demonstrated"].computed_status,"COLLECTING");
 assert.equal(validation.claims["provider-lifecycle-complete"].computed_status,"UNPROVEN");
 assert.equal(validation.v0_5_growth_complete,false);
 assert.deepEqual(validation.v0_5_growth_unmet,["LIVE_RUNTIME_EVIDENCE"]);
 const snapshot=buildEvidenceClassificationSnapshot({inventory,validation});
 assert.match(snapshot.truth_boundary,/self-observation != behavioral proof/);
});
test("self-observation-only cannot support a behavioral claim",async()=>{
 const {inventory}=await readAndValidateEvidenceInventory({root});const changed=structuredClone(inventory);
 changed.evidence.push({id:"self-only",class:"SELF_OBSERVATION",status:"VALIDATED",units:1,source_paths:["packages/provider-doctor/index.test.mjs"],supports_claims:["self-only-behavior"],claim_limit:"fixture"});
 changed.claims.push({id:"self-only-behavior",kind:"BEHAVIORAL",expected_status:"SUPPORTED",required_classes:["SELF_OBSERVATION"],minimum_qualifying_units:1,minimum_qualifying_records:1,evidence_ids:["self-only"],claim:"invalid behavioral claim"});
 const validation=await validateEvidenceInventory(changed,{root});assert.equal(validation.ok,false);assert.ok(validation.errors.some((e)=>/behavioral claim cannot be supported only/.test(e)));
});
test("required live class absence prevents portability promotion",async()=>{
 const {inventory}=await readAndValidateEvidenceInventory({root});const changed=structuredClone(inventory);changed.claims.find((x)=>x.id==="reference-case-portability").expected_status="SUPPORTED";
 const validation=await validateEvidenceInventory(changed,{root});assert.equal(validation.ok,false);assert.ok(validation.errors.some((e)=>/expected SUPPORTED but computed UNPROVEN/.test(e)));
});
test("missing evidence source fails closed",async()=>{
 const {inventory}=await readAndValidateEvidenceInventory({root});const changed=structuredClone(inventory);changed.evidence[0].source_paths.push("does-not-exist/chat17-proof.json");
 const validation=await validateEvidenceInventory(changed,{root});assert.equal(validation.ok,false);assert.ok(validation.errors.some((e)=>/source path missing/.test(e)));
});
