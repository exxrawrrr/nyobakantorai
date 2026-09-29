import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildSelfTestPlan,
  executeBrowserUseSelfTest,
  findBrowserExecutable,
  findBrowserUseCommand,
  startIsolatedBrowser,
  validateBrowserSelfTestConfig,
} from "../packages/browser-self-test/index.mjs";

const root=resolve(import.meta.dirname,"..");
const config=JSON.parse(await readFile(resolve(root,"config/browser-self-test.json"),"utf8"));
const check=validateBrowserSelfTestConfig(config);
if(!check.ok) {
  process.stderr.write("Browser self-test config invalid: "+check.errors.join("; ")+"\n");
  process.exit(1);
}

const argv=process.argv.slice(2);
const command=argv[0]||"plan";
const has=(name)=>argv.includes(name);
const flag=(name)=>{
  const index=argv.indexOf(name);
  return index>=0?argv[index+1]:null;
};
const json=has("--json");
const explicitBrowser=flag("--browser-exe");
const noSandbox=has("--browser-no-sandbox");

function printHumanPlan(plan) {
  console.log("Browser Use self-service six-case runner");
  console.log(\`  pinned package  \${plan.pinned_package_version}\`);
  console.log(\`  CLI detected    \${plan.command_detected?"YES":"NO"}\`);
  console.log(\`  browser detected \${plan.isolated_browser_detected?"YES":"NO"}\`);
  console.log(\`  executable now  \${plan.executable_now?"YES":"NO"}\`);
  console.log(\`  next            \${plan.next}\`);
  console.log("");
  console.log("Safety: loopback target only · disposable browser profile · no login · no writes · no auto-install");
  console.log("Claim limit: "+plan.claim_limit);
}

function printHumanReport(report) {
  console.log(\`Browser Use self-test: \${report.claim_state}\`);
  for(const item of report.cases) {
    console.log(\`  \${item.metrics.success?"PASS":"FAIL"}  \${item.case_id} — \${item.note}\`);
  }
  console.log("");
  console.log(\`Server evidence: mutations=\${report.server_evidence.mutation_post_count} · auth_cookie=\${report.server_evidence.auth_cookie_observed?"YES":"NO"}\`);
  console.log("Claim limit: "+report.claim_limit);
}

async function writeReport(path,report) {
  const out=resolve(path);
  await mkdir(dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(report,null,2)+"\n",{encoding:"utf8",mode:0o600});
  return out;
}

let browserHandle=null;
try {
  const browserUseCommand=await findBrowserUseCommand(config);
  const browserExecutable=await findBrowserExecutable({explicit:explicitBrowser});

  if(command==="plan") {
    const plan=buildSelfTestPlan({
      config,
      commandDetected:Boolean(browserUseCommand),
      browserDetected:Boolean(browserExecutable),
    });
    if(json) process.stdout.write(JSON.stringify(plan,null,2)+"\n");
    else printHumanPlan(plan);
    process.exit(0);
  }

  if(command!=="run") {
    throw new Error("usage: browser-self-test.mjs <plan|run> [--json] [--browser-exe path] [--browser-no-sandbox] [--out report.json]");
  }

  if(!browserUseCommand) {
    throw new Error("Browser Use CLI not found. "+config.install_hint);
  }
  if(!browserExecutable) {
    throw new Error("Chrome/Chromium/Edge not found. Install a compatible browser or pass --browser-exe <path>.");
  }

  browserHandle=await startIsolatedBrowser({
    config,
    browserExecutable,
    noSandbox,
  });
  const report=await executeBrowserUseSelfTest({
    config,
    command:browserUseCommand,
    cdpUrl:browserHandle.cdp_url,
  });
  const output=flag("--out");
  const out=output?await writeReport(output,report):null;
  const response=out?{...report,report_path:out}:report;
  if(json) process.stdout.write(JSON.stringify(response,null,2)+"\n");
  else {
    printHumanReport(report);
    if(out) console.log("Evidence report: "+out);
  }
  if(!report.passed) process.exitCode=1;
} catch(error) {
  process.stderr.write("Browser Use self-test error: "+error.message+"\n");
  process.exitCode=1;
} finally {
  await browserHandle?.stop().catch(()=>{});
}
