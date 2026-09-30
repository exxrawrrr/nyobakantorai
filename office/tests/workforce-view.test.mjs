import test from "node:test";
import assert from "node:assert/strict";
import { WORKFORCE } from "../workforce.mjs";
import {
  EMPLOYEE_BY_ID,
  RUNTIME_WORKFORCE_PREFERENCES,
  WORKFORCE_VIEW,
  runtimePreferencesForEmployee,
  toPortableWorkforceView,
} from "../workforce-view.mjs";

test("office workforce view strips runtime distribution preferences", () => {
  assert.equal(WORKFORCE_VIEW.length, WORKFORCE.length);
  for (const worker of WORKFORCE_VIEW) {
    assert.equal("preferred_toolsets" in worker, false, worker.id);
    assert.equal("optional_integrations" in worker, false, worker.id);
    assert.equal("profile" in worker, false, worker.id);
    assert.doesNotMatch(worker.learning_profile?.memory_mode || "", /HERMES/i, worker.id);
    assert.equal(EMPLOYEE_BY_ID[worker.id], worker);
  }
});

test("runtime preferences remain available only through the explicit UI boundary", () => {
  for (const source of WORKFORCE) {
    const runtime = runtimePreferencesForEmployee(source.id);
    assert.deepEqual(runtime.preferred_toolsets, source.preferred_toolsets);
    assert.deepEqual(runtime.optional_integrations, source.optional_integrations);
    assert.deepEqual(runtime.distribution, source.profile);
    assert.equal(runtime.source_memory_mode, source.learning_profile?.memory_mode || "");
    assert.equal(RUNTIME_WORKFORCE_PREFERENCES[source.id], runtime);
  }
});

test("portable UI projection preserves identity, governance, and visual placement", () => {
  const source = WORKFORCE.find((worker) => worker.id === "siti");
  const portable = toPortableWorkforceView(source);
  for (const key of ["id","name","role","department","summary","skills","approval_policy","verification_policy","operational_contract","visual"]) {
    assert.deepEqual(portable[key], source[key], key);
  }
});
