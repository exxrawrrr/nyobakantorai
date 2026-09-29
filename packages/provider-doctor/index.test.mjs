import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateRequirements, inspectProviders } from "./index.mjs";
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
