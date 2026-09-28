import test from "node:test";
import assert from "node:assert/strict";
import { createNullAdapter, defineRuntimeAdapter, snapshotRuntime } from "./index.mjs";

test("adapter definition requires a safe slug and read-only contract", () => {
  assert.throws(() => defineRuntimeAdapter({ id: "BAD ID", health(){}, listTasks(){} }), /lowercase slug/);
  assert.throws(() => defineRuntimeAdapter({ id: "demo", capabilities: { dispatch: true }, health(){}, listTasks(){} }), /read-only/);
  assert.throws(() => defineRuntimeAdapter({ id: "demo", capabilities: { external_write: true }, health(){}, listTasks(){} }), /read-only/);
});

test("snapshot normalizes and bounds task data without retaining extra fields", async () => {
  const adapter = defineRuntimeAdapter({
    id: "demo",
    label: "Demo adapter",
    capabilities: { execution_receipts: true },
    async health() { return { ok: true, state: "connected", secret: "never expose" }; },
    async listTasks() {
      return [
        { task_id: "t_1", assignee: "subagjo", status: "blocked", title: "One", updated_at: "2026-09-28T00:00:00Z", password: "drop-me" },
        { task_id: "t_2", assignee: "siti", status: "done", title: "Two", extra: { nested: true } },
      ];
    },
  });
  const snapshot = await snapshotRuntime(adapter, { maxTasks: 1 });
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.tasks.length, 1);
  assert.deepEqual(Object.keys(snapshot.tasks[0]), ["id", "assignee", "state", "title", "updated_at", "evidence_ref"]);
  assert.equal(snapshot.tasks[0].id, "t_1");
  assert.equal(snapshot.tasks[0].state, "BLOCKED");
  assert.equal(snapshot.capabilities.write, false);
  assert.equal(snapshot.capabilities.dispatch, false);
});

test("runtime errors fail closed without leaking exception text", async () => {
  const adapter = defineRuntimeAdapter({
    id: "broken",
    async health() { throw new Error("token=super-secret"); },
    async listTasks() { return []; },
  });
  const snapshot = await snapshotRuntime(adapter);
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.state, "ERROR");
  assert.equal(snapshot.error_category, "ADAPTER_ERROR");
  assert.equal(JSON.stringify(snapshot).includes("super-secret"), false);
});

test("timeouts fail closed", async () => {
  const adapter = defineRuntimeAdapter({
    id: "slow",
    async health() { return new Promise(() => {}); },
    async listTasks() { return []; },
  });
  const snapshot = await snapshotRuntime(adapter, { timeoutMs: 10 });
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.error_category, "TIMEOUT");
});

test("null adapter explicitly reports not configured", async () => {
  const snapshot = await snapshotRuntime(createNullAdapter());
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.state, "NOT_CONFIGURED");
  assert.deepEqual(snapshot.tasks, []);
});
