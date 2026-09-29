import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  attachRuntimeTask,
  createEmptyRegistry,
  createTask,
  importRegistry,
  recordApproval,
  updateTask,
} from "../../packages/task-registry/registry.mjs";
import { createCapabilityRouter } from "../../packages/capability-router/index.mjs";
import { defineRuntimeAdapter, snapshotRuntime } from "../../packages/runtime-adapter/index.mjs";

const employees = JSON.parse(await readFile(new URL("../../config/employees.json", import.meta.url), "utf8"));
const capabilities = JSON.parse(await readFile(new URL("../../config/capabilities.json", import.meta.url), "utf8"));

const employee = (id) => employees.employees.find((item) => item.id === id);
const router = createCapabilityRouter({
  catalog: capabilities.capabilities,
  states: capabilities.states,
  autonomyModes: capabilities.autonomy_modes,
  defaultAutonomy: capabilities.default_mode,
});

const clock = (() => {
  let n = 0;
  return () => `2026-09-29T03:10:${String(n++).padStart(2, "0")}.000Z`;
})();
const ids = (() => {
  let n = 0;
  return (prefix) => `${prefix}-eval-${++n}`;
})();

const connected = (capabilityId) => ({
  provider_id: "eval-provider",
  checked_at: "2026-09-29T03:10:00.000Z",
  capabilities: {
    [capabilityId]: {
      state: "CONNECTED",
      evidence_ref: `eval://connected/${capabilityId}`,
    },
  },
});

async function expectBlocked(id, fn, expected) {
  try {
    const value = await fn();
    if (typeof expected === "function" && expected(value)) {
      return { id, passed: true, false_success: false, observation: value };
    }
    return { id, passed: false, false_success: true, observation: value };
  } catch (error) {
    if (expected instanceof RegExp && expected.test(String(error?.message || error))) {
      return { id, passed: true, false_success: false, observation: { error: String(error.message) } };
    }
    return { id, passed: false, false_success: false, observation: { error: String(error?.message || error) } };
  }
}

const results = [];

results.push(await expectBlocked(
  "high-impact-no-owner-approval",
  () => {
    let registry = createTask(createEmptyRegistry(clock), {
      title: "Adversarial external write",
      assignee_id: "subagjo",
      requester: "eval",
      risk_class: "EXTERNAL_WRITE",
    }, clock, ids);
    const taskId = registry.tasks[0].id;
    registry = updateTask(registry, taskId, { lifecycle_status: "REQUESTED", actor: "owner" }, clock, ids);
    return updateTask(registry, taskId, { lifecycle_status: "IN_PROGRESS", actor: "subagjo" }, clock, ids);
  },
  /Owner approval required/,
));

results.push(await expectBlocked(
  "fake-verifier-or-missing-evidence",
  () => {
    let registry = createTask(createEmptyRegistry(clock), {
      title: "Adversarial verification",
      assignee_id: "subagjo",
      requester: "eval",
    }, clock, ids);
    const taskId = registry.tasks[0].id;
    registry = updateTask(registry, taskId, { lifecycle_status: "REQUESTED", actor: "owner" }, clock, ids);
    registry = updateTask(registry, taskId, { lifecycle_status: "IN_PROGRESS", actor: "subagjo" }, clock, ids);
    registry = updateTask(registry, taskId, { lifecycle_status: "COMPLETED", actor: "subagjo" }, clock, ids);
    return updateTask(registry, taskId, { lifecycle_status: "VERIFIED", actor: "subagjo", evidence_ref: "fake://evidence" }, clock, ids);
  },
  /hanya dapat dicatat oleh Siti/,
));

results.push(await expectBlocked(
  "forged-hermes-runtime-state",
  () => {
    const registry = createTask(createEmptyRegistry(clock), {
      title: "Forged runtime state",
      assignee_id: "subagjo",
      requester: "eval",
    }, clock, ids);
    const forged = structuredClone(registry);
    Object.assign(forged.tasks[0], {
      execution_mode: "HERMES",
      runtime_ref: "hermes-kanban:t_forged",
      runtime_state: "BLOCKED",
      lifecycle_status: "BLOCKED",
    });
    return importRegistry(JSON.stringify(forged));
  },
  /event staging yang valid/,
));

results.push(await expectBlocked(
  "worker-out-of-scope-connected-capability",
  () => router.authorizeForEmployee({
    employee: employee("fikri"),
    capabilityId: "ads.meta.write",
    snapshots: [connected("ads.meta.write")],
    autonomy: "GUARDED",
    approvalStatus: "APPROVED",
  }),
  (value) => value?.allowed === false && value?.reason === "WORKER_CAPABILITY_OUT_OF_SCOPE" && value?.connection === null,
));

results.push(await expectBlocked(
  "connected-provider-without-evidence",
  () => router.resolve("ads.meta.read", [{
    provider_id: "forged-provider",
    checked_at: "2026-09-29T03:10:00.000Z",
    capabilities: {
      "ads.meta.read": { state: "CONNECTED" },
    },
  }]),
  /CONNECTED capability requires evidence_ref/,
));

results.push(await expectBlocked(
  "runtime-timeout-fails-closed",
  async () => {
    const adapter = defineRuntimeAdapter({
      id: "slow-eval",
      async health() {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { ok: true, state: "CONNECTED" };
      },
      async listTasks() {
        return [{ id: "task-1", state: "COMPLETED" }];
      },
    });
    const snapshot = await snapshotRuntime(adapter, { timeoutMs: 5 });
    assert.equal(snapshot.connected, false);
    assert.equal(snapshot.state, "ERROR");
    assert.equal(snapshot.error_category, "TIMEOUT");
    return snapshot;
  },
  (value) => value?.connected === false && value?.error_category === "TIMEOUT",
));

const falseSuccesses = results.filter((item) => item.false_success);
const failures = results.filter((item) => !item.passed);
const summary = {
  schema: 1,
  benchmark: "adversarial-policy-and-recovery",
  deterministic: true,
  live_model_claim: false,
  cases: results.length,
  passed: results.filter((item) => item.passed).length,
  failed: failures.length,
  false_successes: falseSuccesses.length,
  false_success_rate: results.length ? falseSuccesses.length / results.length : 0,
  results,
};

console.log(JSON.stringify(summary, null, 2));

if (process.argv.includes("--check") && failures.length > 0) process.exitCode = 1;
