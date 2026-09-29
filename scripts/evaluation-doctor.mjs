import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateProviderEvaluationSet } from "../packages/provider-evaluation/index.mjs";
import { validateRealTaskDataset } from "../packages/real-task-evaluation/index.mjs";

const root = resolve(import.meta.dirname, "..");
const readJson = async (rel) => JSON.parse(await readFile(resolve(root, rel), "utf8"));

export async function inspectEvaluationReadiness() {
  const [
    contracts,
    sources,
    integrations,
    browserResult,
    memoryResult,
    realPolicy,
    realTaskBaselinePolicy,
    realDataset,
    employees,
  ] = await Promise.all([
    readJson("config/provider-evaluation-contracts.json"),
    readJson("config/upstream-sources.json"),
    readJson("config/integrations.json"),
    readJson("benchmarks/provider-evaluations/browser-results.json"),
    readJson("benchmarks/provider-evaluations/memory-results.json"),
    readJson("config/real-task-evaluation.json"),
    readJson("config/real-task-baseline.json"),
    readJson("benchmarks/real-tasks/dataset.json"),
    readJson("config/employees.json"),
  ]);

  const browser = validateProviderEvaluationSet({
    domain:"browser",
    result:browserResult,
    contracts,
    sources,
    integrations,
  });
  const memory = validateProviderEvaluationSet({
    domain:"memory",
    result:memoryResult,
    contracts,
    sources,
    integrations,
  });
  const realTasks = validateRealTaskDataset({
    dataset:realDataset,
    policy:realPolicy,
    employeeIds:employees.employees.map((item) => item.id),
  });

  const blockers = [];

  for (const item of browser.evaluated) {
    if (item.status === "NOT_RUN") blockers.push({
      area:"browser",
      id:item.provider_id,
      state:"UNPROVEN",
      blocker:"No live provider evaluation has been recorded.",
      next:"Run the required disposable/local browser cases and attach evidence refs before changing claim_state.",
    });
    else if (!item.acceptance_passed) blockers.push({
      area:"browser",
      id:item.provider_id,
      state:item.status,
      blocker:"Recorded browser evaluation does not pass the acceptance gate.",
      next:"Fix the failed case(s), rerun against the pinned provider version, and preserve the failed evidence.",
    });
  }

  for (const item of memory.evaluated) {
    if (item.status === "NOT_RUN") blockers.push({
      area:"memory",
      id:item.provider_id,
      state:"UNPROVEN",
      blocker:"No live memory-provider evaluation has been recorded.",
      next:"Run isolation/read-write/provenance/export/delete/secret/shared-boundary cases before candidate status.",
    });
    else if (!item.acceptance_passed) blockers.push({
      area:"memory",
      id:item.provider_id,
      state:item.status,
      blocker:"Recorded memory evaluation does not pass the acceptance gate.",
      next:"Resolve isolation/evidence/export/delete/provenance/secret failures and rerun from a clean provider state.",
    });
  }

  if (realDataset.status === "NOT_READY") blockers.push({
    area:"real_tasks",
    id:"baseline",
    state:"UNPROVEN",
    blocker:"No eligible real-task baseline cases have been collected.",
    next:`Collect at least ${realPolicy.publication_gate.minimum_cases} redacted real tasks with evidence and complete metrics. Synthetic/demo/generated fixtures do not count.`,
  });
  else if (!realTasks.acceptance_passed) blockers.push({
    area:"real_tasks",
    id:"baseline",
    state:realDataset.status,
    blocker:"Real-task dataset has not passed the publication gate.",
    next:"Complete missing eligible cases/evidence/metrics/redaction review and eliminate false-successes.",
  });

  const invalid = [
    ...browser.errors.map((error) => ({ area:"browser", error })),
    ...memory.errors.map((error) => ({ area:"memory", error })),
    ...realTasks.errors.map((error) => ({ area:"real_tasks", error })),
  ];

  return Object.freeze({
    schema:1,
    valid:invalid.length === 0,
    release_claim_safe:invalid.length === 0,
    live_evaluation_complete:
      browser.evaluated.length > 0 &&
      browser.evaluated.every((item) => item.status === "COMPLETED" && item.acceptance_passed) &&
      memory.evaluated.length > 0 &&
      memory.evaluated.every((item) => item.status === "COMPLETED" && item.acceptance_passed) &&
      realTasks.acceptance_passed,
    browser,
    memory,
    real_tasks:{
      status:realDataset.status,
      claim_state:realDataset.claim_state,
      cases:realTasks.cases,
      minimum_cases_required:realPolicy.publication_gate.minimum_cases,
      remaining_cases:Math.max(0,realPolicy.publication_gate.minimum_cases-realTasks.cases),
      false_successes:realTasks.false_successes,
      unique_sources:realTasks.unique_sources,
      acceptance_passed:realTasks.acceptance_passed,
      collection_tool:"npm run real-task:baseline",
      canonical_dataset:realTaskBaselinePolicy.canonical_dataset,
    },
    blockers:Object.freeze(blockers),
    invalid:Object.freeze(invalid),
  });
}

function printHuman(report) {
  console.log("nyobakantorai evaluation doctor");
  console.log("");
  console.log(`Contracts/data valid: ${report.valid ? "YES" : "NO"}`);
  console.log(`All live evaluations complete: ${report.live_evaluation_complete ? "YES" : "NO"}`);
  console.log("");

  const browserStates = report.browser.evaluated
    .map((item) => `${item.provider_id}=${item.status}/${item.acceptance_passed ? "PASS" : "UNPROVEN_OR_FAIL"}`)
    .join(", ");
  const memoryStates = report.memory.evaluated
    .map((item) => `${item.provider_id}=${item.status}/${item.acceptance_passed ? "PASS" : "UNPROVEN_OR_FAIL"}`)
    .join(", ");

  console.log(`Browser: ${browserStates || "none"}`);
  console.log(`Memory: ${memoryStates || "none"}`);
  console.log(`Real tasks: ${report.real_tasks.status}, cases=${report.real_tasks.cases}/${report.real_tasks.minimum_cases_required}, remaining=${report.real_tasks.remaining_cases}, false_successes=${report.real_tasks.false_successes}, acceptance=${report.real_tasks.acceptance_passed}`);

  if (report.invalid.length) {
    console.log("");
    console.log("INVALID:");
    for (const item of report.invalid) console.log(`- [${item.area}] ${item.error}`);
  }

  if (report.blockers.length) {
    console.log("");
    console.log("OPEN EVIDENCE BLOCKERS:");
    for (const item of report.blockers) {
      console.log(`- [${item.area}/${item.id}] ${item.blocker}`);
      console.log(`  next: ${item.next}`);
    }
  }

  console.log("");
  console.log("Truth boundary: cataloged != installed != connected != authorized != executed != succeeded != verified");
}

async function main() {
  const report = await inspectEvaluationReadiness();
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.valid) process.exitCode = 1;
  if (process.argv.includes("--require-live") && !report.live_evaluation_complete) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
