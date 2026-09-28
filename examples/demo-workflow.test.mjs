import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("public demo completes five synthetic tasks with independent QA", () => {
  const stdout = execFileSync(process.execPath, ["examples/demo-workflow.mjs"], { encoding: "utf8" });
  const result = JSON.parse(stdout);
  assert.equal(result.synthetic_only, true);
  assert.equal(result.tasks.length, 5);
  assert.equal(result.verified, 5);
  assert.ok(result.events >= 20);
  assert.ok(result.tasks.every((task) => task.lifecycle_status === "VERIFIED"));
  assert.ok(result.tasks.every((task) => task.evidence_ref.startsWith("demo://qa/")));
});
