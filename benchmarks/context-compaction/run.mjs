import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileGuardPacket, verifyProtectedAtoms } from "../../packages/context-guard/index.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const fixtures = JSON.parse(await readFile(resolve(root, "fixtures.json"), "utf8"));
const check = process.argv.includes("--check");
const results = [];

for (const item of fixtures.cases) {
  const packet = compileGuardPacket({
    objective: item.objective,
    sources: [{ id: item.id, type: "synthetic-benchmark", text: item.source }],
  });
  const fidelity = verifyProtectedAtoms({ original: item.source, compiled: packet.l0 });
  const requiredMissing = item.required_facts.filter((fact) => !packet.l0.includes(fact));
  const originalTokens = packet.token_budget.original_estimate;
  const compiledTokens = packet.token_budget.l0_estimate;
  const reduction = originalTokens ? 1 - compiledTokens / originalTokens : 0;
  const requiredRecall = item.required_facts.length
    ? (item.required_facts.length - requiredMissing.length) / item.required_facts.length
    : 1;
  const ok =
    fidelity.recall === 1 &&
    requiredRecall === 1 &&
    reduction >= item.minimum_reduction;

  results.push({
    id: item.id,
    ok,
    original_tokens_est: originalTokens,
    l0_tokens_est: compiledTokens,
    reduction: Number(reduction.toFixed(4)),
    protected_atom_recall: Number(fidelity.recall.toFixed(4)),
    required_fact_recall: Number(requiredRecall.toFixed(4)),
    missing_protected_atoms: fidelity.missing,
    missing_required_facts: requiredMissing,
    minimum_reduction: item.minimum_reduction,
  });
}

const summary = {
  schema: 1,
  benchmark: "fikri-deterministic-context-guard",
  fixture_type: "synthetic-regression",
  live_model_quality_claim: false,
  cases: results.length,
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok).length,
  average_reduction: Number((results.reduce((sum, item) => sum + item.reduction, 0) / Math.max(1, results.length)).toFixed(4)),
  minimum_protected_atom_recall: Math.min(...results.map((item) => item.protected_atom_recall)),
  minimum_required_fact_recall: Math.min(...results.map((item) => item.required_fact_recall)),
  results,
};

console.log(JSON.stringify(summary, null, 2));

if (check && summary.failed > 0) {
  process.exitCode = 1;
}
