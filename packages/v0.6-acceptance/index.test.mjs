import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  V06_ACCEPTANCE_CRITERIA,
  buildV06AcceptancePlan,
  runDeterministicV06Acceptance,
  reconcileV06Acceptance,
} from "./index.mjs";

const root = new URL("../../", import.meta.url);
const runtimePolicy = JSON.parse(await readFile(new URL("config/runtime-execution-policy.json", root), "utf8"));
const currentCommit = "1111111111111111111111111111111111111111";
const fixedClock = () => "2026-10-02T02:10:00.000Z";

function liveObservation({ commit=currentCommit, externalWrite=false, evidenceClass="LIVE_RUNTIME_EVIDENCE", quotaStatus="PARTIAL" } = {}) {
  return {
    record:{
      schema:1,
      evidence_class:evidenceClass,
      runtime:{ provider:"codex", runtime_ref:"codex:ephemeral:read-only", provider_version:"codex-cli test" },
      execution:{
        ok:true,
        state:"SUCCEEDED",
        error_category:null,
        cleanup_attempted:true,
        cleanup_ok:true,
      },
      evidence:{
        workspace_mutation_check:{ temporary_workspace_only:true, production_repo_changed:false },
        prohibited_action_check:{ passed:true, observed:[] },
        runtime_actions:{
          install:false,
          login:false,
          account_mutation:false,
          external_write:externalWrite,
        },
      },
      capture:{
        schema:1,
        origin:"canonical-live-reference-runner-v1",
        runtime:"codex",
        mode:"live",
        repository:{ commit, clean:true },
        provider:{ install_state:"INSTALLED", command_detected:true, version_verified:true, version:"codex-cli test" },
        qualification:{ eligible:evidenceClass === "LIVE_RUNTIME_EVIDENCE", evidence_class:evidenceClass, reasons:[] },
        public_safety:{ ok:true, findings:[] },
      },
    },
    sandbox:{
      admission_ref:"sandbox-admission:test",
      executed:true,
      status:quotaStatus === "FAIL" ? "FAIL" : quotaStatus,
      quota_status:quotaStatus,
      teardown_verified:true,
      unverified_dimensions:quotaStatus === "PARTIAL" ? ["COST"] : [],
      record_ref:"sandbox-record:test",
    },
  };
}

test("acceptance plan has Praroro root, three-specialist parallel branch, and bounded synthesis", () => {
  const plan = buildV06AcceptancePlan({ clock:fixedClock });
  const tasks = Object.fromEntries(plan.task_nodes.map((task) => [task.employee_id+":"+task.title,task]));
  const roots = plan.graph.roots.map((id) => plan.task_nodes.find((task) => task.task_id === id));

  assert.equal(plan.mission.risk_class,"READ_ONLY");
  assert.equal(plan.mission.budget.hard_limit_amount,0.05);
  assert.equal(plan.mission.budget.currency,"USD");
  assert.equal(roots.length,1);
  assert.equal(roots[0].employee_id,"praroro");

  const branch = plan.graph.parallel_groups.find((group) => group.length === 3);
  assert.ok(branch);
  const employees = branch.map((id) => plan.task_nodes.find((task) => task.task_id === id).employee_id).sort();
  assert.deepEqual(employees,["alex","nara","subagjo"]);

  const synthesis = Object.values(tasks).find((task) => task.title === "Synthesize acceptance bundle");
  assert.equal(synthesis.employee_id,"praroro");
});

test("deterministic acceptance mission executes, produces artifacts, and reaches independently VERIFIED", async () => {
  const run = await runDeterministicV06Acceptance({ runtime_policy:runtimePolicy, clock:fixedClock });

  assert.equal(run.result.mission.state,"VERIFIED");
  assert.equal(run.result.tasks.length,5);
  assert.equal(run.result.attempts.length,5);
  assert.equal(run.result.verifications.length,5);
  assert.ok(run.result.tasks.every((task) => task.state === "VERIFIED"));
  assert.ok(run.result.verifications.every((review) => review.verifier_id === "siti"));
  assert.ok(run.result.verifications.every((review) => review.review_state === "PASS"));
  assert.ok(run.result.mission.artifact_refs.length >= 5);
  assert.equal(run.result.telemetry.length,5);
  assert.ok(run.result.telemetry.every((row) => row.execution.terminal === true));
  assert.equal(run.runtime_observations.length,5);
  assert.ok(run.runtime_observations.every((item) => item.evidence.runtime_actions.external_write === false));
  assert.ok(run.runtime_observations.every((item) => item.evidence.workspace_mutation_check.production_repo_changed === false));
});

test("acceptance reconciliation remains BLOCKED without current-commit live model evidence", async () => {
  const missionRun = await runDeterministicV06Acceptance({ runtime_policy:runtimePolicy, clock:fixedClock });
  const bundle = reconcileV06Acceptance({
    mission_run:missionRun,
    expected_commit:currentCommit,
  });

  assert.equal(bundle.status,"BLOCKED");
  assert.equal(bundle.summary.total,V06_ACCEPTANCE_CRITERIA.length);
  assert.equal(bundle.summary.passed,V06_ACCEPTANCE_CRITERIA.length - 2);
  assert.deepEqual(
    bundle.criteria.filter((item) => item.status !== "PASS").map((item) => item.id).sort(),
    ["COST_QUOTA_ENFORCEMENT","REAL_MODEL_EXECUTION"],
  );
  assert.ok(bundle.blockers.includes("LIVE_OBSERVATION_MISSING"));
  assert.ok(bundle.blockers.includes("CURRENT_COMMIT_LIVE_SANDBOX_QUOTA_EVIDENCE_MISSING"));
});

test("current-commit canonical live evidence plus sandbox observation closes all acceptance criteria", async () => {
  const missionRun = await runDeterministicV06Acceptance({ runtime_policy:runtimePolicy, clock:fixedClock });
  const bundle = reconcileV06Acceptance({
    mission_run:missionRun,
    live_observation:liveObservation(),
    expected_commit:currentCommit,
  });

  assert.equal(bundle.status,"ACCEPTED");
  assert.equal(bundle.summary.passed,V06_ACCEPTANCE_CRITERIA.length);
  assert.deepEqual(bundle.blockers,[]);
  assert.ok(bundle.limitations.includes("LIVE_QUOTA_UNKNOWN:COST"));
  assert.ok(bundle.criteria.every((item) => item.status === "PASS"));
});

test("live evidence from another commit cannot satisfy acceptance", async () => {
  const missionRun = await runDeterministicV06Acceptance({ runtime_policy:runtimePolicy, clock:fixedClock });
  const bundle = reconcileV06Acceptance({
    mission_run:missionRun,
    live_observation:liveObservation({ commit:"2222222222222222222222222222222222222222" }),
    expected_commit:currentCommit,
  });

  assert.equal(bundle.status,"BLOCKED");
  assert.ok(bundle.blockers.includes("LIVE_COMMIT_MISMATCH"));
  assert.equal(bundle.criteria.find((item) => item.id === "REAL_MODEL_EXECUTION").status,"BLOCKED");
});

test("external write evidence fails acceptance instead of being hidden by successful runtime state", async () => {
  const missionRun = await runDeterministicV06Acceptance({ runtime_policy:runtimePolicy, clock:fixedClock });
  const bundle = reconcileV06Acceptance({
    mission_run:missionRun,
    live_observation:liveObservation({ externalWrite:true }),
    expected_commit:currentCommit,
  });

  assert.equal(bundle.status,"FAILED");
  assert.ok(bundle.blockers.includes("LIVE_EXTERNAL_WRITE_NOT_DISPROVEN"));
  assert.equal(bundle.criteria.find((item) => item.id === "NO_EXTERNAL_WRITE").status,"BLOCKED");
});
