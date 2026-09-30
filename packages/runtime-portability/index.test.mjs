import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readAndValidateRuntimePortabilityMap, validateRuntimePortabilityMap } from "./index.mjs";

const root=resolve(import.meta.dirname,"../..");

test("canonical runtime portability map validates against the repository",async()=>{
  const {map,validation}=await readAndValidateRuntimePortabilityMap({root});
  assert.equal(validation.ok,true,validation.errors.map((item)=>item.code+":"+item.detail).join("\n"));
  assert.equal(validation.surface_count,29);
  assert.equal(map.audited_release,"v0.4.0");
});

test("Chat 2 classifications record only enforced boundary improvements",async()=>{
  const {map}=await readAndValidateRuntimePortabilityMap({root});
  const byId=Object.fromEntries(map.surfaces.map((surface)=>[surface.id,surface.classification]));
  assert.equal(byId["capability-contracts"],"CORE_PORTABLE");
  assert.equal(byId["evidence-and-receipts"],"CORE_PORTABLE");
  assert.equal(byId["runtime-adapter-sdk"],"ADAPTER_BOUNDARY");
  assert.equal(byId["employee-definitions"],"UNKNOWN_REQUIRES_PROOF");
  assert.equal(byId["skill-definitions"],"ADAPTER_BOUNDARY");
  assert.equal(byId["task-registry"],"CORE_PORTABLE");
  assert.equal(byId["office-runtime-reconciliation"],"ADAPTER_BOUNDARY");
  assert.equal(byId["hermes-bootstrap"],"RUNTIME_SPECIFIC_BY_DESIGN");
  assert.equal(byId["portable-worker-contract"],"CORE_PORTABLE");
  assert.equal(byId["runtime-execution-adapter"],"ADAPTER_BOUNDARY");
  assert.equal(byId["portability-reference-inputs"],"CORE_PORTABLE");
  assert.equal(byId["hermes-execution-adapter"],"RUNTIME_SPECIFIC_BY_DESIGN");
  assert.equal(byId["codex-execution-adapter"],"RUNTIME_SPECIFIC_BY_DESIGN");
  assert.equal(byId["reference-case-comparator"],"CORE_PORTABLE");
  assert.equal(byId["live-reference-run-harness"],"ADAPTER_BOUNDARY");
  assert.equal(byId["independent-python-reference-verifier"],"CORE_PORTABLE");
  assert.equal(byId["verifier-differential-corpus"],"CORE_PORTABLE");
  assert.equal(byId["receipt-trust-registry"],"CORE_PORTABLE");
});

test("mapped paths fail closed when repository structure drifts",async()=>{
  const {map}=await readAndValidateRuntimePortabilityMap({root});
  const changed=structuredClone(map);
  changed.surfaces[0].paths.push("does-not-exist/runtime-portability-sentinel.mjs");
  const validation=await validateRuntimePortabilityMap(changed,{root});
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some((item)=>item.code==="MAPPED_PATH_MISSING"));
});

test("CORE_PORTABLE source may not import a forbidden Hermes implementation",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"nyoba-portability-"));
  try{
    await mkdir(join(temp,"packages","portable"),{recursive:true});
    await writeFile(join(temp,"packages","portable","index.mjs"),'import "../../office/hermes-runtime-adapter.mjs";\n',"utf8");
    const map={
      schema:1,
      audit:"fixture",
      policy:{
        required_surface_ids:[],
        forbidden_core_import_fragments:["hermes-runtime-adapter"],
        portable_source_extensions:[".mjs"],
      },
      surfaces:[{
        id:"portable-fixture",
        classification:"CORE_PORTABLE",
        paths:["packages/portable"],
        rationale:"fixture",
        evidence:["fixture"],
        next_action:"fixture",
      }],
    };
    const validation=await validateRuntimePortabilityMap(map,{root:temp});
    assert.equal(validation.ok,false);
    assert.ok(validation.errors.some((item)=>item.code==="FORBIDDEN_CORE_IMPORT"));
  } finally {
    await rm(temp,{recursive:true,force:true});
  }
});

test("unknown classification fails closed",async()=>{
  const {map}=await readAndValidateRuntimePortabilityMap({root});
  const changed=structuredClone(map);
  changed.surfaces[0].classification="MAGIC_PORTABLE";
  const validation=await validateRuntimePortabilityMap(changed,{root});
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some((item)=>item.code==="CLASSIFICATION_INVALID"));
});
