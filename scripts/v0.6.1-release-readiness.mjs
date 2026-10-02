import { buildV061ReadinessSnapshot,readAndAssessV061ReleaseReadiness } from "../packages/release-readiness/index.mjs";

const requireReady=process.argv.includes("--require-ready");
const {config,assessment}=await readAndAssessV061ReleaseReadiness();
const snapshot=assessment.ok?buildV061ReadinessSnapshot({config,assessment}):null;

console.log(JSON.stringify({assessment,snapshot},null,2));

if(!assessment.ok) process.exitCode=1;
else if(requireReady&&assessment.decision!=="READY") process.exitCode=2;
