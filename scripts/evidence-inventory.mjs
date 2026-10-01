import { readAndValidateEvidenceInventory,buildEvidenceClassificationSnapshot } from "../packages/evidence-classification/index.mjs";
const {inventory,validation}=await readAndValidateEvidenceInventory();const snapshot=validation.ok?buildEvidenceClassificationSnapshot({inventory,validation}):null;
console.log(JSON.stringify({validation,snapshot},null,2));if(process.argv.includes("--check")&&!validation.ok)process.exitCode=1;
