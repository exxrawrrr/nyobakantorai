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
import {
  createExecutionReceiptPayload,
  executionReceiptRef,
  generateReceiptKeyPair,
  signExecutionReceipt,
  verifyExecutionReceipt,
} from "../../packages/execution-receipt/index.mjs";

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

async function expectAllowed(id, fn, expected = (value) => value?.ok === true) {
  try {
    const value = await fn();
    if (expected(value)) return { id, passed:true, false_success:false, observation:value };
    return { id, passed:false, false_success:false, observation:value };
  } catch (error) {
    return { id, passed:false, false_success:false, observation:{ error:String(error?.message || error) } };
  }
}

function signedReceiptFixture() {
  const keys = generateReceiptKeyPair();
  const payload = createExecutionReceiptPayload({
    receipt_id:"receipt.maya.adversarial.0001",
    task_id:"task-adversarial-42",
    employee_id:"maya",
    action:"Apply approved Meta campaign change",
    capability_id:"ads.meta.write",
    risk_class:"PAID_ACTION",
    autonomy:"GUARDED",
    authorization:{
      allowed:true,
      reason:"CONNECTED_AND_OWNER_APPROVED",
      approval_ref:"approval://task-adversarial-42/owner",
    },
    started_at:"2026-09-29T03:10:00.000Z",
    finished_at:"2026-09-29T03:11:00.000Z",
    result:{
      state:"SUCCEEDED",
      summary:"Approved mutation completed and provider read-back matched.",
      artifact_refs:["artifact://meta/adversarial-42.json"],
      evidence_refs:["runtime://meta/adversarial-42"],
    },
    runtime:{
      provider:"meta-ads",
      runtime_ref:"runtime://meta/adversarial-42",
      provider_version:"test-fixture",
    },
    usage:{
      input_tokens:100,
      output_tokens:20,
      cost_known:true,
      cost_amount:0.01,
      currency:"USD",
    },
  });
  const envelope = signExecutionReceipt(payload, {
    privateKeyPem:keys.private_key_pem,
    keyId:"local:adversarial-receipt",
  });
  return { keys, envelope, ref:executionReceiptRef(envelope) };
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

const completedSubagjoTask = () => {
  let registry = createTask(createEmptyRegistry(clock), {
    title: "Adversarial verification",
    assignee_id: "subagjo",
    requester: "eval",
  }, clock, ids);
  const taskId = registry.tasks[0].id;
  registry = updateTask(registry, taskId, { lifecycle_status: "REQUESTED", actor: "owner" }, clock, ids);
  registry = updateTask(registry, taskId, { lifecycle_status: "IN_PROGRESS", actor: "subagjo" }, clock, ids);
  registry = updateTask(registry, taskId, { lifecycle_status: "COMPLETED", actor: "subagjo" }, clock, ids);
  return { registry, taskId };
};

results.push(await expectBlocked(
  "self-verifier-rejected",
  () => {
    const { registry, taskId } = completedSubagjoTask();
    return updateTask(registry, taskId, {
      lifecycle_status: "VERIFIED",
      actor: "subagjo",
      evidence_ref: "fake://self-evidence",
    }, clock, ids);
  },
  /cannot independently verify its own work/,
));

results.push(await expectBlocked(
  "unapproved-independent-verifier-rejected",
  () => {
    const { registry, taskId } = completedSubagjoTask();
    const policy = employee("subagjo").verification_policy;
    const outsider = employees.employees.find((item) =>
      item.id !== "subagjo" && !policy.reviewer_candidates.includes(item.id)
    );
    assert.ok(outsider, "benchmark requires a non-approved reviewer candidate");
    return updateTask(registry, taskId, {
      lifecycle_status: "VERIFIED",
      actor: outsider.id,
      evidence_ref: "fake://outsider-evidence",
    }, clock, ids);
  },
  /independent registry-approved reviewer/,
));

results.push(await expectBlocked(
  "approved-reviewer-missing-evidence",
  () => {
    const { registry, taskId } = completedSubagjoTask();
    const reviewer = employee("subagjo").verification_policy.reviewer_candidates[0];
    assert.ok(reviewer, "benchmark requires an approved reviewer candidate");
    return updateTask(registry, taskId, {
      lifecycle_status: "VERIFIED",
      actor: reviewer,
    }, clock, ids);
  },
  /membutuhkan evidence reference/,
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

{
  const signed = signedReceiptFixture();
  const common = {
    publicKeys:{ "local:adversarial-receipt":signed.keys.public_key_pem },
    now:new Date("2026-09-29T03:15:00.000Z"),
    maxReceiptAgeMs:15 * 60 * 1000,
    allowedRuntimeProviders:["meta-ads"],
    allowedRuntimeRefPrefixes:["runtime://meta/"],
    requiredTaskId:"task-adversarial-42",
    requiredEmployeeId:"maya",
    requiredCapabilityId:"ads.meta.write",
    requiredResultStates:["SUCCEEDED"],
  };

  results.push(await expectAllowed(
    "signed-receipt-valid",
    () => verifyExecutionReceipt(signed.envelope, common),
  ));

  results.push(await expectBlocked(
    "signed-receipt-tampered",
    () => {
      const tampered = structuredClone(signed.envelope);
      tampered.payload.result.summary = "tampered after signing";
      return verifyExecutionReceipt(tampered, common);
    },
    (value) => value?.ok === false && value?.reasons?.includes("PAYLOAD_HASH_MISMATCH") && value?.reasons?.includes("SIGNATURE_INVALID"),
  ));

  results.push(await expectBlocked(
    "signed-receipt-replay",
    () => verifyExecutionReceipt(signed.envelope, { ...common, consumedReceiptRefs:[signed.ref] }),
    (value) => value?.ok === false && value?.reasons?.includes("RECEIPT_REPLAYED"),
  ));

  results.push(await expectBlocked(
    "signed-receipt-wrong-task-binding",
    () => verifyExecutionReceipt(signed.envelope, { ...common, requiredTaskId:"task-other" }),
    (value) => value?.ok === false && value?.reasons?.includes("TASK_BINDING_MISMATCH"),
  ));

  results.push(await expectBlocked(
    "signed-receipt-wrong-employee-binding",
    () => verifyExecutionReceipt(signed.envelope, { ...common, requiredEmployeeId:"gugun" }),
    (value) => value?.ok === false && value?.reasons?.includes("EMPLOYEE_BINDING_MISMATCH"),
  ));

  results.push(await expectBlocked(
    "signed-receipt-wrong-capability-binding",
    () => verifyExecutionReceipt(signed.envelope, { ...common, requiredCapabilityId:"ads.google.write" }),
    (value) => value?.ok === false && value?.reasons?.includes("CAPABILITY_BINDING_MISMATCH"),
  ));

  results.push(await expectBlocked(
    "signed-receipt-stale",
    () => verifyExecutionReceipt(signed.envelope, {
      ...common,
      now:new Date("2026-09-29T04:00:00.000Z"),
      maxReceiptAgeMs:10 * 60 * 1000,
    }),
    (value) => value?.ok === false && value?.reasons?.includes("RECEIPT_STALE"),
  ));

  results.push(await expectBlocked(
    "signed-receipt-unauthorized-runtime",
    () => verifyExecutionReceipt(signed.envelope, {
      ...common,
      allowedRuntimeProviders:["hermes"],
      allowedRuntimeRefPrefixes:["hermes-kanban:"],
    }),
    (value) => value?.ok === false
      && value?.reasons?.includes("RUNTIME_PROVIDER_NOT_ALLOWED")
      && value?.reasons?.includes("RUNTIME_REF_NOT_ALLOWED"),
  ));
}

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
