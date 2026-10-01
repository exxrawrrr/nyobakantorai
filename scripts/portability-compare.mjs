import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPortabilityReferenceCase } from "../packages/portability-reference/index.mjs";
import { comparePortabilityReferenceRuns } from "../packages/portability-comparator/index.mjs";

const [leftPath,rightPath]=process.argv.slice(2);
if(!leftPath || !rightPath){
  console.error("Usage: node scripts/portability-compare.mjs <hermes-run.json> <codex-run.json>");
  process.exit(2);
}

const root=process.cwd();
const reference=await buildPortabilityReferenceCase({root});
const left=JSON.parse(await readFile(resolve(root,leftPath),"utf8"));
const right=JSON.parse(await readFile(resolve(root,rightPath),"utf8"));
const report=comparePortabilityReferenceRuns({reference,runs:[left,right]});
console.log(JSON.stringify(report,null,2));
process.exit(report.state==="PORTABILITY_VERIFIED_FOR_REFERENCE_CASE" ? 0 : 3);
