import { executeBoundedRuntimeTask } from "../runtime-execution-adapter/index.mjs";
import { normalizeExecutionAttempt, normalizeMission, attemptFromRuntimeOutcome, transitionMission } from "./contracts.mjs";
import { normalizeMissionPlan } from "./planner.mjs";
import { normalizeTaskNode, transitionTaskNode } from "../task-registry/task-node.mjs";
import { buildHandoffEnvelope, normalizeHandoffResult, resultFromAttempt } from "./handoff.mjs";
import { buildMissionTelemetry } from "./telemetry.mjs";
import { runSitiVerification } from "../evidence-verifier/siti.mjs";
import { normalizeCostAmount } from "../cost-governor/index.mjs";

export const MISSION_ORCHESTRATOR_API = 1;

const SUCCESS_STATES = new Set(["SUCCEEDED","VERIFIED"]);
const NONSTARTED_STATES = new Set(["PLANNED","READY","WAITING_APPROVAL"]);
const BLOCKING_DEPENDENCY_STATES = new Set(["BLOCKED","PARTIAL","FAILED","CANCELLED"]);
const TERMINAL_TASK_STATES = new Set(["BLOCKED","PARTIAL","FAILED","SUCCEEDED","VERIFIED","CANCELLED"]);

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const unique = (values, max = 1000) => Object.freeze([...new Set((Array.isArray(values) ? values : [])
  .map((value) => clean(value, max))
  .filter(Boolean))]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validTimestamp(value) {
  return typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value));
}

function dependencyMaps(plan) {
  const dependencies = new Map(plan.graph.task_ids.map((id) => [id, []]));
  const dependents = new Map(plan.graph.task_ids.map((id) => [id, []]));
  for (const edge of plan.graph.edges) {
    dependencies.get(edge.to).push(edge.from);
    dependents.get(edge.from).push(edge.to);
  }
  for (const values of dependencies.values()) values.sort();
  for (const values of dependents.values()) values.sort();
  return { dependencies, dependents };
}

function normalizeCostGovernance(value, adapter) {
  if (value == null) return null;
  assert(value && typeof value === "object" && !Array.isArray(value), "Runtime cost_governance must be an object or null.");
  const estimate = normalizeCostAmount(value.estimate || { status:"UNKNOWN", amount:null, currency:null }, "runtime cost estimate");
  const alternatives = Object.freeze((Array.isArray(value.alternatives) ? value.alternatives : []).map((item,index) => {
    assert(item && typeof item === "object" && !Array.isArray(item), "Runtime cost alternative must be an object.");
    const id = clean(item.id || ("alternative-"+(index+1)), 160);
    assert(id, "Runtime cost alternative id is required.");
    return Object.freeze({ id, cost:normalizeCostAmount(item.cost || { status:"UNKNOWN", amount:null, currency:null }, "runtime cost alternative") });
  }));
  return Object.freeze({
    project_id:value.project_id == null ? null : clean(value.project_id,160) || null,
    estimate,
    alternatives,
    provider_id:clean(value.provider_id || adapter.runtime?.provider,120).toLowerCase() || null,
    model_id:value.model_id == null ? null : clean(value.model_id,160) || null,
    tool_ids:unique(value.tool_ids,160),
  });
}

function normalizeResolution(value = {}, task) {
  assert(value && typeof value === "object" && !Array.isArray(value), `Runtime resolution missing for ${task.task_id}`);
  assert(value.adapter && typeof value.adapter === "object", `Runtime adapter missing for ${task.task_id}`);
  assert(value.policy && typeof value.policy === "object", `Runtime policy missing for ${task.task_id}`);
  const requiredCapabilities = unique(
    value.required_capabilities || value.adapter.capabilities || [],
    80,
  );
  assert(requiredCapabilities.length > 0, `Runtime resolution requires at least one capability for ${task.task_id}`);
  const timeoutMs = value.timeout_ms == null
    ? Number(value.policy.default_timeout_ms)
    : Number(value.timeout_ms);
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 45_000, `Runtime timeout invalid for ${task.task_id}`);

  return Object.freeze({
    adapter:value.adapter,
    policy:value.policy,
    required_capabilities:requiredCapabilities,
    timeout_ms:timeoutMs,
    model_route_ref:value.model_route_ref == null ? null : clean(value.model_route_ref, 1000) || null,
    capability_route_refs:unique(value.capability_route_refs),
    unknowns:unique(value.unknowns),
    residual_risks:unique(value.residual_risks),
    cost_governance:normalizeCostGovernance(value.cost_governance, value.adapter),
  });
}

function runtimeTaskFromHandoff(envelope) {
  return Object.freeze({
    schema:1,
    task_id:envelope.task_id,
    employee_id:envelope.destination_employee_id,
    objective:envelope.objective,
    risk_class:envelope.risk_class,
    required_capabilities:envelope.allowed_capabilities,
    required_skills:envelope.required_skills,
    prohibited_actions:Object.freeze([
      "external write",
      "paid action",
      "account mutation",
      "production repository mutation",
      "installation or login",
    ]),
    expected_output:Object.freeze({
      type:"object",
      description:"Bounded structured result with artifact/evidence references where available.",
    }),
  });
}

function withAttempt(taskInput, attemptInput, clock) {
  const task = normalizeTaskNode(taskInput);
  const attempt = normalizeExecutionAttempt(attemptInput);
  assert(attempt.task_id === task.task_id, "Attempt/TaskNode identity mismatch.");

  return normalizeTaskNode({
    ...task,
    attempt_ids:[...task.attempt_ids, attempt.attempt_id],
    evidence_refs:[...task.evidence_refs, ...attempt.evidence_refs],
    receipt_refs:attempt.receipt_ref
      ? [...task.receipt_refs, attempt.receipt_ref]
      : [...task.receipt_refs],
    updated_at:clock(),
  });
}

function transitionFromAttempt(taskInput, attemptInput, clock) {
  const task = normalizeTaskNode(taskInput);
  const attempt = normalizeExecutionAttempt(attemptInput);
  if (attempt.state === "BLOCKED") {
    const category = attempt.error_category || "UNKNOWN";
    const policyLike = /POLICY|CAPABILITY|TASK_|ADAPTER_INVALID/.test(category);
    return transitionTaskNode(task, "BLOCKED", {
      clock,
      evidence_refs:attempt.evidence_refs,
      blocking:{
        kind:policyLike ? "POLICY" : "RUNTIME",
        reason:`Execution attempt blocked: ${category}`,
      },
    });
  }
  if (["FAILED","PARTIAL","SUCCEEDED"].includes(attempt.state)) {
    return transitionTaskNode(task, attempt.state, {
      clock,
      evidence_refs:attempt.evidence_refs,
    });
  }
  throw new Error(`Unsupported Attempt terminal state for TaskNode: ${attempt.state}`);
}

function missionTerminalState(tasks) {
  const states = tasks.map((task) => task.state);
  if (states.every((state) => SUCCESS_STATES.has(state))) return "SUCCEEDED";
  if (states.some((state) => state === "WAITING_APPROVAL")) return "WAITING_APPROVAL";

  const anySuccess = states.some((state) => SUCCESS_STATES.has(state));
  if (states.some((state) => state === "PARTIAL")) return "PARTIAL";
  if (states.some((state) => state === "FAILED")) return anySuccess ? "PARTIAL" : "FAILED";
  if (states.some((state) => state === "BLOCKED")) return anySuccess ? "PARTIAL" : "BLOCKED";
  if (states.some((state) => state === "CANCELLED")) return "CANCELLED";

  throw new Error(`Mission has no legal terminal aggregate for task states: ${states.join(",")}`);
}

function event(kind, clock, detail = {}) {
  const at = clock();
  assert(validTimestamp(at), "Mission orchestrator clock must return a valid timestamp.");
  return Object.freeze({ kind, at:new Date(at).toISOString(), ...structuredClone(detail) });
}

export async function executeMissionPlan(planInput, {
  resolveRuntime,
  maxConcurrency = 2,
  clock = () => new Date().toISOString(),
  idFactory = (kind, taskId, ordinal = 1) => `${kind}:${taskId}:${ordinal}`,
  receiptRefFactory = null,
  buildVerificationRequest = null,
  costGovernor = null,
  resolveCostReroute = null,
  reportActualCost = null,
  shouldCancel = () => false,
} = {}) {
  const plan = normalizeMissionPlan(planInput);
  assert(typeof resolveRuntime === "function", "Mission orchestrator requires resolveRuntime().");
  assert(Number.isInteger(maxConcurrency) && maxConcurrency >= 1 && maxConcurrency <= 8, "maxConcurrency must be 1..8.");
  assert(typeof shouldCancel === "function", "Mission orchestrator shouldCancel must be a function.");
  if (receiptRefFactory != null) assert(typeof receiptRefFactory === "function", "receiptRefFactory must be a function or null.");
  if (buildVerificationRequest != null) assert(typeof buildVerificationRequest === "function", "buildVerificationRequest must be a function or null.");
  if (costGovernor != null) {
    assert(typeof costGovernor.admit === "function", "costGovernor.admit must be a function.");
    assert(typeof costGovernor.record === "function", "costGovernor.record must be a function.");
    assert(typeof costGovernor.snapshot === "function", "costGovernor.snapshot must be a function.");
  }
  if (resolveCostReroute != null) assert(typeof resolveCostReroute === "function", "resolveCostReroute must be a function or null.");
  if (reportActualCost != null) assert(typeof reportActualCost === "function", "reportActualCost must be a function or null.");

  const taskById = new Map(plan.task_nodes.map((task) => [task.task_id, task]));
  const metaById = new Map(plan.node_meta.map((meta) => [meta.task_id, meta]));
  const { dependencies } = dependencyMaps(plan);
  const attempts = [];
  const handoffs = [];
  const returns = [];
  const verifications = [];
  const costDecisions = [];
  const costEntries = [];
  const events = [];
  const artifactsByTask = new Map(plan.graph.task_ids.map((id) => [id, []]));

  for (const taskId of plan.graph.task_ids) {
    const task = taskById.get(taskId);
    const next = task.approval.required && task.approval.status !== "APPROVED"
      ? transitionTaskNode(task, "WAITING_APPROVAL", { clock })
      : transitionTaskNode(task, "READY", { clock });
    taskById.set(taskId, next);
  }

  let mission = transitionMission(plan.mission, "READY", { clock });
  events.push(event("MISSION_READY", clock, { mission_id:mission.mission_id }));

  const hasImmediatelyRunnable = plan.graph.task_ids.some((taskId) => {
    const task = taskById.get(taskId);
    return task.state === "READY" && dependencies.get(taskId).length === 0;
  });

  if (hasImmediatelyRunnable) {
    mission = transitionMission(mission, "RUNNING", { clock });
    events.push(event("MISSION_RUNNING", clock, { mission_id:mission.mission_id }));
  } else if (plan.graph.task_ids.some((taskId) => taskById.get(taskId).state === "WAITING_APPROVAL")) {
    mission = transitionMission(mission, "WAITING_APPROVAL", { clock });
    events.push(event("MISSION_WAITING_APPROVAL", clock, { mission_id:mission.mission_id }));
    return Object.freeze({
      api:MISSION_ORCHESTRATOR_API,
      mission,
      tasks:Object.freeze(plan.graph.task_ids.map((id) => taskById.get(id))),
      attempts:Object.freeze([]),
      handoffs:Object.freeze([]),
      returns:Object.freeze([]),
      verifications:Object.freeze([]),
      cost_decisions:Object.freeze([]),
      cost_entries:Object.freeze([]),
      cost_snapshot:costGovernor == null ? null : costGovernor.snapshot(),
      events:Object.freeze(events),
      cancelled:false,
      max_concurrency:maxConcurrency,
    });
  } else {
    throw new Error("Mission has no immediately runnable root and no approval gate.");
  }

  let cancelRequested = false;

  async function executeTask(taskId) {
    const current = taskById.get(taskId);
    const meta = metaById.get(taskId);
    assert(current.state === "READY", `Task must be READY before dispatch: ${taskId}`);

    let resolution = normalizeResolution(
      await resolveRuntime(Object.freeze({
        mission,
        task:current,
        node_meta:meta,
      })),
      current,
    );

    if (costGovernor != null && resolution.cost_governance == null) {
      const blocked = transitionTaskNode(current, "BLOCKED", {
        clock,
        blocking:{ kind:"POLICY", reason:"Cost Governor is enabled but runtime cost governance metadata is missing." },
      });
      taskById.set(taskId,blocked);
      events.push(event("TASK_BLOCKED_BY_COST",clock,{
        mission_id:mission.mission_id,
        task_id:taskId,
        reason_codes:Object.freeze(["COST_GOVERNANCE_MISSING"]),
      }));
      return;
    }

    const admitCost = (resolved) => {
      if (costGovernor == null) return null;
      const cg=resolved.cost_governance;
      const decision=costGovernor.admit({
        context:{
          at:clock(),
          project_id:cg.project_id,
          mission_id:mission.mission_id,
          employee_id:current.employee_id,
          mission_budget:mission.budget,
        },
        estimate:cg.estimate,
        alternatives:cg.alternatives,
        approval_ref:current.approval.status==="APPROVED" ? current.approval.approval_ref : null,
      });
      costDecisions.push(decision);
      events.push(event("COST_ADMISSION_RECORDED",clock,{
        mission_id:mission.mission_id,
        task_id:taskId,
        action:decision.action,
        decision_ref:decision.decision_ref,
        reason_codes:decision.reason_codes,
      }));
      return decision;
    };

    let costDecision=admitCost(resolution);
    if (costDecision?.action === "REROUTE") {
      if (resolveCostReroute != null && costDecision.recommended_alternative != null) {
        const rerouted = await resolveCostReroute(Object.freeze({
          mission,
          task:current,
          node_meta:meta,
          resolution,
          cost_decision:costDecision,
          recommended_alternative:costDecision.recommended_alternative,
        }));
        resolution=normalizeResolution(rerouted,current);
        assert(resolution.cost_governance != null,"Cost reroute resolution must preserve cost_governance metadata.");
        events.push(event("TASK_COST_REROUTED",clock,{
          mission_id:mission.mission_id,
          task_id:taskId,
          alternative_id:costDecision.recommended_alternative.id,
        }));
        costDecision=admitCost(resolution);
      }
      if (costDecision?.action === "REROUTE") {
        const blocked=transitionTaskNode(current,"BLOCKED",{
          clock,
          blocking:{kind:"POLICY",reason:"Cost reroute threshold reached and no admissible reroute was resolved."},
        });
        taskById.set(taskId,blocked);
        events.push(event("TASK_BLOCKED_BY_COST",clock,{
          mission_id:mission.mission_id,
          task_id:taskId,
          reason_codes:Object.freeze(["COST_REROUTE_REQUIRED"]),
        }));
        return;
      }
    }

    if (costDecision?.action === "APPROVAL_REQUIRED") {
      const waiting=transitionTaskNode(current,"WAITING_APPROVAL",{
        clock,
        approval:{required:true,status:"PENDING",approval_ref:null},
      });
      taskById.set(taskId,waiting);
      events.push(event("TASK_WAITING_COST_APPROVAL",clock,{
        mission_id:mission.mission_id,
        task_id:taskId,
        decision_ref:costDecision.decision_ref,
        reason_codes:costDecision.reason_codes,
      }));
      return;
    }

    if (costDecision?.action === "STOP") {
      const blocked=transitionTaskNode(current,"BLOCKED",{
        clock,
        blocking:{kind:"POLICY",reason:"Cost Governor hard stop: "+costDecision.reason_codes.join(", ")},
      });
      taskById.set(taskId,blocked);
      events.push(event("TASK_BLOCKED_BY_COST",clock,{
        mission_id:mission.mission_id,
        task_id:taskId,
        decision_ref:costDecision.decision_ref,
        reason_codes:costDecision.reason_codes,
      }));
      return;
    }

    const upstreamTaskIds = dependencies.get(taskId);
    const upstreamEmployees = unique(upstreamTaskIds.map((id) => taskById.get(id).employee_id), 40);
    const inputArtifactRefs = unique(upstreamTaskIds.flatMap((id) => artifactsByTask.get(id) || []));

    const handoffId = clean(idFactory("handoff", taskId, current.attempt_ids.length + 1), 160);
    assert(handoffId, "Mission orchestrator idFactory returned an empty handoff ID.");
    const envelope = buildHandoffEnvelope({
      handoff_id:handoffId,
      mission,
      task:current,
      node_meta:meta,
      source_task_ids:upstreamTaskIds,
      source_employee_ids:upstreamEmployees,
      input_artifact_refs:inputArtifactRefs,
      allowed_capabilities:resolution.required_capabilities,
      timeout_ms:resolution.timeout_ms,
      created_at:clock(),
    });
    handoffs.push(envelope);
    events.push(event("HANDOFF_CREATED", clock, {
      mission_id:mission.mission_id,
      task_id:taskId,
      handoff_id:handoffId,
      employee_id:current.employee_id,
    }));

    const running = transitionTaskNode(current, "RUNNING", { clock });
    taskById.set(taskId, running);
    events.push(event("TASK_RUNNING", clock, {
      mission_id:mission.mission_id,
      task_id:taskId,
      employee_id:running.employee_id,
    }));

    const ordinal = running.attempt_ids.length + 1;
    const attemptId = clean(idFactory("attempt", taskId, ordinal), 160);
    assert(attemptId, "Mission orchestrator idFactory returned an empty Attempt ID.");
    const dispatchStartedAt = clock();

    let outcome = null;
    let attempt = null;
    try {
      outcome = await executeBoundedRuntimeTask(
        resolution.adapter,
        runtimeTaskFromHandoff(envelope),
        {
          policy:resolution.policy,
          timeoutMs:resolution.timeout_ms,
          clock,
        },
      );

      const receiptRef = receiptRefFactory == null
        ? null
        : await receiptRefFactory(Object.freeze({
          mission,
          task:running,
          handoff:envelope,
          outcome,
          attempt_id:attemptId,
          ordinal,
        }));

      attempt = attemptFromRuntimeOutcome(outcome, {
        attempt_id:attemptId,
        task_id:taskId,
        ordinal,
        model_route_ref:resolution.model_route_ref,
        capability_route_refs:resolution.capability_route_refs,
        receipt_ref:receiptRef,
      });
    } catch (error) {
      if (!clean(error?.code, 120)) throw error;
      attempt = normalizeExecutionAttempt({
        schema:1,
        attempt_id:attemptId,
        task_id:taskId,
        ordinal,
        state:"BLOCKED",
        runtime:resolution.adapter.runtime,
        model_route_ref:resolution.model_route_ref,
        capability_route_refs:resolution.capability_route_refs,
        started_at:dispatchStartedAt,
        finished_at:clock(),
        error_category:clean(error.code, 120).toUpperCase(),
        cleanup:{ attempted:false, ok:null },
        receipt_ref:null,
        evidence_refs:[],
        artifact_refs:[],
        previous_attempt_id:null,
        recovery_checkpoint_ref:null,
      });
    }
    attempts.push(attempt);

    if (costGovernor != null) {
      const cg=resolution.cost_governance;
      let reports=reportActualCost == null ? null : await reportActualCost(Object.freeze({
        mission,
        task:running,
        resolution,
        outcome,
        attempt,
      }));
      if (reports == null || (Array.isArray(reports) && reports.length===0)) {
        reports=[{
          cost_type:cg.model_id ? "MODEL" : "PROVIDER",
          provider_id:cg.provider_id,
          model_id:cg.model_id,
          tool_id:null,
          cost:{status:"UNKNOWN",amount:null,currency:null},
          evidence_refs:attempt.evidence_refs,
        }];
      } else if (!Array.isArray(reports)) {
        reports=[reports];
      }

      for (const report of reports) {
        assert(report && typeof report === "object" && !Array.isArray(report),"reportActualCost must return an object, array, or null.");
        const recorded=costGovernor.record({
          ...report,
          cost_id:report.cost_id || ("cost:"+attempt.attempt_id+":"+(costEntries.length+1)),
          project_id:report.project_id ?? cg.project_id,
          mission_id:report.mission_id ?? mission.mission_id,
          task_id:report.task_id ?? taskId,
          employee_id:report.employee_id ?? running.employee_id,
          provider_id:report.provider_id ?? cg.provider_id,
          model_id:report.model_id ?? cg.model_id,
          evidence_refs:Array.isArray(report.evidence_refs) ? report.evidence_refs : attempt.evidence_refs,
          occurred_at:report.occurred_at || attempt.finished_at || clock(),
        });
        costEntries.push(recorded);
        events.push(event("COST_LEDGER_RECORDED",clock,{
          mission_id:mission.mission_id,
          task_id:taskId,
          cost_id:recorded.cost_id,
          cost_status:recorded.cost.status,
          cost_amount:recorded.cost.amount,
          currency:recorded.cost.currency,
        }));
      }

      const snapshot=costGovernor.snapshot();
      const breaches=snapshot.budget_state.filter((item)=>item.hard_limit_breached||item.reconciliation_required);
      if (breaches.length) {
        events.push(event("COST_RECONCILIATION_REQUIRED",clock,{
          mission_id:mission.mission_id,
          task_id:taskId,
          scopes:Object.freeze(breaches.map((item)=>Object.freeze({
            kind:item.kind,
            id:item.id,
            hard_limit_breached:item.hard_limit_breached,
            reconciliation_required:item.reconciliation_required,
          }))),
        }));
      }
    }

    let terminalTask = transitionFromAttempt(running, attempt, clock);
    terminalTask = withAttempt(terminalTask, attempt, clock);
    taskById.set(taskId, terminalTask);
    artifactsByTask.set(taskId, [...attempt.artifact_refs]);

    const handoffResult = resultFromAttempt(envelope, attempt, {
      unknowns:resolution.unknowns,
      residual_risks:resolution.residual_risks,
    });
    returns.push(handoffResult);
    events.push(event("HANDOFF_RETURNED", clock, {
      mission_id:mission.mission_id,
      task_id:taskId,
      handoff_id:handoffId,
      state:handoffResult.state,
      attempt_id:attempt.attempt_id,
    }));

    if (terminalTask.state === "SUCCEEDED" && buildVerificationRequest != null) {
      const request = await buildVerificationRequest(Object.freeze({
        mission,
        task:terminalTask,
        attempt,
        handoff:envelope,
        handoff_result:handoffResult,
      }));
      if (request != null) {
        assert(request && typeof request === "object" && !Array.isArray(request), "Verification request must be an object or null.");
        const review = await runSitiVerification({
          ...request,
          task_node:terminalTask,
          now:new Date(clock()),
        });
        verifications.push(review);
        terminalTask = review.task_node;
        taskById.set(taskId, terminalTask);
        events.push(event("TASK_VERIFICATION_RECORDED", clock, {
          mission_id:mission.mission_id,
          task_id:taskId,
          verifier_id:review.verifier_id,
          review_state:review.review_state,
          decision:review.decision,
          verification_ref:review.verification_ref,
        }));
      }
    }
  }

  function propagateDependencyBlocks() {
    let changed = false;
    for (const taskId of plan.graph.task_ids) {
      const task = taskById.get(taskId);
      if (!NONSTARTED_STATES.has(task.state)) continue;
      const failedDeps = dependencies.get(taskId).filter((id) => BLOCKING_DEPENDENCY_STATES.has(taskById.get(id).state));
      if (!failedDeps.length) continue;
      const blocked = transitionTaskNode(task, "BLOCKED", {
        clock,
        blocking:{
          kind:"DEPENDENCY",
          reason:`Upstream dependency did not succeed: ${failedDeps.join(", ")}`,
        },
      });
      taskById.set(taskId, blocked);
      events.push(event("TASK_BLOCKED_BY_DEPENDENCY", clock, {
        mission_id:mission.mission_id,
        task_id:taskId,
        dependency_task_ids:failedDeps,
      }));
      changed = true;
    }
    return changed;
  }

  function cancelPendingTasks() {
    for (const taskId of plan.graph.task_ids) {
      const task = taskById.get(taskId);
      if (!NONSTARTED_STATES.has(task.state)) continue;
      const cancelled = transitionTaskNode(task, "CANCELLED", { clock });
      taskById.set(taskId, cancelled);
      events.push(event("TASK_CANCELLED", clock, {
        mission_id:mission.mission_id,
        task_id:taskId,
      }));
    }
  }

  while (true) {
    while (propagateDependencyBlocks()) {}

    if (await shouldCancel(Object.freeze({
      mission,
      tasks:Object.freeze(plan.graph.task_ids.map((id) => taskById.get(id))),
      attempts:Object.freeze([...attempts]),
    }))) {
      cancelRequested = true;
      cancelPendingTasks();
      break;
    }

    const runnable = plan.graph.task_ids
      .filter((taskId) => taskById.get(taskId).state === "READY")
      .filter((taskId) => dependencies.get(taskId).every((id) => SUCCESS_STATES.has(taskById.get(id).state)))
      .sort();

    if (!runnable.length) break;

    const batch = runnable.slice(0, maxConcurrency);
    events.push(event("BATCH_STARTED", clock, {
      mission_id:mission.mission_id,
      task_ids:batch,
      concurrency:batch.length,
    }));
    await Promise.all(batch.map(executeTask));
    events.push(event("BATCH_FINISHED", clock, {
      mission_id:mission.mission_id,
      task_ids:batch,
    }));
  }

  while (propagateDependencyBlocks()) {}

  const finalTasks = plan.graph.task_ids.map((id) => taskById.get(id));
  const aggregateArtifacts = unique(returns.flatMap((item) => item.artifact_refs));
  const verificationEvidence = verifications.map((item) => item.verification_ref);
  const aggregateEvidence = unique([...returns.flatMap((item) => item.evidence_refs), ...verificationEvidence]);

  let targetState = cancelRequested ? "CANCELLED" : missionTerminalState(finalTasks);
  if (mission.state === "RUNNING") {
    mission = transitionMission(mission, targetState, {
      clock,
      evidence_refs:aggregateEvidence,
    });
    if (
      mission.state === "SUCCEEDED"
      && finalTasks.length > 0
      && finalTasks.every((task) => task.state === "VERIFIED")
    ) {
      mission = transitionMission(mission, "VERIFIED", {
        clock,
        verification_satisfied:true,
        evidence_refs:verificationEvidence,
      });
      events.push(event("MISSION_VERIFIED", clock, {
        mission_id:mission.mission_id,
        verification_refs:Object.freeze([...verificationEvidence]),
      }));
    }
  } else if (mission.state === "WAITING_APPROVAL" && targetState !== "WAITING_APPROVAL") {
    throw new Error("Orchestrator cannot resume a WAITING_APPROVAL Mission inside the same run.");
  }

  mission = normalizeMission({
    ...mission,
    artifact_refs:aggregateArtifacts,
    evidence_refs:unique([...mission.evidence_refs, ...aggregateEvidence]),
  });

  events.push(event("MISSION_SETTLED", clock, {
    mission_id:mission.mission_id,
    state:mission.state,
    task_states:Object.freeze(finalTasks.map((task) => Object.freeze({ task_id:task.task_id, state:task.state }))),
  }));

  for (const item of returns) normalizeHandoffResult(item);
  const telemetry = buildMissionTelemetry({
    task_nodes:finalTasks,
    attempts,
    handoff_results:returns,
  });

  return Object.freeze({
    api:MISSION_ORCHESTRATOR_API,
    mission,
    tasks:Object.freeze(finalTasks),
    attempts:Object.freeze(attempts),
    telemetry,
    handoffs:Object.freeze(handoffs),
    returns:Object.freeze(returns),
    verifications:Object.freeze(verifications),
    cost_decisions:Object.freeze(costDecisions),
    cost_entries:Object.freeze(costEntries),
    cost_snapshot:costGovernor == null ? null : costGovernor.snapshot(),
    events:Object.freeze(events),
    cancelled:cancelRequested,
    max_concurrency:maxConcurrency,
  });
}
