import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildCogneeSelfTestPlan,
  createCogneeHttpClient,
  executeCogneeSelfTest,
  isLoopbackCogneeUrl,
  normalizeCogneeBaseUrl,
  validateCogneeSelfTestConfig,
} from "../packages/cognee-self-test/index.mjs";

const root=resolve(import.meta.dirname,"..");
const config=JSON.parse(await readFile(resolve(root,"config/cognee-self-test.json"),"utf8"));
const check=validateCogneeSelfTestConfig(config);
if(!check.ok){
  process.stderr.write("Cognee self-test config invalid: "+check.errors.join("; ")+"\n");
  process.exit(1);
}

const argv=process.argv.slice(2);
const command=argv[0]||"plan";
const has=(name)=>argv.includes(name);
const flag=(name)=>{
  const i=argv.indexOf(name);
  return i>=0?argv[i+1]:null;
};
const json=has("--json");
const allowRemote=has("--allow-remote");
const envBase=process.env[config.base_url_env]||"";
const baseUrl=flag("--base-url")||envBase||config.default_local_url;
const apiKey=process.env[config.api_key_env]||"";

function printPlan(plan){
  console.log("Cognee self-service eight-case memory runner");
  console.log("  integration     "+plan.integration_version);
  console.log("  Cognee          "+plan.cognee_version);
  console.log("  target          "+plan.effective_base_url);
  console.log("  target scope    "+plan.target_scope);
  console.log("  API key signal  "+(plan.api_key_present?"PRESENT":"ABSENT"));
  console.log("  remote opt-in   "+(plan.remote_opt_in?"YES":"NO"));
  console.log("  config ready    "+(plan.configuration_ready?"YES":"NO"));
  console.log("  reachability    "+plan.endpoint_reachability);
  console.log("");
  console.log("No provider call, install, login, or key mint occurs during plan.");
  console.log("Claim limit: "+plan.claim_limit);
}

function printReport(report){
  console.log("Cognee self-test: "+report.claim_state);
  for(const item of report.cases){
    console.log("  "+(item.metrics.success?"PASS":"FAIL")+"  "+item.case_id+" — "+item.note);
  }
  console.log("");
  console.log("Cleanup: "+(report.cleanup_complete?"VERIFIED":"INCOMPLETE"));
  console.log("Provider calls recorded as metadata only: "+report.provider_calls.length);
  console.log("Claim limit: "+report.claim_limit);
}

async function writeReport(path,report){
  const out=resolve(path);
  await mkdir(dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(report,null,2)+"\n",{encoding:"utf8",mode:0o600});
  return out;
}

try{
  const normalized=normalizeCogneeBaseUrl(baseUrl);
  const loopback=isLoopbackCogneeUrl(normalized);
  const plan=buildCogneeSelfTestPlan({
    config,
    baseUrl:normalized,
    apiKeyPresent:Boolean(apiKey),
    allowRemote,
  });

  if(command==="plan"){
    if(json) process.stdout.write(JSON.stringify(plan,null,2)+"\n");
    else printPlan(plan);
    process.exit(0);
  }

  if(command!=="run"){
    throw new Error("usage: cognee-self-test.mjs <plan|run> [--json] [--base-url URL] [--allow-remote] [--out report.json]");
  }

  if(!loopback&&!allowRemote){
    throw new Error("Remote Cognee target blocked. Re-run with --allow-remote only after confirming this endpoint may receive temporary evaluation datasets.");
  }
  if(!loopback&&!apiKey){
    throw new Error("Remote Cognee target requires COGNEE_API_KEY in the environment. Keys are not accepted as CLI arguments.");
  }

  const client=createCogneeHttpClient({
    baseUrl:normalized,
    apiKey,
    timeoutMs:config.request_timeout_ms,
  });
  const report=await executeCogneeSelfTest({config,client});
  const output=flag("--out");
  const out=output?await writeReport(output,report):null;
  const response=out?{...report,report_path:out}:report;
  if(json) process.stdout.write(JSON.stringify(response,null,2)+"\n");
  else{
    printReport(report);
    if(out) console.log("Evidence report: "+out);
  }
  if(!report.passed) process.exitCode=1;
}catch(error){
  process.stderr.write("Cognee self-test error: "+String(error?.message||error)+"\n");
  process.exitCode=1;
}
