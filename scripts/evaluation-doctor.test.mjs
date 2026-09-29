import test from "node:test";
import assert from "node:assert/strict";
import { inspectEvaluationReadiness } from "./evaluation-doctor.mjs";

test("honest NOT_RUN provider baselines are valid but remain blocked", async () => {
  const report = await inspectEvaluationReadiness();
  assert.equal(report.valid, true, report.invalid.map((item)=>item.error).join("\n"));
  assert.equal(report.live_evaluation_complete, false);

  const browser = report.browser.evaluated;
  const memory = report.memory.evaluated;
  assert.ok(browser.length >= 2);
  assert.ok(browser.every((item) => item.status === "NOT_RUN" && item.acceptance_passed === false));
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
