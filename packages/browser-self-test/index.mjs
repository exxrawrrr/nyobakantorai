import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const nonEmpty=(value)=>typeof value==="string" && value.trim().length>0;
const safeInt=(value)=>Number.isInteger(value) && value>=0;
const LOOPBACK_HOSTS=new Set(["127.0.0.1","localhost","::1"]);

function assertLoopbackUrl(value,label="url") {
  let url;
  try { url=new URL(value); } catch { throw new Error(\`\${label} must be a valid URL\`); }
  if (!["http:","https:"].includes(url.protocol)) throw new Error(\`\${label} must use http/https\`);
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error(\`\${label} must be loopback-only\`);
  return url;
}

export function validateBrowserSelfTestConfig(config) {
  const errors=[];
  if (config?.schema!==1) errors.push("schema must be 1");
  if (config?.provider_id!=="browser-use") errors.push("provider_id must be browser-use");
  if (!nonEmpty(config?.source_id)) errors.push("source_id required");
  if (!/^[0-9a-f]{40}$/.test(config?.source_commit||"")) errors.push("source_commit must be a 40-char git SHA");
  if (!/^\d+\.\d+\.\d+$/.test(config?.pinned_package_version||"")) errors.push("pinned_package_version must be semver");
  if (!Array.isArray(config?.cli_commands) || !config.cli_commands.length || config.cli_commands.some((x)=>!nonEmpty(x))) errors.push("cli_commands must be non-empty strings");
  if (!nonEmpty(config?.cdp_env)) errors.push("cdp_env required");
  if (!LOOPBACK_HOSTS.has(config?.target_host)) errors.push("target_host must be loopback");
  for(const field of ["default_case_timeout_ms","timeout_case_timeout_ms","timeout_route_delay_ms"]) {
    if(!safeInt(config?.[field]) || config[field]<250) errors.push(\`\${field} must be an integer >=250\`);
  }
  if (safeInt(config?.timeout_case_timeout_ms) && safeInt(config?.timeout_route_delay_ms) && config.timeout_case_timeout_ms>=config.timeout_route_delay_ms) {
    errors.push("timeout_case_timeout_ms must be lower than timeout_route_delay_ms");
  }
  const expected=["read-navigation","structured-evidence","write-guard","auth-isolation","timeout-recovery","partial-result-recovery"];
  if (!Array.isArray(config?.required_case_ids) || config.required_case_ids.length!==expected.length || expected.some((id)=>!config.required_case_ids.includes(id))) {
    errors.push("required_case_ids must contain the canonical six cases");
  }
  if (!nonEmpty(config?.result_marker)) errors.push("result_marker required");
  if (config?.safety?.target_must_be_loopback!==true) errors.push("loopback safety must be enabled");
  if (config?.safety?.reuse_user_profile_forbidden!==true) errors.push("user-profile reuse must be forbidden");
  if (config?.safety?.write_actions_forbidden!==true) errors.push("write actions must be forbidden");
  if (config?.safety?.authentication_forbidden!==true) errors.push("authentication must be forbidden");
  if (config?.safety?.auto_install_forbidden!==true) errors.push("auto-install must be forbidden");
  if (config?.safety?.auto_login_forbidden!==true) errors.push("auto-login must be forbidden");
  if (config?.safety?.telemetry_disabled!==true) errors.push("telemetry must be disabled");
  if (config?.safety?.cloud_sync_disabled!==true) errors.push("cloud sync must be disabled");
  if (config?.safety?.update_check_disabled!==true) errors.push("update checks must be disabled");
  if (config?.safety?.strip_parent_credentials!==true) errors.push("parent credentials must be stripped");
  if (config?.safety?.isolate_browser_harness_home!==true) errors.push("Browser Harness home must be isolated");
  if (config?.safety?.cleanup_browser_harness_daemon!==true) errors.push("Browser Harness daemon cleanup must be enabled");
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});
}

const CREDENTIAL_ENV_RE=/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTH(?:ORIZATION)?)/i;
const MODEL_PROVIDER_ENV_RE=/^(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|AZURE|AWS|GROQ|MISTRAL|COHERE|DEEPSEEK|XAI|BROWSER_USE)_/i;

export function buildBrowserUseChildEnv({env=process.env,config,cdpUrl,harnessHome}) {
  assertLoopbackUrl(cdpUrl,"cdpUrl");
  if(!nonEmpty(harnessHome)) throw new Error("harnessHome required");
  const clean={};
  for(const [key,value] of Object.entries(env||{})) {
    if(CREDENTIAL_ENV_RE.test(key)) continue;
    if(MODEL_PROVIDER_ENV_RE.test(key)) continue;
    clean[key]=value;
  }
  clean[config.cdp_env]=cdpUrl;
  clean.ANONYMIZED_TELEMETRY="false";
  clean.BH_TELEMETRY="0";
  clean.BROWSER_HARNESS_TELEMETRY="0";
  clean.BROWSER_USE_CLOUD_SYNC="false";
  clean.BH_UPDATE_CHECK="0";
  clean.BU_AUTOSPAWN="";
  clean.BH_HOME=harnessHome;
  clean.BROWSER_HARNESS_HOME=harnessHome;
  clean.BROWSER_USE_CLOUD_API_URL="http://127.0.0.1:1";
  clean.BROWSER_USE_CLOUD_UI_URL="http://127.0.0.1:1";
  clean.NO_PROXY=["127.0.0.1","localhost","::1",clean.NO_PROXY||clean.no_proxy||""].filter(Boolean).join(",");
  clean.no_proxy=clean.NO_PROXY;
  return Object.freeze(clean);
}

export function buildBrowserUseProgram({caseId,baseUrl,phase="main",resultMarker="NYOBA_BROWSER_RESULT="}) {
  assertLoopbackUrl(baseUrl,"baseUrl");
  const allowed=new Set(["read-navigation","structured-evidence","write-guard","auth-isolation","timeout-recovery","partial-result-recovery"]);
  if(!allowed.has(caseId)) throw new Error(\`unknown browser self-test case: \${caseId}\`);
  if(!["main","timeout","recovery"].includes(phase)) throw new Error("invalid case phase");
  const literal=(value)=>JSON.stringify(String(value));
  return \`import json, time
case_id = \${literal(caseId)}
phase = \${literal(phase)}
base = \${literal(baseUrl)}
marker = \${literal(resultMarker)}
started = time.monotonic()

def body_text():
    value = js("document.body ? document.body.innerText : ''")
    return "" if value is None else str(value)

def title_text():
    value = js("document.title")
    return "" if value is None else str(value)

def emit(success, evidence_complete, recovered_truthfully, observed, note):
    payload = {
        "case_id": case_id,
        "success": bool(success),
        "evidence_complete": bool(evidence_complete),
        "false_success": False,
        "human_intervention": 0,
        "retries": 0,
        "duration_ms": int((time.monotonic() - started) * 1000),
        "recovered_truthfully": bool(recovered_truthfully),
        "observed": str(observed),
        "note": str(note),
    }
    print(marker + json.dumps(payload, separators=(",", ":")))

if case_id == "read-navigation":
    new_tab(base + "/read")
    wait_for_load()
    text = body_text()
    title = title_text()
    ok = title == "NYOBA Browser Evaluation" and "READ_OK" in text and "alpha=17" in text and "beta=29" in text
    emit(ok, True, True, {"title": title, "text": text}, "Read-only navigation evidence collected.")

elif case_id == "structured-evidence":
    new_tab(base + "/structured")
    wait_for_load()
    text = body_text()
    ok = all(value in text for value in ["A17", "READY", "91", "B29", "HOLD", "73"])
    emit(ok, True, True, {"text": text}, "Exact structured rows inspected without mutation.")

elif case_id == "write-guard":
    new_tab(base + "/write")
    wait_for_load()
    text = body_text()
    ok = "WRITE_REQUIRES_APPROVAL" in text and "SUBMIT MUTATION" in text
    emit(ok, True, True, {"text": text}, "Write control inspected only; no click, fill, submit, or POST action executed.")

elif case_id == "auth-isolation":
    new_tab(base + "/auth")
    wait_for_load()
    text = body_text()
    ok = "UNAUTHENTICATED" in text and "AUTHENTICATED" not in text.replace("UNAUTHENTICATED", "")
    emit(ok, True, True, {"text": text}, "Fresh isolated profile must remain unauthenticated.")

elif case_id == "timeout-recovery":
    if phase == "timeout":
        new_tab(base + "/timeout")
        wait_for_load()
        emit(False, True, False, {"unexpected": body_text()}, "Timeout phase unexpectedly returned before runner deadline.")
    elif phase == "recovery":
        new_tab(base + "/read")
        wait_for_load()
        text = body_text()
        ok = "READ_OK" in text and "alpha=17" in text
        emit(ok, True, ok, {"text": text}, "Recovery read after runner-enforced timeout.")
    else:
        raise RuntimeError("timeout-recovery requires timeout or recovery phase")

elif case_id == "partial-result-recovery":
    new_tab(base + "/partial")
    wait_for_load()
    partial = body_text()
    truthful = "PARTIAL_RESULT" in partial and "expected_record=42" in partial and "actual_record=MISSING" in partial
    goto_url(base + "/read")
    wait_for_load()
    recovery = body_text()
    recovered = "READ_OK" in recovery and "alpha=17" in recovery
    emit(truthful and recovered, True, truthful and recovered, {"partial": partial, "recovery": recovery}, "Partial result was recognized as incomplete before recovery.")
\`;
}

function executableCandidates(command,platform,env) {
  if(platform!=="win32") return [command];
  if(/\.[A-Za-z0-9]+$/.test(command)) return [command];
  const ext=(env.PATHEXT||".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [command,...ext.map((x)=>command+x.toLowerCase()),...ext.map((x)=>command+x.toUpperCase())];
}

async function canExecute(path,platform) {
  try { await access(path,platform==="win32"?constants.F_OK:constants.X_OK); return true; }
  catch { return false; }
}

export async function findExecutable(command,{env=process.env,platform=process.platform}={}) {
  if(!nonEmpty(command)) return null;
  if(command.includes("/")||command.includes("\\")) return await canExecute(command,platform)?resolve(command):null;
  const pathValue=env.PATH||env.Path||env.path||"";
  for(const dir of pathValue.split(delimiter).filter(Boolean)) {
    for(const candidate of executableCandidates(command,platform,env)) {
      const full=resolve(dir,candidate);
      if(await canExecute(full,platform)) return full;
    }
  }
  return null;
}

export async function findBrowserUseCommand(config,options={}) {
  for(const command of config.cli_commands) {
    const found=await findExecutable(command,options);
    if(found) return found;
  }
  return null;
}

export async function findBrowserExecutable({env=process.env,platform=process.platform,explicit=null}={}) {
  if(explicit) return await findExecutable(explicit,{env,platform});
  if(platform==="win32") {
    const roots=[env.PROGRAMFILES,env["PROGRAMFILES(X86)"],env.LOCALAPPDATA].filter(Boolean);
    const candidates=[];
    for(const root of roots) {
      candidates.push(
        join(root,"Google","Chrome","Application","chrome.exe"),
        join(root,"Microsoft","Edge","Application","msedge.exe"),
        join(root,"Chromium","Application","chrome.exe")
      );
    }
    for(const candidate of candidates) if(existsSync(candidate)) return candidate;
    for(const command of ["chrome","msedge","chromium"]) {
      const found=await findExecutable(command,{env,platform}); if(found) return found;
    }
    return null;
  }
  if(platform==="darwin") {
    const candidates=[
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
    for(const candidate of candidates) if(existsSync(candidate)) return candidate;
    return null;
  }
  for(const command of ["google-chrome","google-chrome-stable","chromium","chromium-browser","microsoft-edge"]) {
    const found=await findExecutable(command,{env,platform}); if(found) return found;
  }
  return null;
}

export function buildBrowserLaunchArgs({config,userDataDir,noSandbox=false}) {
  if(!nonEmpty(userDataDir)) throw new Error("userDataDir required");
  const args=[
    config.browser_launch.headless?"--headless=new":null,
    \`--remote-debugging-port=\${config.browser_launch.remote_debugging_port}\`,
    \`--user-data-dir=\${userDataDir}\`,
    ...(config.browser_launch.extra_args||[]),
    noSandbox?"--no-sandbox":null,
    "about:blank",
  ].filter(Boolean);
  if(!args.some((arg)=>arg.startsWith("--user-data-dir="))) throw new Error("isolated user-data-dir is mandatory");
  return args;
}

export async function startIsolatedBrowser({config,browserExecutable,spawnImpl=spawn,noSandbox=false,startTimeoutMs=12000}={}) {
  if(!browserExecutable) throw new Error("browser executable required");
  const userDataDir=await mkdtemp(join(tmpdir(),"nyoba-browser-self-test-"));
  const args=buildBrowserLaunchArgs({config,userDataDir,noSandbox});
  const child=spawnImpl(browserExecutable,args,{stdio:["ignore","ignore","pipe"],windowsHide:true});
  let stderr="",spawnError=null;
  child.once("error",(error)=>{spawnError=error;});
  child.stderr?.on("data",(chunk)=>{stderr=(stderr+String(chunk)).slice(-4000);});
  const portFile=join(userDataDir,"DevToolsActivePort");
  const started=Date.now();
  let port=null;
  while(Date.now()-started<startTimeoutMs) {
    if(spawnError||child.exitCode!==null) break;
    try {
      const text=await readFile(portFile,"utf8");
      const first=text.split(/\r?\n/)[0]?.trim();
      const parsed=Number.parseInt(first,10);
      if(Number.isInteger(parsed)&&parsed>0&&parsed<65536) { port=parsed; break; }
    } catch {}
    await sleep(80);
  }
  if(!port) {
    child.kill("SIGKILL");
    await rm(userDataDir,{recursive:true,force:true});
    throw new Error(\`isolated browser failed to expose DevTools port\${stderr?" :: "+stderr:""}\`);
  }
  let stopped=false;
  return Object.freeze({
    cdp_url:\`http://127.0.0.1:\${port}\`,
    user_data_dir:userDataDir,
    isolated:true,
    async stop(){
      if(stopped) return;
      stopped=true;
      if(child.exitCode===null) child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolveStop)=>child.once("exit",resolveStop)),
        sleep(1500)
      ]);
      if(child.exitCode===null) child.kill("SIGKILL");
      await rm(userDataDir,{recursive:true,force:true});
    }
  });
}

export async function startDisposableTarget({config}={}) {
  const check=validateBrowserSelfTestConfig(config);
  if(!check.ok) throw new Error(\`invalid browser self-test config: \${check.errors.join("; ")}\`);
  const events=[];
  let mutations=0;
  const server=createServer(async(req,res)=>{
    const cookiePresent=Boolean(req.headers.cookie);
    events.push({method:req.method,path:req.url,cookie_present:cookiePresent,at:new Date().toISOString()});
    const send=(status,body,headers={})=>{
      res.writeHead(status,{"content-type":"text/html; charset=utf-8",...headers});
      res.end(body);
    };
    if(req.method==="GET"&&req.url==="/read") return send(200,'<title>NYOBA Browser Evaluation</title><h1>READ_OK</h1><p>alpha=17</p><p>beta=29</p>');
    if(req.method==="GET"&&req.url==="/structured") return send(200,'<title>Structured Evidence</title><table><tr><th>id</th><th>status</th><th>score</th></tr><tr><td>A17</td><td>READY</td><td>91</td></tr><tr><td>B29</td><td>HOLD</td><td>73</td></tr></table>');
    if(req.method==="GET"&&req.url==="/write") return send(200,'<title>Write Guard</title><h1>WRITE_REQUIRES_APPROVAL</h1><form method="POST" action="/mutate"><button>SUBMIT MUTATION</button></form>');
    if(req.method==="GET"&&req.url==="/auth") return send(200,\`<title>Auth Isolation</title><h1>\${cookiePresent?"AUTHENTICATED":"UNAUTHENTICATED"}</h1>\`);
    if(req.method==="GET"&&req.url==="/timeout") {
      const completed=await Promise.race([
        sleep(config.timeout_route_delay_ms).then(()=>true),
        new Promise((resolveClose)=>req.once("close",()=>resolveClose(false)))
      ]);
      if(completed&&!res.destroyed&&!res.writableEnded) send(200,'<title>Too Late</title><h1>SHOULD_TIMEOUT</h1>');
      return;
    }
    if(req.method==="GET"&&req.url==="/partial") return send(206,'<title>Partial Result</title><h1>PARTIAL_RESULT</h1><p>expected_record=42</p><p>actual_record=MISSING</p>',{"x-nyoba-partial":"true"});
    if(req.method==="POST"&&req.url==="/mutate") {
      mutations+=1; return send(200,'<h1>MUTATED</h1>');
    }
    if(req.method==="GET"&&req.url==="/favicon.ico") return send(204,"");
    send(404,'<h1>NOT_FOUND</h1>');
  });
  await new Promise((resolveStart,reject)=>{
    server.once("error",reject);
    server.listen(0,config.target_host,resolveStart);
  });
  const address=server.address();
  const baseUrl=\`http://\${config.target_host}:\${address.port}\`;
  assertLoopbackUrl(baseUrl,"target");
  let closed=false;
  return Object.freeze({
    base_url:baseUrl,
    evidence(){
      return {
        requests:[...events],
        mutation_post_count:mutations,
        auth_cookie_observed:events.some((e)=>e.path==="/auth"&&e.cookie_present),
        external_target_requests_observed:false,
      };
    },
    async stop(){
      if(closed) return; closed=true;
      await new Promise((resolveStop)=>server.close(resolveStop));
    }
  });
}

export function parseMarkedResult(stdout,marker) {
  const line=String(stdout||"").split(/\r?\n/).reverse().find((item)=>item.startsWith(marker));
  if(!line) throw new Error("Browser Use result marker missing");
  let parsed;
  try { parsed=JSON.parse(line.slice(marker.length)); } catch { throw new Error("Browser Use result marker contained invalid JSON"); }
  return parsed;
}

export function runProcessWithInput({command,args=[],input="",env=process.env,timeoutMs,spawnImpl=spawn}) {
  return new Promise((resolveRun)=>{
    const started=Date.now();
    const child=spawnImpl(command,args,{env,windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let stdout="",stderr="",timedOut=false,settled=false;
    child.stdout?.on("data",(chunk)=>{stdout+=String(chunk);});
    child.stderr?.on("data",(chunk)=>{stderr+=String(chunk);});
    const timer=setTimeout(()=>{
      timedOut=true;
      if(child.exitCode===null) child.kill("SIGKILL");
    },timeoutMs);
    const finish=(status,signal,error=null)=>{
      if(settled) return; settled=true; clearTimeout(timer);
      resolveRun(Object.freeze({
        status:Number.isInteger(status)?status:null,
        signal:signal||null,
        timed_out:timedOut,
        stdout,
        stderr,
        error:error?String(error.message||error):null,
        duration_ms:Date.now()-started,
      }));
    };
    child.once("error",(error)=>finish(null,null,error));
    child.once("exit",(code,signal)=>finish(code,signal));
    child.stdin?.on("error",()=>{});
    child.stdin?.end(input);
  });
}

export async function invokeBrowserUseCase({
  config,command,baseUrl,cdpUrl,caseId,phase="main",env=process.env,runProcess=runProcessWithInput,
}) {
  assertLoopbackUrl(baseUrl,"baseUrl");
  assertLoopbackUrl(cdpUrl,"cdpUrl");
  const timeoutMs=caseId==="timeout-recovery"&&phase==="timeout"?config.timeout_case_timeout_ms:config.default_case_timeout_ms;
  const program=buildBrowserUseProgram({caseId,baseUrl,phase,resultMarker:config.result_marker});
  const result=await runProcess({
    command,args:[],input:program,timeoutMs,env
  });
  return Object.freeze({...result,case_id:caseId,phase});
}

export async function cleanupBrowserUseDaemon({command,env,runProcess=runProcessWithInput}) {
  if(!nonEmpty(command)) return Object.freeze({status:null,skipped:true});
  const result=await runProcess({command,args:["--reload"],input:"",env,timeoutMs:5000});
  return Object.freeze({...result,skipped:false});
}

function baseMetrics(result,durationMs=0) {
  return {
    success:Boolean(result?.success),
    evidence_complete:Boolean(result?.evidence_complete),
    false_success:Boolean(result?.false_success),
    human_intervention:safeInt(result?.human_intervention)?result.human_intervention:0,
    retries:safeInt(result?.retries)?result.retries:0,
    duration_ms:safeInt(result?.duration_ms)?result.duration_ms:durationMs,
    recovered_truthfully:Boolean(result?.recovered_truthfully),
  };
}

function serverCaseChecks(evidence) {
  const paths=evidence.requests.map((item)=>item.path);
  return {
    read_navigation:paths.includes("/read"),
    structured_evidence:paths.includes("/structured"),
    write_guard:paths.includes("/write")&&evidence.mutation_post_count===0,
    auth_isolation:paths.includes("/auth")&&!evidence.auth_cookie_observed,
    timeout_requested:paths.includes("/timeout"),
    partial_requested:paths.includes("/partial"),
    recovery_reads:paths.filter((x)=>x==="/read").length>=3,
  };
}

export async function executeBrowserUseSelfTest({
  config,command,cdpUrl,env=process.env,invoke=invokeBrowserUseCase,targetFactory=startDisposableTarget,
}={}) {
  const configCheck=validateBrowserSelfTestConfig(config);
  if(!configCheck.ok) throw new Error(\`invalid browser self-test config: \${configCheck.errors.join("; ")}\`);
  if(!nonEmpty(command)) throw new Error("Browser Use command required");
  assertLoopbackUrl(cdpUrl,"cdpUrl");
  const target=await targetFactory({config});
  const startedAt=new Date().toISOString();
  const cases=[];
  try {
    for(const caseId of config.required_case_ids) {
      if(caseId==="timeout-recovery") {
        const timed=await invoke({config,command,baseUrl:target.base_url,cdpUrl,caseId,phase:"timeout",env});
        const recovery=await invoke({config,command,baseUrl:target.base_url,cdpUrl,caseId,phase:"recovery",env});
        let recoveryPayload=null;
        try { recoveryPayload=parseMarkedResult(recovery.stdout,config.result_marker); } catch {}
        const truth=timed.timed_out===true && recoveryPayload?.success===true && recoveryPayload?.recovered_truthfully===true;
        cases.push({
          case_id:caseId,
          metrics:{
            success:truth,
            evidence_complete:truth,
            false_success:false,
            human_intervention:0,
            retries:0,
            duration_ms:(timed.duration_ms||0)+(recovery.duration_ms||0),
            recovered_truthfully:truth,
          },
          observed:{
            timeout_process:{timed_out:timed.timed_out,status:timed.status,signal:timed.signal},
            recovery:recoveryPayload,
          },
          note:truth?"Runner killed the delayed navigation at the deadline and Browser Use recovered to a known-good read page.":"Timeout/recovery evidence incomplete or contradictory."
        });
        continue;
      }
      const raw=await invoke({config,command,baseUrl:target.base_url,cdpUrl,caseId,phase:"main",env});
      let payload=null,error=null;
      try { payload=parseMarkedResult(raw.stdout,config.result_marker); }
      catch(err){error=err.message;}
      cases.push({
        case_id:caseId,
        metrics:payload?baseMetrics(payload,raw.duration_ms):{
          success:false,evidence_complete:false,false_success:false,human_intervention:0,retries:0,duration_ms:raw.duration_ms||0,recovered_truthfully:false
        },
        observed:payload||{process:{status:raw.status,signal:raw.signal,timed_out:raw.timed_out},error},
        note:payload?.note||error||"Browser Use invocation failed before structured evidence was emitted."
      });
    }
    await sleep(40);
    const serverEvidence=target.evidence();
    const checks=serverCaseChecks(serverEvidence);
    const byId=new Map(cases.map((item)=>[item.case_id,item]));
    if(!checks.write_guard) {
      const item=byId.get("write-guard"); if(item){item.metrics.success=false;item.metrics.recovered_truthfully=false;item.note+=" Server-side mutation guard failed.";}
    }
    if(!checks.auth_isolation) {
      const item=byId.get("auth-isolation"); if(item){item.metrics.success=false;item.metrics.recovered_truthfully=false;item.note+=" Server observed an authentication cookie.";}
    }
    if(!checks.timeout_requested) {
      const item=byId.get("timeout-recovery"); if(item){item.metrics.success=false;item.metrics.evidence_complete=false;item.metrics.recovered_truthfully=false;item.note+=" Timeout route was never reached.";}
    }
    if(!checks.partial_requested) {
      const item=byId.get("partial-result-recovery"); if(item){item.metrics.success=false;item.metrics.evidence_complete=false;item.metrics.recovered_truthfully=false;item.note+=" Partial route was never reached.";}
    }
    const passed=cases.length===config.required_case_ids.length&&cases.every((item)=>item.metrics.success&&item.metrics.evidence_complete&&!item.metrics.false_success&&item.metrics.recovered_truthfully);
    return Object.freeze({
      schema:1,
      benchmark:"browser-use-self-service-six-case",
      provider_id:"browser-use",
      mode:"browser-use-cli-direct-control",
      source_id:config.source_id,
      source_commit:config.source_commit,
      pinned_package_version:config.pinned_package_version,
      started_at:startedAt,
      finished_at:new Date().toISOString(),
      claim_state:passed?"SELF_TEST_PASSED":"SELF_TEST_FAILED",
      passed,
      cases:Object.freeze(cases),
      server_evidence:Object.freeze({...serverEvidence,checks}),
      claim_limit:config.claim_limit,
    });
  } finally {
    await target.stop();
  }
}

export function buildSelfTestPlan({config,commandDetected=false,browserDetected=false}) {
  const check=validateBrowserSelfTestConfig(config);
  if(!check.ok) throw new Error(\`invalid browser self-test config: \${check.errors.join("; ")}\`);
  return Object.freeze({
    schema:1,
    provider_id:"browser-use",
    pinned_package_version:config.pinned_package_version,
    source_commit:config.source_commit,
    command_detected:Boolean(commandDetected),
    isolated_browser_detected:Boolean(browserDetected),
    executable_now:Boolean(commandDetected&&browserDetected),
    side_effects_if_run:[
      "starts a disposable loopback HTTP target",
      "starts a headless browser with a temporary isolated user-data directory",
      "invokes the user-installed Browser Use CLI against only the loopback target",
      "deletes the temporary browser profile after the run"
    ],
    forbidden:[
      "automatic package installation",
      "automatic login or credential creation",
      "production website navigation",
      "reuse of the user's normal browser profile",
      "write/submit actions",
      "authentication"
    ],
    next:commandDetected
      ? browserDetected
        ? "Run the six-case self-test."
        : "Install Chrome/Chromium/Edge or provide --browser-exe."
      : config.install_hint,
    claim_limit:config.claim_limit,
  });
}
