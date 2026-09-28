import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("runtime adapter example emits a bounded read-only snapshot", () => {
  const result = JSON.parse(execFileSync(process.execPath, ["examples/runtime-adapter.mjs"], { encoding: "utf8" }));
  assert.equal(result.adapter_id, "synthetic");
  assert.equal(result.connected, true);
  assert.equal(result.capabilities.write, false);
  assert.equal(result.capabilities.dispatch, false);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].evidence_ref, "demo://runtime/t_demo_1");
});
