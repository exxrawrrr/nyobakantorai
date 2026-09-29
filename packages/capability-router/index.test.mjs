import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCapabilityRouter } from "./index.mjs";

const config = JSON.parse(readFileSync(new URL("../../config/capabilities.json", import.meta.url), "utf8"));
const employees = JSON.parse(readFileSync(new URL("../../config/employees.json", import.meta.url), "utf8"));
const employee = (id) => employees.employees.find((item) => item.id === id);
const router = createCapabilityRouter({
  catalog: config.capabilities,
  states: config.states,
  autonomyModes: config.autonomy_modes,
  defaultAutonomy: config.default_mode,
});
const snapshot = (id, state="CONNECTED") => ({
  provider_id: "test-provider",
  checked_at: "2026-09-28T17:00:00.000Z",
  capabilities: { [id]: { state, evidence_ref: state === "CONNECTED" ? "receipt://provider/test" : null } },
});

test("fails closed when no provider proves a capability is connected", () => {
  const result = router.authorize({ capabilityId:"ads.meta.read" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "CAPABILITY_NOT_CONNECTED");
});

test("CONNECTED requires provider evidence", () => {
  assert.throws(() => router.validateSnapshot({
    provider_id:"bad-provider",
    checked_at:"2026-09-28T17:00:00.000Z",
    capabilities:{ "ads.meta.read":{ state:"CONNECTED" } },
  }), /requires evidence_ref/);
});

test("connected read-only capability can be used without mutation approval", () => {
  const result = router.authorize({ capabilityId:"ads.meta.read", snapshots:[snapshot("ads.meta.read")] });
  assert.equal(result.allowed, true);
  assert.equal(result.decision, "ALLOWED_READ_ONLY");
});

test("GUARDED paid action requires explicit owner approval", () => {
  const waiting = router.authorize({ capabilityId:"ads.meta.write", snapshots:[snapshot("ads.meta.write")], autonomy:"GUARDED", approvalStatus:"PENDING" });
  assert.equal(waiting.allowed, false);
  assert.equal(waiting.decision, "WAITING_FOR_APPROVAL");
  const approved = router.authorize({ capabilityId:"ads.meta.write", snapshots:[snapshot("ads.meta.write")], autonomy:"GUARDED", approvalStatus:"APPROVED" });
  assert.equal(approved.allowed, true);
  assert.equal(approved.decision, "AUTHORIZED_GUARDED");
});

test("OBSERVE blocks writes even when connected and approved", () => {
  const result = router.authorize({ capabilityId:"ads.google.write", snapshots:[snapshot("ads.google.write")], autonomy:"OBSERVE", approvalStatus:"APPROVED" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OBSERVE_MODE_NO_WRITES");
});

test("DELEGATED only allows explicitly scoped capabilities", () => {
  const blocked = router.authorize({ capabilityId:"ads.google.write", snapshots:[snapshot("ads.google.write")], autonomy:"DELEGATED", delegatedCapabilities:[] });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "OUTSIDE_DELEGATED_SCOPE");
  const allowed = router.authorize({ capabilityId:"ads.google.write", snapshots:[snapshot("ads.google.write")], autonomy:"DELEGATED", delegatedCapabilities:["ads.google.write"] });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.decision, "AUTHORIZED_DELEGATED");
});

test("resolution prefers a proven connected provider over weaker states", () => {
  const result = router.resolve("ads.meta.insights", [
    snapshot("ads.meta.insights","PARTIAL"),
    snapshot("ads.meta.insights","CONNECTED"),
  ]);
  assert.equal(result.state, "CONNECTED");
  assert.equal(result.evidence_ref, "receipt://provider/test");
});


test("employee authorization blocks out-of-role capability before provider resolution", () => {
  const result = router.authorizeForEmployee({
    employee: employee("fikri"),
    capabilityId:"ads.meta.write",
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"GUARDED",
    approvalStatus:"APPROVED",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "WORKER_CAPABILITY_OUT_OF_SCOPE");
  assert.equal(result.employee_id, "fikri");
  assert.equal(result.connection, null);
});

test("employee authorization fails closed when the worker contract is malformed", () => {
  const result = router.authorizeForEmployee({
    employee:{ id:"ghost" },
    capabilityId:"ads.meta.read",
    snapshots:[snapshot("ads.meta.read")],
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "WORKER_CONTRACT_INVALID");
  assert.equal(result.connection, null);
});

test("eligible worker still needs normal approval and provider evidence", () => {
  const waiting = router.authorizeForEmployee({
    employee: employee("maya"),
    capabilityId:"ads.meta.write",
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"GUARDED",
    approvalStatus:"PENDING",
  });
  assert.equal(waiting.allowed, false);
  assert.equal(waiting.reason, "OWNER_APPROVAL_REQUIRED");
  assert.equal(waiting.employee_id, "maya");

  const approved = router.authorizeForEmployee({
    employee: employee("maya"),
    capabilityId:"ads.meta.write",
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"GUARDED",
    approvalStatus:"APPROVED",
  });
  assert.equal(approved.allowed, true);
  assert.equal(approved.decision, "AUTHORIZED_GUARDED");
  assert.equal(approved.employee_id, "maya");
});

test("read-only capability is allowed only for a worker whose contract includes it", () => {
  const maya = router.authorizeForEmployee({
    employee: employee("maya"),
    capabilityId:"ads.meta.read",
    snapshots:[snapshot("ads.meta.read")],
  });
  assert.equal(maya.allowed, true);
  assert.equal(maya.decision, "ALLOWED_READ_ONLY");

  const sumiati = router.authorizeForEmployee({
    employee: employee("sumiati"),
    capabilityId:"ads.meta.read",
    snapshots:[snapshot("ads.meta.read")],
  });
  assert.equal(sumiati.allowed, false);
  assert.equal(sumiati.reason, "WORKER_CAPABILITY_OUT_OF_SCOPE");
});
