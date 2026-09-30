import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCapabilityCatalog, validateCapabilityCatalog } from "./generate-capability-catalog.mjs";

const root=resolve(import.meta.dirname,"..");
const readJson=async(path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
const context=await (async()=>({
  employees:await readJson("config/employees.json"),
  sources:await readJson("config/upstream-sources.json"),
  runtime:await readJson("config/capabilities.json"),
  integrations:await readJson("config/integrations.json"),
}))();

test("generated capability catalog is internally valid and covers source registries", async()=>{
  const catalog=await buildCapabilityCatalog();
  assert.deepEqual(validateCapabilityCatalog(catalog,context),[]);
  assert.ok(catalog.capabilities.length>=60);
  assert.ok(catalog.capabilities.some((x)=>x.kind==="skill"));
  assert.ok(catalog.capabilities.some((x)=>x.kind==="mcp"));
  assert.ok(catalog.capabilities.some((x)=>x.kind==="plugin"));
  assert.ok(catalog.capabilities.some((x)=>x.kind==="memory"));
  assert.ok(catalog.capabilities.some((x)=>x.kind==="workflow"));
  assert.ok(catalog.capabilities.some((x)=>x.kind==="policy"));
  assert.ok(catalog.capabilities.some((x)=>x.kind==="extension"));
  assert.ok(catalog.capabilities.some((x)=>x.kind==="hook"));
  assert.ok(catalog.capabilities.some((x)=>x.kind==="adapter"));
});

test("unsafe capability cannot silently default to bundled", async()=>{
  const catalog=await buildCapabilityCatalog();
  const copy=structuredClone(catalog);
  const item=copy.capabilities.find((x)=>x.risk_class==="EXTERNAL_WRITE");
  item.default_state="BUNDLED";
  assert.ok(validateCapabilityCatalog(copy,context).some((x)=>x.includes("unsafe capability cannot default BUNDLED")));
});

test("unknown upstream source fails catalog validation", async()=>{
  const catalog=await buildCapabilityCatalog();
  const copy=structuredClone(catalog);
  copy.capabilities[0].source_refs=[{source_id:"ghost-source",source_commit:"deadbeef",license:"MIT"}];
  assert.ok(validateCapabilityCatalog(copy,context).some((x)=>x.includes("unknown source ghost-source")));
});

test("catalog does not turn worker eligibility into universal access", async()=>{
  const catalog=await buildCapabilityCatalog();
  const metaWrite=catalog.capabilities.find((x)=>x.id==="ads.meta.write");
  const googleWrite=catalog.capabilities.find((x)=>x.id==="ads.google.write");
  assert.ok(metaWrite.optional_for.includes("maya"));
  assert.equal(metaWrite.optional_for.includes("fikri"),false);
  assert.ok(googleWrite.optional_for.includes("gugun"));
  assert.equal(googleWrite.optional_for.includes("maya"),false);
});
