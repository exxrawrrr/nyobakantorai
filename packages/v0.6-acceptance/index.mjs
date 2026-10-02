import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { planMission } from "../mission-engine/planner.mjs";
import { executeMissionPlan } from "../mission-engine/orchestrator.mjs";
import { scanPublicRunRecord } from "../portability-live-run/index.mjs";

export const V06_ACCEPTANCE_API = 1;
export const V06_ACCEPTANCE_CRITERIA = Object.freeze([
  "USER_OBJECTIVE",
  "PRARORO_PLAN",
  "SPECIALIZED_WORKERS",
  "PARALLEL_BRANCH",
  "REAL_MODEL_EXECUTION",
  "SAFE_TOOLS",
  "ARTIFACT_OUTPUT",
  "SITI_VERIFICATION",
  "EVIDENCE_UI_DATA",
  "COST_QUOTA_ENFORCEMENT",
  "NO_EXTERNAL_WRITE",
]);

const DEFAULT_OBJECTIVE = "Produce an evidence-backed v0.6.0 acceptance brief using bounded read-only work, parallel specialist analysis, synthesis, and independent verification.";
const SPECIALISTS = Object.freeze(["alex","subagjo","nara"]);
const SAFE_CAPABILITIES = Object.freeze(["model_inference","temporary_workspace","evidence_collection"]);

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const unique = (values) => Object.freeze([...new Set((Array.isArray(values) ? values : []).map((value) => clean(value)).filter(Boolean))]);

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function criterion(id, passed, evidence = [], blockers = [], limitations = []) {
  return freeze({
    id,
    status:passed ? "PASS" : "BLOCKED",
    evidence:unique(evidence),
    blockers:unique(blockers),
    limitations:unique(limitations),
  });
}

function acceptanceIdFactory(kind, index, label) {
  const slug = clean(label, 80).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "item";
  return `${kind === "task" ? "tnode" : kind}-v06-accept-${index + 1}-${slug}`;
}

export function buildV06AcceptancePlan({
  objective = DEFAULT_OBJECTIVE,
  clock = () => "2026-10-02T02:10:00.000Z",
} = {}) {
  return planMission({
    objective,
    constraints:[
      "read-only execution",
      "no external writes",
      "temporary workspaces only",
      "bounded runtime and quota policy",
    ],
    required_evidence:[
      "runtime evidence",
      "artifact provenance",
      "independent verification",
    ],
    risk_class:"READ_ONLY",
    budget:{ hard_limit_amount:0.05, currency:"USD" },
    autonomy:{ mode:"GUARDED", delegated_capabilities:[] },
    work_items:[
      {
        key:"plan",
        title:"Frame bounded acceptance plan",
        objective:"Praroro frames the acceptance mission, constraints, evidence requirements, and specialist handoffs.",
        assigned_id:"praroro",
        required_evidence:["mission plan evidence"],
        depends_on:[],
      },
      {
        key:"research",
        title:"Research acceptance evidence",
        objective:"Alex inspects the bounded evidence requirements and prepares source-backed acceptance findings.",
        assigned_id:"alex",
        required_evidence:["source provenance"],
        depends_on:["plan"],
      },
      {
        key:"engineering",
        title:"Inspect implementation integrity",
        objective:"Subagjo inspects implementation boundaries, regression expectations, and no-write safety conditions.",
        assigned_id:"subagjo",
        required_evidence:["implementation evidence","regression evidence"],
        depends_on:["plan"],
      },
      {
        key:"data",
        title:"Reconcile acceptance criteria",
        objective:"Nara reconciles mission evidence against the acceptance criteria without inventing missing measurements.",
        assigned_id:"nara",
        required_evidence:["criteria reconciliation"],
        depends_on:["plan"],
      },
      {
        key:"synthesis",
        title:"Synthesize acceptance bundle",
        objective:"Praroro synthesizes specialist artifacts into one bounded acceptance result for independent verification.",
        assigned_id:"praroro",
        required_evidence:["upstream artifact references","decision rationale"],
        depends_on:["research","engineering","data"],
      },
    ],
  }, { clock, idFactory:acceptanceIdFactory });
}

function deterministicAdapter(taskId, observations) {
  return defineRuntimeExecutionAdapter({
    id:"v06-acceptance-fixture",
    version:"1.0.0",
    runtime:{
      provider:"acceptance-fixture",
      runtime_ref:`fixture:v06-acceptance:${taskId}`,
      provider_version:"1.0.0",
    },
    capabilities:[...SAFE_CAPABILITIES],
    side_effects:{},
    process_contract:null,
    async prepare() {
      return {
        workspace:{
          kind:"TEMPORARY",
          ref:`tmp://v06-acceptance/${taskId}`,
          isolated:true,
          production_repo:false,
        },
        session_ref:`session:v06-acceptance:${taskId}`,
      };
    },
    async executeBoundedTask() {
      return { task_id:taskId, bounded:true };
    },
    async normalizeResult() {
      return {
        schema:1,
        state:"SUCCEEDED",
        summary:`Deterministic bounded acceptance result for ${taskId}.`,
        output:{ task_id:taskId, status:"SUCCEEDED" },
        artifact_refs:[`artifact:v06-acceptance:${taskId}:result`],
        evidence_refs:[`evidence:v06-acceptance:${taskId}:result`],
      };
    },
    async collectEvidence() {
      const evidence = {
        schema:1,
        raw_result_ref:`artifact:v06-acceptance:${taskId}:raw`,
        normalized_result_ref:`artifact:v06-acceptance:${taskId}:result`,
        capabilities_used:[...SAFE_CAPABILITIES],
        workspace_mutation_check:{
          temporary_workspace_only:true,
          production_repo_changed:false,
        },
        prohibited_action_check:{ passed:true, observed:[] },
        runtime_actions:{
          install:false,
          login:false,
          account_mutation:false,
          external_write:false,
        },
        evidence_refs:[
          `evidence:v06-acceptance:${taskId}:runtime`,
          `evidence:v06-acceptance:${taskId}:policy`,
        ],
        artifact_refs:[
          `artifact:v06-acceptance:${taskId}:raw`,
          `artifact:v06-acceptance:${taskId}:result`,
        ],
      };
      observations.set(taskId, freeze(structuredClone(evidence)));
      return evidence;
    },
    async cleanup() {
      return { ok:true };
    },
  });
}

function verificationRequest({ task, attempt }, checkedAt) {
  const sourceRef = attempt.artifact_refs[0];
  const fact = `attempt=${attempt.attempt_id}`;
  return {
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:{
      expected:{
        required_facts:[fact],
        required_artifacts:[sourceRef],
        required_completion_items:["runtime-succeeded"],
        required_evidence_refs:[sourceRef],
      },
      report:{
        text:`Independent acceptance review confirms ${fact}.`,
        claimed_executed:false,
      },
      evidence:{
        observed_text:`Observed ${fact}.`,
        refs:[sourceRef],
        artifacts:[sourceRef],
        completion_items:["runtime-succeeded"],
        checked_at:checkedAt,
      },
    },
    research:{
      claims:[{
        claim_id:`runtime-state-${task.task_id}`,
        statement:"The bounded acceptance runtime attempt succeeded.",
        source_ref:sourceRef,
        source_exists:true,
        source_relevant:true,
        source_current:true,
        expected_value:"SUCCEEDED",
        observed_value:"SUCCEEDED",
        expected_unit:"state",
        observed_unit:"state",
      }],
    },
  };
}

export async function runDeterministicV06Acceptance({
  runtime_policy,
  objective = DEFAULT_OBJECTIVE,
  clock = () => "2026-10-02T02:10:00.000Z",
} = {}) {
  if (!runtime_policy || typeof runtime_policy !== "object") throw new Error("runtime_policy is required");
  const plan = buildV06AcceptancePlan({ objective, clock });
  const observations = new Map();

  const result = await executeMissionPlan(plan, {
    maxConcurrency:3,
    clock,
    resolveRuntime:async ({ task }) => ({
      adapter:deterministicAdapter(task.task_id, observations),
      policy:runtime_policy,
      required_capabilities:[...SAFE_CAPABILITIES],
      capability_route_refs:[`capability-route:v06-acceptance:${task.task_id}`],
      model_route_ref:null,
      unknowns:["DETERMINISTIC_ACCEPTANCE_RUNTIME"],
      residual_risks:["REAL_MODEL_EXECUTION_REQUIRES_SEPARATE_LIVE_OBSERVATION"],
    }),
    buildVerificationRequest:async (context) => verificationRequest(context, clock()),
  });

  return freeze({
    api:V06_ACCEPTANCE_API,
    mode:"DETERMINISTIC",
    plan,
    result,
    runtime_observations:Object.freeze([...observations.entries()].map(([task_id,evidence]) => Object.freeze({ task_id,evidence }))),
    configured_max_concurrency:3,
  });
}

function validLiveObservation(observation, expectedCommit) {
  const record = observation?.record;
  const sandbox = observation?.sandbox;
  if (!record || !sandbox) return { ok:false, blockers:["LIVE_OBSERVATION_MISSING"], limitations:[] };

  const blockers = [];
  const limitations = [];
  const publicScan = scanPublicRunRecord(record);
  if (!publicScan.ok) blockers.push("LIVE_RECORD_PUBLIC_SAFETY_FAILED");
  if (record.evidence_class !== "LIVE_RUNTIME_EVIDENCE") blockers.push("LIVE_RUNTIME_EVIDENCE_MISSING");
  if (record.capture?.origin !== "canonical-live-reference-runner-v1") blockers.push("LIVE_RUNNER_ORIGIN_INVALID");
  if (record.capture?.mode !== "live") blockers.push("LIVE_MODE_NOT_PROVEN");
  if (record.capture?.repository?.clean !== true) blockers.push("LIVE_REPOSITORY_NOT_CLEAN");
  if (record.capture?.repository?.commit !== expectedCommit) blockers.push("LIVE_COMMIT_MISMATCH");
  if (record.capture?.qualification?.eligible !== true) blockers.push("LIVE_QUALIFICATION_FAILED");
  if (record.execution?.ok !== true || record.execution?.state !== "SUCCEEDED") blockers.push("LIVE_EXECUTION_NOT_SUCCESSFUL");
  if (record.execution?.cleanup_ok !== true) blockers.push("LIVE_CLEANUP_NOT_SUCCESSFUL");
  if (record.evidence?.workspace_mutation_check?.temporary_workspace_only !== true) blockers.push("LIVE_TEMP_WORKSPACE_NOT_PROVEN");
  if (record.evidence?.workspace_mutation_check?.production_repo_changed !== false) blockers.push("LIVE_PRODUCTION_REPO_MUTATION");
  if (record.evidence?.prohibited_action_check?.passed !== true) blockers.push("LIVE_PROHIBITED_ACTION_CHECK_FAILED");
  if (record.evidence?.runtime_actions?.external_write !== false) blockers.push("LIVE_EXTERNAL_WRITE_NOT_DISPROVEN");
  if (sandbox.executed !== true) blockers.push("LIVE_SANDBOX_NOT_EXECUTED");
  if (!["PASS","PARTIAL"].includes(sandbox.status)) blockers.push("LIVE_SANDBOX_FAILED");
  if (!["PASS","PARTIAL"].includes(sandbox.quota_status)) blockers.push("LIVE_QUOTA_FAILED");
  if (sandbox.teardown_verified !== true) blockers.push("LIVE_TEARDOWN_NOT_VERIFIED");
  if (sandbox.quota_status === "PARTIAL") {
    limitations.push(...(sandbox.unverified_dimensions || []).map((item) => `LIVE_QUOTA_UNKNOWN:${clean(item,120)}`));
  }
  return { ok:blockers.length === 0, blockers, limitations };
}

export function reconcileV06Acceptance({
  mission_run,
  live_observation = null,
  expected_commit,
} = {}) {
  if (!mission_run?.plan || !mission_run?.result) throw new Error("mission_run is required");
  if (!/^[a-f0-9]{40}$/.test(clean(expected_commit,40))) throw new Error("expected_commit must be an exact git SHA");

  const { plan, result } = mission_run;
  const byEmployee = new Map();
  for (const task of plan.task_nodes) {
    const list = byEmployee.get(task.employee_id) || [];
    list.push(task);
    byEmployee.set(task.employee_id,list);
  }
  const rootIds = new Set(plan.graph.roots || []);
  const praroroRoot = plan.task_nodes.some((task) => task.employee_id === "praroro" && rootIds.has(task.task_id));
  const specialistIds = SPECIALISTS.filter((id) => byEmployee.has(id));
  const parallel = (plan.graph.parallel_groups || []).find((group) => {
    const employees = group.map((taskId) => plan.task_nodes.find((task) => task.task_id === taskId)?.employee_id);
    return SPECIALISTS.every((id) => employees.includes(id));
  });

  const runtimeEvidence = mission_run.runtime_observations || [];
  const safeTools = runtimeEvidence.length === result.attempts.length
    && runtimeEvidence.every((item) => item.evidence?.prohibited_action_check?.passed === true)
    && runtimeEvidence.every((item) => item.evidence?.capabilities_used?.every((cap) => SAFE_CAPABILITIES.includes(cap)));
  const noExternalWrite = runtimeEvidence.length === result.attempts.length
    && runtimeEvidence.every((item) => item.evidence?.runtime_actions?.external_write === false)
    && runtimeEvidence.every((item) => item.evidence?.workspace_mutation_check?.production_repo_changed === false);

  const verificationPass = result.verifications.length === result.tasks.length
    && result.verifications.every((review) => review.verifier_id === "siti" && review.independent === true && review.review_state === "PASS" && review.decision === "VERIFIED")
    && result.tasks.every((task) => task.state === "VERIFIED")
    && result.mission.state === "VERIFIED";

  const evidenceUiReady = result.telemetry.length === result.tasks.length
    && result.telemetry.every((row) => row.execution?.terminal === true && row.traceability?.terminal_state_ref)
    && result.verifications.length === result.tasks.length;

  const live = validLiveObservation(live_observation, expected_commit);
  const sandbox = live_observation?.sandbox || null;
  const liveRecord = live_observation?.record || null;
  const quotaEnforced = live.ok && ["PASS","PARTIAL"].includes(sandbox?.quota_status);

  const criteria = Object.freeze([
    criterion("USER_OBJECTIVE", Boolean(clean(plan.mission.objective)), [`mission:${plan.mission.mission_id}`]),
    criterion("PRARORO_PLAN", praroroRoot, praroroRoot ? ["employee:praroro","graph:root"] : [], praroroRoot ? [] : ["PRARORO_ROOT_PLAN_MISSING"]),
    criterion("SPECIALIZED_WORKERS", specialistIds.length >= 3, specialistIds.map((id) => `employee:${id}`), specialistIds.length >= 3 ? [] : ["SPECIALIST_COUNT_BELOW_3"]),
    criterion("PARALLEL_BRANCH", Boolean(parallel), parallel || [], parallel ? [] : ["THREE_SPECIALIST_PARALLEL_BRANCH_MISSING"]),
    criterion("REAL_MODEL_EXECUTION", live.ok, live.ok ? [`runtime:${liveRecord.runtime?.provider || "unknown"}`,`commit:${expected_commit}`] : [], live.blockers, live.limitations),
    criterion("SAFE_TOOLS", safeTools, safeTools ? SAFE_CAPABILITIES.map((cap) => `capability:${cap}`) : [], safeTools ? [] : ["SAFE_RUNTIME_EVIDENCE_INCOMPLETE"]),
    criterion("ARTIFACT_OUTPUT", result.mission.artifact_refs.length > 0, result.mission.artifact_refs, result.mission.artifact_refs.length ? [] : ["MISSION_ARTIFACT_MISSING"]),
    criterion("SITI_VERIFICATION", verificationPass, result.verifications.map((item) => item.verification_ref), verificationPass ? [] : ["INDEPENDENT_VERIFICATION_INCOMPLETE"]),
    criterion("EVIDENCE_UI_DATA", evidenceUiReady, result.telemetry.map((item) => item.traceability.terminal_state_ref), evidenceUiReady ? [] : ["CANONICAL_EVIDENCE_UI_INPUT_INCOMPLETE"]),
    criterion("COST_QUOTA_ENFORCEMENT", quotaEnforced, quotaEnforced ? [`quota:${sandbox.quota_status}`,`sandbox:${sandbox.record_ref || sandbox.admission_ref || "observed"}`] : [], quotaEnforced ? [] : ["CURRENT_COMMIT_LIVE_SANDBOX_QUOTA_EVIDENCE_MISSING"], live.limitations),
    criterion("NO_EXTERNAL_WRITE", noExternalWrite && (!live_observation || liveRecord?.evidence?.runtime_actions?.external_write === false), noExternalWrite ? ["deterministic-runtime:no-external-write"] : [], noExternalWrite ? [] : ["EXTERNAL_WRITE_SAFETY_NOT_PROVEN"]),
  ]);

  const deterministicFailures = criteria.filter((item) => !["REAL_MODEL_EXECUTION","COST_QUOTA_ENFORCEMENT"].includes(item.id) && item.status !== "PASS");
  const blocked = criteria.filter((item) => item.status !== "PASS");
  const status = deterministicFailures.length ? "FAILED" : blocked.length ? "BLOCKED" : "ACCEPTED";

  return freeze({
    api:V06_ACCEPTANCE_API,
    status,
    expected_commit,
    mission_id:plan.mission.mission_id,
    mission_state:result.mission.state,
    criteria,
    blockers:unique(blocked.flatMap((item) => item.blockers)),
    limitations:unique(criteria.flatMap((item) => item.limitations)),
    summary:Object.freeze({
      passed:criteria.filter((item) => item.status === "PASS").length,
      total:criteria.length,
      live_observation_present:Boolean(live_observation),
    }),
  });
}
