import test from "node:test";
import assert from "node:assert/strict";
import { inspectEvaluationReadiness } from "../../scripts/evaluation-doctor.mjs";
import { buildReleaseClaimSnapshot } from "./index.mjs";

test("release claims preserve honest UNPROVEN provider and real-task state", async () => {
  const report = await inspectEvaluationReadiness();
  const snapshot = buildReleaseClaimSnapshot(report);
  assert.equal(snapshot.evaluation_records_valid, true);
  assert.equal(snapshot.live_evaluation_complete, false);
  assert.ok(snapshot.browser.length >= 2);
  assert.ok(snapshot.browser.every((item) => item.status === "NOT_RUN" && item.acceptance_passed === false));
  assert.ok(snapshot.memory.length >= 1);
  assert.ok(snapshot.memory.every((item) => item.status === "NOT_RUN" && item.acceptance_passed === false));
  assert.equal(snapshot.real_tasks.status, "NOT_READY");
  assert.equal(snapshot.real_tasks.cases, 0);
  assert.equal(snapshot.real_tasks.acceptance_passed, false);
});

test("release claims fail closed when evaluation records are invalid", () => {
  assert.throws(
    () => buildReleaseClaimSnapshot({ valid:false }),
    /invalid evaluation records/
  );
});
