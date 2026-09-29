import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WORKFORCE, CAPABILITY_CATALOG } from "../office/workforce.mjs";

const capabilityIds = new Set(CAPABILITY_CATALOG.map((item) => item.id));

test("all workers expose complete typed operational contracts", () => {
  assert.ok(WORKFORCE.length >= 16);
  for (const employee of WORKFORCE) {
    const contract = employee.operational_contract;
    assert.ok(contract, `${employee.id} contract missing`);
    for (const key of ["inputs","outputs","forbidden_actions","evidence_requirements"]) {
      assert.ok(Array.isArray(contract[key]) && contract[key].length > 0, `${employee.id} invalid ${key}`);
    }
    assert.ok(Array.isArray(contract.capability_scope), `${employee.id} invalid capability_scope`);
    for (const key of ["failure_policy","verification_method","cost_policy"]) {
      assert.ok(typeof contract[key] === "string" && contract[key].trim(), `${employee.id} missing ${key}`);
    }
    for (const capability of contract.capability_scope) {
      assert.ok(capabilityIds.has(capability), `${employee.id} unknown capability ${capability}`);
    }
  }
});

test("operational scopes stay specialized instead of becoming universal", () => {
  const baseline = WORKFORCE.slice(0, 16);
  const signatures = baseline.map((employee) => JSON.stringify(employee.operational_contract.capability_scope));
  assert.ok(new Set(signatures).size >= 8);
  for (const employee of baseline) {
    assert.ok(employee.operational_contract.capability_scope.length < capabilityIds.size);
  }
  assert.deepEqual(WORKFORCE.find((e) => e.id === "sumiati").operational_contract.capability_scope, []);
  assert.deepEqual(WORKFORCE.find((e) => e.id === "bambang").operational_contract.capability_scope, []);
  assert.deepEqual(WORKFORCE.find((e) => e.id === "tari").operational_contract.capability_scope, []);
});

test("paid-media write scopes stay with their matching specialists", () => {
  const maya = WORKFORCE.find((e) => e.id === "maya");
  const gugun = WORKFORCE.find((e) => e.id === "gugun");
  assert.ok(maya.operational_contract.capability_scope.includes("ads.meta.write"));
  assert.equal(maya.operational_contract.capability_scope.includes("ads.google.write"), false);
  assert.ok(gugun.operational_contract.capability_scope.includes("ads.google.write"));
  assert.equal(gugun.operational_contract.capability_scope.includes("ads.meta.write"), false);
});

test("Fikri owns context compilation without becoming a universal tool worker", () => {
  const fikri = WORKFORCE.find((e) => e.id === "fikri");
  assert.match(fikri.role, /Markdown/);
  assert.match(fikri.role, /Context/);
  assert.ok(fikri.skills.includes("nyoba-context-prompt-compiler"));
  assert.ok(fikri.operational_contract.capability_scope.includes("context.repo.pack"));
  assert.ok(fikri.operational_contract.capability_scope.includes("context.prompt.compress.experimental"));
  assert.equal(fikri.operational_contract.capability_scope.includes("ads.meta.write"), false);
  assert.equal(fikri.operational_contract.capability_scope.includes("ads.google.write"), false);
});
