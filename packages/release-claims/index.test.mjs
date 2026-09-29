import test from "node:test";
import assert from "node:assert/strict";
import { inspectEvaluationReadiness } from "../../scripts/evaluation-doctor.mjs";
import { buildReleaseClaimSnapshot } from "./index.mjs";

test("release claims preserve mixed evaluated and UNPROVEN provider state", async () => {
  const report = await inspectEvaluationReadiness();
  const snapshot = buildReleaseClaimSnapshot(report);
  assert.equal(snapshot.evaluation_records_valid, true);
  assert.equal(snapshot.live_evaluation_complete, false);
  assert.ok(snapshot.browser.length >= 2);
  assert.deepEqual(
    snapshot.browser.find((item)=>item.provider_id==="playwright-mcp"),
    {provider_id:"playwright-mcp",status:"COMPLETED",claim_state:"EVALUATED_CANDIDATE",acceptance_passed:true}
  );
  assert.deepEqual(
    snapshot.browser.find((item)=>item.provider_id==="browser-use"),
    {provider_id:"browser-use",status:"NOT_RUN",claim_state:"UNPROVEN",acceptance_passed:false}
  );
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
