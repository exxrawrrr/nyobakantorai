import { buildV1ReadinessSnapshot, readAndAssessV1ReleaseReadiness } from "../packages/v1.0-release-readiness/index.mjs";

const requireReady=process.argv.includes("--require-ready");
const {config,assessment}=await readAndAssessV1ReleaseReadiness();
let snapshot=null;
if(assessment.ok)snapshot=buildV1ReadinessSnapshot({config,assessment});
process.stdout.write(JSON.stringify({assessment,snapshot},null,2)+"\n");
if(!assessment.ok)process.exit(1);
if(requireReady&&(assessment.decision!=="READY"||assessment.promotion_ready!==true))process.exit(2);
