import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateRequirements, inspectProviders, validateProviderCatalog } from "./index.mjs";
const catalog=JSON.parse(await readFile(new URL("../../config/provider-doctor.json",import.meta.url),"utf8"));

function probes({commands=[],python=[],node=[],paths=[]}={}) {
  return {
    findExecutable:(x)=>commands.includes(x)?"/fake/"+x:null,
    pythonModuleAvailable:(x)=>python.includes(x),
    nodeModuleAvailable:(x)=>node.includes(x),
    pathExists:(x)=>paths.includes(x),
  };
}

test("doctor never exposes credential values",()=>{
  const secret="SUPER-SECRET-DO-NOT-PRINT";
  const report=inspectProviders({catalog,env:{PATH:"",COGNEE_API_KEY:secret},probes:probes({python:["cognee"]})});
  const serialized=JSON.stringify(report);
  assert.equal(serialized.includes(secret),false);
  const cognee=report.providers.find(x=>x.id==="cognee");
  assert.equal(cognee.configuration_state,"CONFIG_SIGNAL_PRESENT");
  assert.equal(cognee.evidence.configuration_signal_count,1);
});

test("oauth-capable installed provider remains unknown rather than falsely unconfigured",()=>{
  const report=inspectProviders({catalog,env:{PATH:""},selectedIds:["gemini-cli"],probes:probes({commands:["gemini"]})});
  assert.equal(report.providers[0].install_state,"INSTALLED");
  assert.equal(report.providers[0].configuration_state,"UNKNOWN");
  assert.equal(report.providers[0].readiness,"NEEDS_AUTH_OR_CONFIG_CHECK");
});

test("Playwright MCP can be available on demand without downloading anything",()=>{
  const report=inspectProviders({catalog,env:{PATH:""},selectedIds:["playwright-mcp"],probes:probes({commands:["npm"]})});
  assert.equal(report.providers[0].install_state,"AVAILABLE_ON_DEMAND");
  assert.equal(report.providers[0].configuration_state,"NOT_REQUIRED");
  assert.equal(report.providers[0].readiness,"READY_FOR_SELF_TEST");
});

test("installed Cognee with config signal is ready only for self-test, not live-proven",()=>{
  const report=inspectProviders({catalog,env:{PATH:"",COGNEE_BASE_URL:"https://example.invalid"},selectedIds:["cognee"],probes:probes({python:["cognee"]})});
  const item=report.providers[0];
  assert.equal(item.install_state,"INSTALLED");
  assert.equal(item.configuration_state,"CONFIG_SIGNAL_PRESENT");
  assert.equal(item.self_test_state,"NOT_RUN");
  assert.equal(item.readiness,"READY_FOR_SELF_TEST");
});

test("unknown provider filters fail closed and requirements are explicit",()=>{
  assert.throws(()=>inspectProviders({catalog,selectedIds:["nope"],probes:probes()}),/unknown provider/);
  const report=inspectProviders({catalog,env:{PATH:""},selectedIds:["browser-use","playwright-mcp"],probes:probes({commands:["npm"]})});
  const req=evaluateRequirements(report,{requireReady:["playwright-mcp","browser-use"]});
  assert.equal(req.ok,false);
  assert.ok(req.errors.some(x=>x.startsWith("browser-use:")));
});


test("catalog validation rejects duplicate IDs and malformed detection metadata",()=>{
  const duplicate=structuredClone(catalog);
  duplicate.providers.push(structuredClone(duplicate.providers[0]));
  const d=validateProviderCatalog(duplicate);
  assert.equal(d.ok,false);
  assert.ok(d.errors.some((x)=>/duplicate provider id/.test(x)));

  const malformed=structuredClone(catalog);
  malformed.providers[0].detection.env_any=["bad-name"];
  const m=validateProviderCatalog(malformed);
  assert.equal(m.ok,false);
  assert.ok(m.errors.some((x)=>/invalid environment signal name/.test(x)));

  assert.throws(
    ()=>inspectProviders({catalog:duplicate,probes:probes()}),
    /invalid provider doctor catalog/
  );
});

test("doctor reports catalog validity without converting detection into proof",()=>{
  const report=inspectProviders({catalog,env:{PATH:""},selectedIds:["codex"],probes:probes({commands:["codex"]})});
  assert.equal(report.catalog_valid,true);
  assert.equal(report.providers[0].install_state,"INSTALLED");
  assert.equal(report.providers[0].self_test_state,"NOT_RUN");
  assert.notEqual(report.providers[0].readiness,"LIVE_PROVEN");
});
