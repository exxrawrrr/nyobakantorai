import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { findRelativeImporters,readAndValidateComplexityBudget,validateComplexityBudget } from "./index.mjs";
const root=resolve(import.meta.dirname,"../..");

test("canonical complexity budget covers every required subsystem and contains a real non-KEEP decision",async()=>{
 const {ledger,validation}=await readAndValidateComplexityBudget({root});
 assert.equal(validation.ok,true,validation.errors.join("\n"));
 assert.equal(validation.subsystems,12);
 assert.equal(validation.decisions.KEEP,11);
 assert.equal(validation.decisions.MERGE,1);
 assert.deepEqual(validation.non_keep,["deferred-evidence-release-claims"]);
 assert.equal(ledger.deep_evaluations[0].execute_in,"Chat 19");
});

test("deferred-evidence merge candidate dependency scan is exact",async()=>{
 assert.deepEqual(await findRelativeImporters(root,"packages/deferred-evidence/index.mjs"),[
  "packages/deferred-evidence/index.test.mjs",
  "packages/release-claims/index.test.mjs",
  "scripts/release-manifest.mjs"
 ]);
 assert.deepEqual(await findRelativeImporters(root,"packages/release-claims/index.mjs"),[
  "packages/release-claims/index.test.mjs",
  "scripts/release-manifest.mjs"
 ]);
});

test("all-KEEP complexity ledger is rejected",async()=>{
 const {ledger}=await readAndValidateComplexityBudget({root});
 const changed=structuredClone(ledger);
 for(const row of changed.subsystems)row.keep_simplify_delete="KEEP";
 changed.deep_evaluations=[];
 const result=await validateComplexityBudget(changed,{root});
 assert.equal(result.ok,false);
 assert.ok(result.errors.some((e)=>/requires at least one concrete non-KEEP decision/.test(e)));
});

test("deep evaluation cannot silently ignore a new importer",async()=>{
 const {ledger}=await readAndValidateComplexityBudget({root});
 const changed=structuredClone(ledger);
 changed.deep_evaluations[0].dependency_scan.targets[0].expected_importers=["scripts/release-manifest.mjs"];
 const result=await validateComplexityBudget(changed,{root});
 assert.equal(result.ok,false);
 assert.ok(result.errors.some((e)=>/dependency scan drift/.test(e)));
});

test("MERGE decision requires preserved surfaces, replacement tests, and rollback path",async()=>{
 const {ledger}=await readAndValidateComplexityBudget({root});
 const changed=structuredClone(ledger);
 changed.deep_evaluations[0].replacement_test_plan=[];
 changed.deep_evaluations[0].rollback_recovery="";
 const result=await validateComplexityBudget(changed,{root});
 assert.equal(result.ok,false);
 assert.ok(result.errors.some((e)=>/replacement_test_plan required/.test(e)));
 assert.ok(result.errors.some((e)=>/rollback_recovery required/.test(e)));
});
