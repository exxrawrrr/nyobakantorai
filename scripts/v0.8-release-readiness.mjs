import { buildV08ReadinessSnapshot, readAndAssessV08ReleaseReadiness } from "../packages/v0.8-release-readiness/index.mjs";

const requireReady=process.argv.includes("--require-ready");
const {config,assessment}=await readAndAssessV08ReleaseReadiness();
let snapshot=null;
if(assessment.ok) snapshot=buildV08ReadinessSnapshot({config,assessment});
process.stdout.write(JSON.stringify({assessment,snapshot},null,2)+"\n");
if(!assessment.ok) process.exit(1);
if(requireReady&&assessment.decision!=="READY") process.exit(2);
