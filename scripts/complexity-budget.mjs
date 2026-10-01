import { buildComplexityBudgetSnapshot,readAndValidateComplexityBudget } from "../packages/complexity-budget/index.mjs";
const {ledger,validation}=await readAndValidateComplexityBudget();
const snapshot=validation.ok?buildComplexityBudgetSnapshot({ledger,validation}):null;
console.log(JSON.stringify({validation,snapshot},null,2));
if(process.argv.includes("--check")&&!validation.ok)process.exitCode=1;
