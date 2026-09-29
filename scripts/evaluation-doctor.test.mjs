import test from "node:test";
import assert from "node:assert/strict";
import { inspectEvaluationReadiness } from "./evaluation-doctor.mjs";

test("mixed provider evidence is valid while unresolved live gaps remain blocked", async () => {
  const report = await inspectEvaluationReadiness();
  assert.equal(report.valid, true, report.invalid.map((item)=>item.error).join("\n"));
  assert.equal(report.live_evaluation_complete, false);

  const browser = report.browser.evaluated;
  const memory = report.memory.evaluated;
  assert.ok(browser.length >= 2);
  const playwright=browser.find((item)=>item.provider_id==="playwright-mcp");
  const browserUse=browser.find((item)=>item.provider_id==="browser-use");
  assert.deepEqual(playwright,{provider_id:"playwright-mcp",status:"COMPLETED",acceptance_passed:true});
  assert.deepEqual(browserUse,{provider_id:"browser-use",status:"NOT_RUN",acceptance_passed:false});
  assert.ok(memory.length >= 1);
  assert.ok(memory.every((item) => item.status === "NOT_RUN" && item.acceptance_passed === false));

  assert.equal(report.real_tasks.status, "NOT_READY");
  assert.equal(report.real_tasks.cases, 0);
  assert.equal(report.real_tasks.acceptance_passed, false);
  assert.ok(report.blockers.some((item) => item.area === "browser"));
  assert.ok(report.blockers.some((item) => item.area === "memory"));
  assert.ok(report.blockers.some((item) => item.area === "real_tasks"));
});

test("evaluation doctor never converts unproven records into success claims", async () => {
  const report = await inspectEvaluationReadiness();
  assert.equal(report.release_claim_safe, true);
  assert.equal(report.live_evaluation_complete, false);
  for (const blocker of report.blockers) {
    assert.notEqual(blocker.state, "VERIFIED");
  }
});
