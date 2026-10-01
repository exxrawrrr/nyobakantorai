import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ATTEMPT_STATES,
  ATTEMPT_TRANSITIONS,
  MISSION_STATES,
  assertAttemptTransition,
  assertMissionTransition,
  attemptFromRuntimeOutcome,
  normalizeExecutionAttempt,
  normalizeMission,
  transitionMission,
  validateExecutionAttempt,
  validateMission,
} from "./contracts.mjs";

const root = new URL("../../", import.meta.url);
const missionSchema = JSON.parse(await readFile(new URL("schemas/mission.schema.json", root), "utf8"));
const attemptSchema = JSON.parse(await readFile(new URL("schemas/execution-attempt.schema.json", root), "utf8"));

const stamp = (seconds = 0) => `2026-10-01T05:10:${String(seconds).padStart(2, "0")}.000Z`;

function baseMission(overrides = {}) {
  return {
    schema:1,
    mission_id:"mission-v06-001",
    objective:"Produce one bounded, evidence-backed deliverable.",
    constraints:["no external writes"],
    risk_class:"READ_ONLY",
    budget:{ hard_limit_amount:null, currency:null },
    autonomy:{ mode:"GUARDED", delegated_capabilities:[] },
    task_ids:["task-v06-001"],
    artifact_refs:[],
    evidence_refs:[],
    approval_refs:[],
    state:"PLANNED",
    created_at:stamp(0),
    updated_at:stamp(0),
    ...overrides,
  };
}

function plannedAttempt(overrides = {}) {
  return {
    schema:1,
    attempt_id:"attempt-v06-001",
    task_id:"task-v06-001",
    ordinal:1,
    state:"PLANNED",
    runtime:{ provider:"fixture-runtime", runtime_ref:"fixture:session-1", provider_version:"1.0" },
    model_route_ref:null,
    capability_route_refs:[],
    started_at:null,
    finished_at:null,
    error_category:null,
    cleanup:{ attempted:false, ok:null },
    receipt_ref:null,
    evidence_refs:[],
    artifact_refs:[],
    previous_attempt_id:null,
    recovery_checkpoint_ref:null,
    ...overrides,
  };
}

test("Mission and Attempt state catalogs match machine-readable schemas", () => {
  assert.deepEqual(missionSchema.properties.state.enum, MISSION_STATES);
  assert.deepEqual(attemptSchema.properties.state.enum, ATTEMPT_STATES);
  assert.equal(validateMission(baseMission()), true);
  assert.equal(validateExecutionAttempt(plannedAttempt()), true);
});

test("Mission rejects malformed budget, delegated scope drift, state and timestamps", () => {
  assert.throws(
    () => normalizeMission(baseMission({ budget:{ hard_limit_amount:10, currency:null } })),
    /3-letter currency/,
  );
  assert.throws(
    () => normalizeMission(baseMission({ autonomy:{ mode:"GUARDED", delegated_capabilities:["browser.read"] } })),
    /Only DELEGATED/,
  );
  assert.throws(() => normalizeMission(baseMission({ state:"MAGIC" })), /state is invalid/);
  assert.throws(() => normalizeMission(baseMission({ updated_at:"not-a-date" })), /valid timestamp/);
  assert.throws(() => normalizeMission(baseMission({ created_at:stamp(9), updated_at:stamp(1) })), /cannot precede/);
});

test("Mission state graph requires READY before RUNNING and preserves bounded failure/recovery path", () => {
  const planned = normalizeMission(baseMission());
  assert.throws(() => assertMissionTransition(planned, "RUNNING"), /PLANNED -> RUNNING is not allowed/);

  const ready = transitionMission(planned, "READY", { clock:() => stamp(1) });
  const running = transitionMission(ready, "RUNNING", { clock:() => stamp(2) });
  const failed = transitionMission(running, "FAILED", { clock:() => stamp(3) });
  const retrying = transitionMission(failed, "RETRYING", { clock:() => stamp(4) });
  const recovered = transitionMission(retrying, "RECOVERED", { clock:() => stamp(5) });

  assert.equal(recovered.state, "RECOVERED");
  assert.equal(assertMissionTransition(recovered, "RUNNING"), true);
});

test("Mission WAITING_APPROVAL cannot return READY without explicit aggregate approval satisfaction", () => {
  const waiting = normalizeMission(baseMission({
    state:"WAITING_APPROVAL",
    approval_refs:["task:pending-approval"],
    updated_at:stamp(1),
  }));

  assert.throws(
    () => assertMissionTransition(waiting, "READY"),
    /approvals_satisfied=true/,
  );
  assert.equal(
    assertMissionTransition(waiting, "READY", { approvals_satisfied:true }),
    true,
  );
});

test("Mission VERIFIED requires successful work, task-level verification satisfaction and evidence", () => {
  const succeeded = normalizeMission(baseMission({
    state:"SUCCEEDED",
    updated_at:stamp(1),
  }));

  assert.throws(
    () => assertMissionTransition(succeeded, "VERIFIED", { evidence_refs:["test:mission"] }),
    /verified required-task evidence/,
  );
  assert.throws(
    () => assertMissionTransition(succeeded, "VERIFIED", { verification_satisfied:true }),
    /requires evidence_refs/,
  );

  const verified = transitionMission(succeeded, "VERIFIED", {
    verification_satisfied:true,
    evidence_refs:["test:mission-verified"],
    clock:() => stamp(2),
  });
  assert.equal(verified.state, "VERIFIED");
  assert.deepEqual(verified.evidence_refs, ["test:mission-verified"]);
});

test("VERIFIED Mission rework is owner-only and explicit", () => {
  const verified = normalizeMission(baseMission({
    state:"VERIFIED",
    task_ids:["task-v06-001"],
    evidence_refs:["test:mission-verified"],
    updated_at:stamp(1),
  }));

  assert.throws(() => assertMissionTransition(verified, "RUNNING"), /reopen=true/);
  assert.throws(
    () => assertMissionTransition(verified, "RUNNING", { reopen:true, actor_id:"praroro" }),
    /Only owner/,
  );
  assert.equal(
    assertMissionTransition(verified, "RUNNING", { reopen:true, actor_id:"owner" }),
    true,
  );
});

test("Execution Attempt is one try only: terminal states cannot become RETRYING or RUNNING", () => {
  const failed = normalizeExecutionAttempt(plannedAttempt({
    state:"FAILED",
    started_at:stamp(1),
    finished_at:stamp(2),
    error_category:"TIMEOUT",
    cleanup:{ attempted:true, ok:true },
  }));

  assert.equal(ATTEMPT_TRANSITIONS.FAILED.length, 0);
  assert.throws(() => assertAttemptTransition(failed, "RUNNING"), /not allowed/);
  assert.throws(() => assertAttemptTransition(failed, "RETRYING"), /next state is invalid/);
});

test("Execution Attempt enforces ordinal lineage, terminal truth and cleanup on success", () => {
  assert.throws(
    () => normalizeExecutionAttempt(plannedAttempt({ ordinal:1, previous_attempt_id:"attempt-old" })),
    /First Execution Attempt/,
  );
  assert.throws(
    () => normalizeExecutionAttempt(plannedAttempt({
      state:"FAILED",
      started_at:stamp(1),
      finished_at:stamp(2),
      error_category:null,
      cleanup:{ attempted:true, ok:true },
    })),
    /requires error_category/,
  );
  assert.throws(
    () => normalizeExecutionAttempt(plannedAttempt({
      state:"SUCCEEDED",
      started_at:stamp(1),
      finished_at:stamp(2),
      cleanup:{ attempted:true, ok:false },
    })),
    /requires successful cleanup/,
  );
  assert.throws(
    () => normalizeExecutionAttempt(plannedAttempt({
      receipt_ref:"receipt://not-signed",
    })),
    /receipt_ref/,
  );

  const retry = normalizeExecutionAttempt(plannedAttempt({
    attempt_id:"attempt-v06-002",
    ordinal:2,
    previous_attempt_id:"attempt-v06-001",
  }));
  assert.equal(retry.ordinal, 2);
  assert.equal(retry.previous_attempt_id, "attempt-v06-001");
});

test("Execution Attempt transition graph allows PLANNED -> RUNNING -> SUCCEEDED only before terminal", () => {
  const planned = normalizeExecutionAttempt(plannedAttempt());
  assert.equal(assertAttemptTransition(planned, "RUNNING"), true);
  assert.throws(() => assertAttemptTransition(planned, "SUCCEEDED"), /not allowed/);

  const running = normalizeExecutionAttempt(plannedAttempt({
    state:"RUNNING",
    started_at:stamp(1),
  }));
  assert.equal(assertAttemptTransition(running, "SUCCEEDED"), true);
  assert.equal(assertAttemptTransition(running, "PARTIAL"), true);
});

test("runtime execution outcome maps to immutable Attempt references without re-executing runtime", () => {
  const receiptRef = "receipt:sha256:" + "a".repeat(64);
  const outcome = {
    schema:1,
    ok:true,
    state:"SUCCEEDED",
    error_category:null,
    runtime:{ provider:"fixture-runtime", runtime_ref:"fixture:run-1", provider_version:"1.0" },
    normalized_result:{
      schema:1,
      state:"SUCCEEDED",
      summary:"bounded result",
      output:{ finding:"ok" },
      artifact_refs:["artifact:normalized"],
      evidence_refs:["test:normalized"],
    },
    evidence:{
      raw_result_ref:"artifact:raw",
      normalized_result_ref:"artifact:normalized",
      evidence_refs:["test:runtime"],
      artifact_refs:["artifact:raw","artifact:normalized"],
    },
    cleanup:{ attempted:true, ok:true },
    started_at:stamp(1),
    finished_at:stamp(2),
  };

  const attempt = attemptFromRuntimeOutcome(outcome, {
    attempt_id:"attempt-v06-001",
    task_id:"task-v06-001",
    ordinal:1,
    model_route_ref:"model-route:future",
    capability_route_refs:["capability-route:read"],
    receipt_ref:receiptRef,
  });

  assert.equal(attempt.state, "SUCCEEDED");
  assert.equal(attempt.runtime.provider, "fixture-runtime");
  assert.equal(attempt.receipt_ref, receiptRef);
  assert.deepEqual(attempt.artifact_refs, ["artifact:normalized","artifact:raw"]);
  assert.deepEqual(attempt.evidence_refs, [
    "test:normalized",
    "test:runtime",
    "artifact:raw",
    "artifact:normalized",
  ]);
});

test("runtime PARTIAL/BLOCKED/FAILED outcomes require an explicit error category", () => {
  const baseOutcome = {
    runtime:{ provider:"fixture-runtime", runtime_ref:"fixture:run-2", provider_version:null },
    normalized_result:{ evidence_refs:[], artifact_refs:[] },
    evidence:{ raw_result_ref:"artifact:raw", normalized_result_ref:"artifact:normalized", evidence_refs:[], artifact_refs:[] },
    cleanup:{ attempted:true, ok:true },
    started_at:stamp(1),
    finished_at:stamp(2),
  };

  for (const state of ["PARTIAL","BLOCKED","FAILED"]) {
    assert.throws(
      () => attemptFromRuntimeOutcome({ ...baseOutcome, state, error_category:null }, {
        attempt_id:`attempt-${state.toLowerCase()}`,
        task_id:"task-v06-001",
      }),
      /requires error_category/,
      state,
    );
  }
});
