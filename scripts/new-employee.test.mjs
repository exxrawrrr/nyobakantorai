import test from "node:test";
import assert from "node:assert/strict";
import { draftEmployee, parseOptions } from "./new-employee.mjs";

const registry = { employees: Array.from({ length: 16 }, (_, index) => ({ id: "existing-" + index })) };

test("custom employee defaults are guarded and secret-free", () => {
  const employee = draftEmployee({ id:"reno", name:"Reno", role:"Ops Analyst", department:"Operations", skills:"nyoba-follow-up" }, registry);
  assert.equal(employee.visual.asset_status, "pending-original-art");
  assert.equal(employee.approval_policy.autonomy, "GUARDED");
  assert.equal(employee.verification_policy.self_verify, false);
  assert.equal(employee.learning_profile.memory_mode, "PROFILE_SCOPED_HERMES_FIRST");
  assert.ok(employee.reasoning_profile.mental_models.length >= 3);
  assert.ok(employee.personality.dialogue_profile.signature_moves.length >= 2);
  assert.ok(employee.personality.dialogue_profile.avoid.length >= 2);
  assert.ok(employee.operational_contract.inputs.length > 0);
  assert.ok(employee.operational_contract.outputs.length > 0);
  assert.ok(Array.isArray(employee.operational_contract.capability_scope));
  assert.ok(employee.operational_contract.verification_method);
  assert.deepEqual(employee.optional_integrations, []);
  assert.ok(employee.skills.includes("nyoba-follow-up"));
  assert.equal("auth" in employee, false);
  assert.equal("token" in employee, false);
});

test("unknown CLI fields are rejected", () => {
  assert.throws(() => parseOptions(["--token=secret"]), /Unknown/);
});

test("duplicate employee IDs are rejected", () => {
  assert.throws(() => draftEmployee({ id:"existing-1", name:"X", role:"Y", department:"Z" }, registry), /already exists/);
});

test("unknown toolsets are rejected", () => {
  assert.throws(() => draftEmployee({ id:"reno", name:"Reno", role:"Y", department:"Z", toolsets:"skills,definitely-not-real" }, registry), /Unknown\/unapproved/);
});
