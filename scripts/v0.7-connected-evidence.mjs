import { assessV07ConnectedEvidence } from "../packages/v0.7-connected-evidence/index.mjs";

const requirePass=process.argv.includes("--require-pass");
const assessment=await assessV07ConnectedEvidence();
console.log(JSON.stringify({assessment},null,2));

if(!assessment.ok) process.exitCode=1;
else if(requirePass&&assessment.connected_office_decision!=="PASS") process.exitCode=2;
