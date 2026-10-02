import { createHash, randomBytes } from "node:crypto";
import { planMission } from "../packages/mission-engine/planner.mjs";
import { validateSandboxRecord } from "../packages/live-sandbox/index.mjs";
import { buildExecutionTelemetry } from "../packages/mission-engine/telemetry.mjs";
import { containsSecretLikeContent } from "../packages/execution-receipt/index.mjs";

export const PUBLIC_DEMO_API = 1;
export const PUBLIC_DEMO_DEFAULT_LIMITS = Object.freeze({
  session_ttl_ms:30 * 60 * 1000,
  max_sessions:200,
  rate_window_ms:60 * 1000,
  max_requests_per_window:12,
  max_active_missions:1,
  max_demo_missions:8,
  max_live_missions:1,
  max_objective_chars:1200,
  max_task_nodes:4,
});

const DEMO_GENERATED_AT = "2026-10-01T00:00:00.000Z";
const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const iso = (ms) => new Date(ms).toISOString();
const PRIVATE_REF_PATTERN = /(?:^[A-Za-z]:[\\/]|^\\\\|^file:\/\/|\/(?:home|Users|root)\/)/i;
const CREDENTIAL_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@/i;

function publicSafeText(value, max = 1000) {
  if (value == null) return null;
  const text = clean(value, max);
  if (!text) return text;
  if (containsSecretLikeContent(text) || CREDENTIAL_URL_PATTERN.test(text)) return "REDACTED_SENSITIVE_REF";
  if (PRIVATE_REF_PATTERN.test(text)) return "REDACTED_PRIVATE_REF";
  return text;
}

function publicTelemetryProjection(value) {
  return Object.freeze({
    ...value,
    runtime:Object.freeze({
      ...value.runtime,
      runtime_ref:publicSafeText(value.runtime?.runtime_ref,512),
    }),
    artifact_refs:Object.freeze((value.artifact_refs || []).map((item) => publicSafeText(item))),
    evidence_refs:Object.freeze((value.evidence_refs || []).map((item) => publicSafeText(item))),
    unknowns:Object.freeze((value.unknowns || []).map((item) => publicSafeText(item))),
    blockers:Object.freeze((value.blockers || []).map((item) => Object.freeze({
      ...item,
      detail:item.detail == null ? null : publicSafeText(item.detail),
    }))),
    residual_risks:Object.freeze((value.residual_risks || []).map((item) => publicSafeText(item))),
    traceability:Object.freeze({
      ...value.traceability,
      recovery_checkpoint_ref:value.traceability?.recovery_checkpoint_ref == null
        ? null
        : publicSafeText(value.traceability.recovery_checkpoint_ref),
    }),
  });
}

function numericLimit(value, fallback, label) {
  const selected = value == null ? fallback : Number(value);
  if (!Number.isInteger(selected) || selected < 1) throw new Error(`${label} must be a positive integer.`);
  return selected;
}

function normalizeLimits(overrides = {}) {
  const base = PUBLIC_DEMO_DEFAULT_LIMITS;
  return Object.freeze({
    session_ttl_ms:numericLimit(overrides.session_ttl_ms, base.session_ttl_ms, "session_ttl_ms"),
    max_sessions:numericLimit(overrides.max_sessions, base.max_sessions, "max_sessions"),
    rate_window_ms:numericLimit(overrides.rate_window_ms, base.rate_window_ms, "rate_window_ms"),
    max_requests_per_window:numericLimit(overrides.max_requests_per_window, base.max_requests_per_window, "max_requests_per_window"),
    max_active_missions:1,
    max_demo_missions:numericLimit(overrides.max_demo_missions, base.max_demo_missions, "max_demo_missions"),
    max_live_missions:numericLimit(overrides.max_live_missions, base.max_live_missions, "max_live_missions"),
    max_objective_chars:numericLimit(overrides.max_objective_chars, base.max_objective_chars, "max_objective_chars"),
    max_task_nodes:numericLimit(overrides.max_task_nodes, base.max_task_nodes, "max_task_nodes"),
  });
}

function stableIdFactory(objective) {
  const seed = sha(objective).slice(0, 12);
  return (kind, index, label) => {
    const slug = clean(label, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
    return `${kind}-public-${seed}-${String(index + 1).padStart(2, "0")}-${slug}`;
  };
}

function objectiveOrError(payload, limits) {
  const raw = String(payload?.objective ?? "").trim();
  if (!raw) return { error:result(400, "OBJECTIVE_REQUIRED", "Mission objective is required.") };
  if (raw.length > limits.max_objective_chars) {
    return { error:result(400, "OBJECTIVE_TOO_LONG", `Mission objective exceeds ${limits.max_objective_chars} characters.`) };
  }
  return { objective:raw };
}

function result(status, errorCode, message, extra = {}) {
  return Object.freeze({
    status,
    body:Object.freeze({
      schema:PUBLIC_DEMO_API,
      ok:false,
      error_code:errorCode,
      message,
      ...extra,
    }),
  });
}

function fallbackBody(state, message, extra = {}) {
  return Object.freeze({
    schema:PUBLIC_DEMO_API,
    ok:false,
    experience:"LIVE",
    truth_label:"NOT_LIVE",
    live:false,
    state,
    message,
    fallback:Object.freeze({ experience:"DEMO", endpoint:"/api/public/demo" }),
    ...extra,
  });
}
function buildPlan(objective, limits) {
  const plan = planMission({
    objective,
    constraints:[
      "public demo is read-only",
      "no account access",
      "no production external writes",
      "no paid or destructive actions",
    ],
    required_evidence:["public-demo-truth-label"],
    risk_class:"READ_ONLY",
    budget:{ hard_limit_amount:null, currency:null },
    autonomy:{ mode:"GUARDED", delegated_capabilities:[] },
  }, {
    clock:() => DEMO_GENERATED_AT,
    idFactory:stableIdFactory(objective),
  });
  if (plan.task_nodes.length > limits.max_task_nodes) throw new Error("Public demo task graph exceeds configured node ceiling.");
  return plan;
}

function presentation(plan, truthLabel, executedTaskId = null) {
  return Object.freeze({
    task_nodes:Object.freeze(plan.task_nodes.map((task) => Object.freeze({
      task_id:task.task_id,
      title:task.title,
      employee_id:task.employee_id,
      state:task.state,
      truth_label:executedTaskId === null
        ? truthLabel
        : task.task_id === executedTaskId ? "LIVE_RUNTIME" : "LIVE_PLANNED",
    }))),
    graph:plan.graph,
    executed_task_id:executedTaskId,
  });
}

function sessionPublic(session, limits) {
  return Object.freeze({
    session_id:session.id,
    expires_at:iso(session.expires_at),
    active_mission:null,
    quotas:Object.freeze({
      demo:Object.freeze({ used:session.demo_count, max:limits.max_demo_missions }),
      live:Object.freeze({ used:session.live_count, max:limits.max_live_missions }),
      active:Object.freeze({ used:session.active_mission ? 1 : 0, max:limits.max_active_missions }),
    }),
    rate:Object.freeze({
      window_ms:limits.rate_window_ms,
      max_requests:limits.max_requests_per_window,
    }),
  });
}

function verifyLiveResult(value, plan) {
  if (!value || value.executed !== true || value.outcome?.ok !== true) return null;
  if (!value.record || !value.admission || !value.attempt || !value.task_node) return null;
  try { validateSandboxRecord(value.record); } catch { return null; }
  const plannedTask = plan.task_nodes.find((task) => task.task_id === value.record.task_id);
  if (!plannedTask) return null;
  if (value.record.mission_id !== plan.mission.mission_id) return null;
  if (value.task_node.task_id !== plannedTask.task_id) return null;
  if (value.task_node.mission_id !== plan.mission.mission_id) return null;
  if (value.task_node.employee_id !== plannedTask.employee_id) return null;
  if (value.record.status !== "PASS") return null;
  if (value.record.quota_status !== "PASS") return null;
  if (value.record.teardown_verified !== true || value.record.execution_ok !== true) return null;

  let telemetry;
  try {
    telemetry = buildExecutionTelemetry({
      task_node:value.task_node,
      attempt:value.attempt,
      sandbox_admission:value.admission,
      sandbox_record:value.record,
      handoff_result:value.handoff_result || null,
    });
  } catch {
    return null;
  }
  if (telemetry.execution.terminal !== true || telemetry.execution.state !== "SUCCEEDED") return null;
  return Object.freeze({ record:value.record, telemetry });
}

export function createPublicDemoService({
  now = () => Date.now(),
  token_factory = () => randomBytes(24).toString("base64url"),
  live_runner = null,
  limits:limitOverrides = {},
} = {}) {
  const limits = normalizeLimits(limitOverrides);
  const sessions = new Map();

  function prune(reservedSlots = 0) {
    const current = now();
    for (const [token, session] of sessions) {
      if (session.expires_at <= current) sessions.delete(token);
    }
    const allowedExisting = Math.max(0, limits.max_sessions - reservedSlots);
    if (sessions.size <= allowedExisting) return;
    const oldest = [...sessions.entries()].sort((a,b) => a[1].expires_at - b[1].expires_at);
    for (const [token] of oldest.slice(0, sessions.size - allowedExisting)) sessions.delete(token);
  }
  function createSession() {
    prune(1);
    let token;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      token = clean(token_factory(), 512);
      if (token && !sessions.has(token)) break;
      token = "";
    }
    if (!token) throw new Error("Anonymous session token factory did not produce a unique token.");
    const current = now();
    const session = {
      id:`anon-${sha(token).slice(0, 16)}`,
      created_at:current,
      expires_at:current + limits.session_ttl_ms,
      request_times:[],
      active_mission:null,
      demo_count:0,
      live_count:0,
    };
    sessions.set(token, session);
    return Object.freeze({ token, public_session:sessionPublic(session, limits) });
  }

  function resolveSession(token) {
    prune();
    const normalizedToken = clean(token, 512);
    const session = sessions.get(normalizedToken);
    if (!session) return null;
    if (session.expires_at <= now()) {
      sessions.delete(normalizedToken);
      return null;
    }
    return session;
  }

  function chargeRequest(session) {
    const current = now();
    session.request_times = session.request_times.filter((at) => current - at < limits.rate_window_ms);
    if (session.request_times.length >= limits.max_requests_per_window) {
      return result(429, "SESSION_RATE_LIMITED", "Anonymous session request rate exceeded.");
    }
    session.request_times.push(current);
    return null;
  }

  function sessionOrError(token) {
    const session = resolveSession(token);
    if (!session) return { error:result(401, "ANONYMOUS_SESSION_REQUIRED", "Create a fresh anonymous session before running a mission.") };
    const rateError = chargeRequest(session);
    if (rateError) return { error:rateError };
    if (session.active_mission) {
      return { error:result(409, "SESSION_MISSION_ACTIVE", "Only one active mission is allowed per anonymous session.") };
    }
    return { session };
  }

  async function runDemo(token, payload = {}) {
    const resolved = sessionOrError(token);
    if (resolved.error) return resolved.error;
    const { session } = resolved;
    if (session.demo_count >= limits.max_demo_missions) {
      return result(429, "DEMO_SESSION_QUOTA_EXCEEDED", "Deterministic demo quota reached for this anonymous session.");
    }
    const objectiveResult = objectiveOrError(payload, limits);
    if (objectiveResult.error) return objectiveResult.error;
    const plan = buildPlan(objectiveResult.objective, limits);
    session.active_mission = plan.mission.mission_id;
    try {
      session.demo_count += 1;
      return Object.freeze({
        status:200,
        body:Object.freeze({
          schema:PUBLIC_DEMO_API,
          ok:true,
          experience:"DEMO",
          truth_label:"SYNTHETIC",
          live:false,
          state:"DEMO_COMPLETE",
          objective:objectiveResult.objective,
          session:sessionPublic(session, limits),
          plan,
          presentation:presentation(plan, "SYNTHETIC"),
        }),
      });
    } finally {
      session.active_mission = null;
    }
  }

  async function runLive(token, payload = {}) {
    const resolved = sessionOrError(token);
    if (resolved.error) return resolved.error;
    const { session } = resolved;
    if (session.live_count >= limits.max_live_missions) {
      return result(429, "LIVE_SESSION_QUOTA_EXCEEDED", "Live mission quota reached for this anonymous session.");
    }
    const objectiveResult = objectiveOrError(payload, limits);
    if (objectiveResult.error) return objectiveResult.error;
    if (typeof live_runner !== "function") {
      return Object.freeze({
        status:503,
        body:fallbackBody("LIVE_UNAVAILABLE", "Live runtime capacity is unavailable. Deterministic demo remains available.", {
          session:sessionPublic(session, limits),
        }),
      });
    }

    const plan = buildPlan(objectiveResult.objective, limits);
    session.active_mission = plan.mission.mission_id;
    session.live_count += 1;
    try {
      let liveResult;
      try {
        liveResult = await live_runner(Object.freeze({
          objective:objectiveResult.objective,
          plan,
          session_id:session.id,
          limits,
        }));
      } catch {
        return Object.freeze({
          status:503,
          body:fallbackBody("LIVE_UNAVAILABLE", "Live runtime did not complete. Deterministic demo remains available.", {
            session:sessionPublic(session, limits),
          }),
        });
      }

      const verified = verifyLiveResult(liveResult, plan);
      if (!verified) {
        return Object.freeze({
          status:502,
          body:fallbackBody("LIVE_VERIFICATION_FAILED", "Live runtime result did not satisfy sandbox verification. It is not labeled live success.", {
            session:sessionPublic(session, limits),
          }),
        });
      }

      const { record, telemetry } = verified;
      return Object.freeze({
        status:200,
        body:Object.freeze({
          schema:PUBLIC_DEMO_API,
          ok:true,
          experience:"LIVE",
          truth_label:"LIVE_RUNTIME",
          live:true,
          state:"LIVE_COMPLETE",
          objective:objectiveResult.objective,
          session:sessionPublic(session, limits),
          plan,
          presentation:presentation(plan, "LIVE_PLANNED", record.task_id),
          telemetry:publicTelemetryProjection(telemetry),
          sandbox:Object.freeze({
            provider_id:record.provider_id,
            model_identity:record.model_identity,
            status:record.status,
            quota_status:record.quota_status,
            teardown_verified:record.teardown_verified,
            sandbox_record_ref:record.sandbox_record_ref,
          }),
        }),
      });
    } finally {
      session.active_mission = null;
    }
  }

  return Object.freeze({
    api:PUBLIC_DEMO_API,
    limits,
    live_available:typeof live_runner === "function",
    createSession,
    runDemo,
    runLive,
  });
}
