import test from "node:test";
import assert from "node:assert/strict";
import { PORTABLE_WORKFORCE, WORKFORCE, WORKFORCE_RUNTIME_PREFERENCES, toPortableEmployeeContract } from "./workforce.mjs";

test("portable worker contracts exclude runtime distribution preferences", () => {
  assert.equal(PORTABLE_WORKFORCE.length, WORKFORCE.length);
  for (const worker of PORTABLE_WORKFORCE) {
    assert.equal("preferred_toolsets" in worker, false, worker.id);
    assert.equal("optional_integrations" in worker, false, worker.id);
    assert.equal("profile" in worker, false, worker.id);
    assert.doesNotMatch(worker.learning_profile?.memory_mode || "", /HERMES/i, worker.id);
    assert.ok(WORKFORCE_RUNTIME_PREFERENCES[worker.id]);
  }
});

test("portable projection preserves worker identity and governance", () => {
  const source = WORKFORCE.find((worker) => worker.id === "siti");
  const portable = toPortableEmployeeContract(source);
  for (const key of ["id","name","role","department","summary","skills","approval_policy","verification_policy","operational_contract"]) {
    assert.deepEqual(portable[key], source[key], key);
  }
  assert.equal(Object.isFrozen(portable), true);
});
