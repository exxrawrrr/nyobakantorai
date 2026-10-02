import { buildV06ReadinessSnapshot,readAndAssessV06ReleaseReadiness } from "../packages/release-readiness/index.mjs";

const requireReady=process.argv.includes("--require-ready");
const {config,assessment}=await readAndAssessV06ReleaseReadiness();
const snapshot=assessment.ok?buildV06ReadinessSnapshot({config,assessment}):null;

console.log(JSON.stringify({assessment,snapshot},null,2));

if(!assessment.ok) process.exitCode=1;
else if(requireReady&&assessment.decision!=="READY") process.exitCode=2;
