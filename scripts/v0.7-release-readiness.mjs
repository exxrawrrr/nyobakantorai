import { buildV07ReadinessSnapshot,readAndAssessV07ReleaseReadiness } from "../packages/v0.7-release-readiness/index.mjs";

const requireReady=process.argv.includes("--require-ready");
const {config,assessment}=await readAndAssessV07ReleaseReadiness();
const snapshot=assessment.ok?buildV07ReadinessSnapshot({config,assessment}):null;

console.log(JSON.stringify({assessment,snapshot},null,2));

if(!assessment.ok) process.exitCode=1;
else if(requireReady&&assessment.decision!=="READY") process.exitCode=2;
