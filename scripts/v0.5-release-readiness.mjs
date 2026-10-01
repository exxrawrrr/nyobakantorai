import { buildV05ReadinessSnapshot,readAndAssessV05ReleaseReadiness } from "../packages/release-readiness/index.mjs";
const requireReady=process.argv.includes("--require-ready");
const {config,assessment}=await readAndAssessV05ReleaseReadiness();
const snapshot=assessment.ok?buildV05ReadinessSnapshot({config,assessment}):null;
console.log(JSON.stringify({assessment,snapshot},null,2));
if(!assessment.ok)process.exitCode=1;
else if(requireReady&&assessment.decision!=="READY")process.exitCode=2;
