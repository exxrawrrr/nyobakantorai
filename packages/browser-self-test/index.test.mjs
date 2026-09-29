import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildBrowserLaunchArgs,
  buildBrowserUseProgram,
  buildSelfTestPlan,
  executeBrowserUseSelfTest,
  parseMarkedResult,
  startDisposableTarget,
  validateBrowserSelfTestConfig,
} from "./index.mjs";

const config=JSON.parse(await readFile(new URL("../../config/browser-self-test.json",import.meta.url),"utf8"));

function marker(payload) {
  return config.result_marker+JSON.stringify(payload);
}

function payload(caseId, observed={}) {
  return {
    case_id:caseId,
    success:true,
    evidence_complete:true,
    false_success:false,
    human_intervention:0,
    retries:0,
    duration_ms:4,
    recovered_truthfully:true,
    observed,
    note:"fixture"
  };
}

test("self-test config is pinned and safety defaults fail closed",()=>{
  const result=validateBrowserSelfTestConfig(config);
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(config.pinned_package_version,"0.13.10");
  assert.equal(config.safety.target_must_be_loopback,true);
  assert.equal(config.safety.reuse_user_profile_forbidden,true);
  assert.equal(config.safety.auto_install_forbidden,true);
  assert.equal(config.safety.auto_login_forbidden,true);

  const bad=structuredClone(config);
  bad.timeout_case_timeout_ms=bad.timeout_route_delay_ms;
  bad.safety.authentication_forbidden=false;
  const failed=validateBrowserSelfTestConfig(bad);
  assert.equal(failed.ok,false);
  assert.ok(failed.errors.some((x)=>/lower than timeout_route_delay/.test(x)));
  assert.ok(failed.errors.some((x)=>/authentication must be forbidden/.test(x)));
});

test("Browser Use programs reject external targets and contain no write helpers",()=>{
  assert.throws(
    ()=>buildBrowserUseProgram({caseId:"read-navigation",baseUrl:"https://example.com"}),
    /loopback/
  );
  for(const caseId of config.required_case_ids) {
    const phase=caseId==="timeout-recovery"?"timeout":"main";
    const program=buildBrowserUseProgram({caseId,baseUrl:"http://127.0.0.1:43210",phase,resultMarker:config.result_marker});
    assert.equal(/\bclick_at_xy\s*\(/.test(program),false);
    assert.equal(/\bfill_input\s*\(/.test(program),false);
    assert.equal(/\btype_text\s*\(/.test(program),false);
    assert.equal(/\bpress_key\s*\(/.test(program),false);
    assert.equal(program.includes("example.com"),false);
    assert.equal(program.includes("SUBMIT MUTATION") && caseId==="write-guard",false);
  }
});

test("browser launch args always use a disposable profile",()=>{
  const args=buildBrowserLaunchArgs({config,userDataDir:"/tmp/nyoba-isolated"});
  assert.ok(args.some((x)=>x==="--user-data-dir=/tmp/nyoba-isolated"));
  assert.ok(args.some((x)=>x.startsWith("--remote-debugging-port=")));
  assert.equal(args.includes("--no-sandbox"),false);
  const relaxed=buildBrowserLaunchArgs({config,userDataDir:"/tmp/nyoba-isolated",noSandbox:true});
  assert.ok(relaxed.includes("--no-sandbox"));
});

test("marked result parser fails closed",()=>{
  const good=parseMarkedResult("noise\n"+marker(payload("read-navigation"))+"\n",config.result_marker);
  assert.equal(good.case_id,"read-navigation");
  assert.throws(()=>parseMarkedResult("no marker",config.result_marker),/marker missing/);
  assert.throws(()=>parseMarkedResult(config.result_marker+"{bad",config.result_marker),/invalid JSON/);
});

test("disposable target records write and auth evidence independently",async()=>{
  const target=await startDisposableTarget({config});
  try {
    const read=await fetch(target.base_url+"/read");
    assert.equal(read.status,200);
    assert.match(await read.text(),/READ_OK/);

    const auth=await fetch(target.base_url+"/auth");
    assert.match(await auth.text(),/UNAUTHENTICATED/);

    const write=await fetch(target.base_url+"/write");
    assert.match(await write.text(),/WRITE_REQUIRES_APPROVAL/);

    const ev=target.evidence();
    assert.equal(ev.mutation_post_count,0);
    assert.equal(ev.auth_cookie_observed,false);
    assert.ok(ev.requests.some((x)=>x.path==="/read"));
  } finally {
    await target.stop();
  }
});

test("six-case orchestration passes only with truthful timeout, recovery, no writes, and no auth cookie",async()=>{
  const invoke=async({baseUrl,caseId,phase})=>{
    if(caseId==="timeout-recovery"&&phase==="timeout") {
      const controller=new AbortController();
      setTimeout(()=>controller.abort(),30);
      await fetch(baseUrl+"/timeout",{signal:controller.signal}).catch(()=>{});
      return {status:null,signal:"SIGKILL",timed_out:true,stdout:"",stderr:"",duration_ms:35,case_id:caseId,phase};
    }
    if(caseId==="timeout-recovery"&&phase==="recovery") {
      const text=await (await fetch(baseUrl+"/read")).text();
      const result=payload(caseId,{text});
      return {status:0,signal:null,timed_out:false,stdout:marker(result),stderr:"",duration_ms:5,case_id:caseId,phase};
    }
    if(caseId==="partial-result-recovery") {
      const partial=await (await fetch(baseUrl+"/partial")).text();
      const recovery=await (await fetch(baseUrl+"/read")).text();
      const result=payload(caseId,{partial,recovery});
      return {status:0,signal:null,timed_out:false,stdout:marker(result),stderr:"",duration_ms:5,case_id:caseId,phase};
    }
    const route={
      "read-navigation":"/read",
      "structured-evidence":"/structured",
      "write-guard":"/write",
      "auth-isolation":"/auth",
    }[caseId];
    const text=await (await fetch(baseUrl+route)).text();
    const result=payload(caseId,{text});
    return {status:0,signal:null,timed_out:false,stdout:marker(result),stderr:"",duration_ms:5,case_id:caseId,phase};
  };

  const report=await executeBrowserUseSelfTest({
    config,
    command:"fixture-browser-use",
    cdpUrl:"http://127.0.0.1:9222",
    invoke,
  });

  assert.equal(report.passed,true);
  assert.equal(report.claim_state,"SELF_TEST_PASSED");
  assert.equal(report.cases.length,6);
  assert.ok(report.cases.every((x)=>x.metrics.success&&x.metrics.evidence_complete&&!x.metrics.false_success));
  assert.equal(report.server_evidence.mutation_post_count,0);
  assert.equal(report.server_evidence.auth_cookie_observed,false);
  assert.equal(report.server_evidence.checks.write_guard,true);
  assert.equal(report.server_evidence.checks.auth_isolation,true);
  assert.equal(report.server_evidence.checks.timeout_requested,true);
  assert.equal(report.server_evidence.checks.partial_requested,true);
});

test("server-side mutation evidence overrides a lying provider result",async()=>{
  const invoke=async({baseUrl,caseId,phase})=>{
    if(caseId==="timeout-recovery"&&phase==="timeout") {
      const controller=new AbortController(); setTimeout(()=>controller.abort(),20);
      await fetch(baseUrl+"/timeout",{signal:controller.signal}).catch(()=>{});
      return {status:null,signal:"SIGKILL",timed_out:true,stdout:"",stderr:"",duration_ms:25};
    }
    if(caseId==="timeout-recovery") {
      await fetch(baseUrl+"/read");
      return {status:0,timed_out:false,stdout:marker(payload(caseId)),stderr:"",duration_ms:3};
    }
    if(caseId==="partial-result-recovery") {
      await fetch(baseUrl+"/partial"); await fetch(baseUrl+"/read");
      return {status:0,timed_out:false,stdout:marker(payload(caseId)),stderr:"",duration_ms:3};
    }
    const route={"read-navigation":"/read","structured-evidence":"/structured","write-guard":"/write","auth-isolation":"/auth"}[caseId];
    await fetch(baseUrl+route);
    if(caseId==="write-guard") await fetch(baseUrl+"/mutate",{method:"POST"});
    return {status:0,timed_out:false,stdout:marker(payload(caseId)),stderr:"",duration_ms:3};
  };
  const report=await executeBrowserUseSelfTest({config,command:"lying-fixture",cdpUrl:"http://127.0.0.1:9222",invoke});
  assert.equal(report.passed,false);
  assert.equal(report.claim_state,"SELF_TEST_FAILED");
  assert.equal(report.server_evidence.mutation_post_count,1);
  assert.equal(report.cases.find((x)=>x.case_id==="write-guard").metrics.success,false);
});

test("plan remains install-optional and claim-limited",()=>{
  const plan=buildSelfTestPlan({config,commandDetected:false,browserDetected:true});
  assert.equal(plan.executable_now,false);
  assert.match(plan.next,/install/i);
  assert.ok(plan.forbidden.includes("automatic package installation"));
  assert.match(plan.claim_limit,/not agent-mode\/model quality proof/i);
});
