import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WORKFORCE } from "../office/workforce.mjs";

const root = resolve(import.meta.dirname, "..");
const policy = JSON.parse(await readFile(resolve(root, "config/memory-policy.json"), "utf8"));

test("memory policy defines M0 through M4 with guarded canonical promotion", () => {
  assert.equal(policy.schema, 1);
  assert.deepEqual(policy.layers.map((layer) => layer.id), ["M0","M1","M2","M3","M4"]);
  const m4 = policy.layers.find((layer) => layer.id === "M4");
  assert.equal(m4.requires_human_review, true);
  assert.equal(m4.requires_repository_pr, true);
  assert.ok(m4.normally_requires_independent_observations >= 3);
  assert.equal(policy.canonical_skill_mutation, "REPOSITORY_PR_ONLY");
});

test("all workers keep profile-scoped default memory and governed skill promotion", () => {
  for (const employee of WORKFORCE) {
    assert.equal(employee.memory_boundary, "PROFILE_SCOPED");
    assert.equal(employee.learning_profile.memory_mode, "PROFILE_SCOPED_HERMES_FIRST");
    assert.match(employee.learning_profile.promotion_rule, /human-review|human review/i);
  }
});

test("memory policy explicitly blocks secrets and permission widening", () => {
  for (const forbidden of ["credentials","api_tokens","passwords","private_keys"]) {
    assert.ok(policy.prohibited_memory_content.includes(forbidden));
  }
  assert.ok(policy.promotion_guards.includes("runtime_learning_must_not_widen_permissions"));
  assert.ok(policy.promotion_guards.includes("runtime_learning_must_not_change_approval_policy"));
  assert.ok(policy.promotion_guards.includes("runtime_learning_must_not_change_verification_authority"));
});
