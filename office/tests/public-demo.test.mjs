import test from "node:test";
import assert from "node:assert/strict";
import { admitLiveSandboxDispatch, defineLiveSandboxPolicy, settleLiveSandbox } from "../../packages/live-sandbox/index.mjs";
import { attemptFromRuntimeOutcome } from "../../packages/mission-engine/contracts.mjs";
import { runSitiVerification } from "../../packages/evidence-verifier/siti.mjs";
import { createPublicDemoService, PUBLIC_DEMO_API, PUBLIC_DEMO_DEFAULT_LIMITS } from "../public-demo.mjs";

const fixedNow = Date.parse("2026-10-01T12:00:00.000Z");

function tokenFactory(...tokens) {
  let index = 0;
  return () => tokens[index++] || `token-${index}`;
}

function safeLiveResult(plan, { runtime_ref="fixture:ephemeral", evidence_ref="evidence:fixture", artifact_ref=null } = {}) {
  const task = plan.task_nodes[0];
  const policy = defineLiveSandboxPolicy({
    schema:1,
    id:"public-live-test",
    allowed_risk_classes:["READ_ONLY"],
    max_duration_ms:45000,
    max_tool_calls:0,
    max_input_tokens:12000,
    max_output_tokens:4000,
    max_total_tokens:16000,
    max_cost_usd:0.05,
    allowed_tool_ids:[],
    allowed_network_hosts:[],
    allowed_runtime_providers:["fixture-runtime"],
    allow_fallback:false,
    require_temporary_workspace:true,
    forbid_external_write:true,
    forbid_credentials_exposure:true,
  });
  const admission = admitLiveSandboxDispatch(policy, {
    schema:1,
    mission_id:plan.mission.mission_id,
    task_id:task.task_id,
    risk_class:"READ_ONLY",
    provider_id:"fixture-runtime",
    model_identity:{status:"KNOWN",model_id:"fixture-model"},
    model_route_ref:"model-route:sha256:"+"a".repeat(64),
    capability_route_refs:[],
    tool_ids:[],
    network_hosts:[],
    fallback_models:[],
    credentials_exposed_to_task:false,
    projected_usage:{
      duration_ms:1000,
      tool_calls:0,
      input_tokens:100,
      output_tokens:50,
      cost:{status:"KNOWN",amount_usd:0.01},
    },
  });
  const outcome = {
    schema:1,
    ok:true,
    state:"SUCCEEDED",
    error_category:null,
    runtime:{provider:"fixture-runtime",runtime_ref,provider_version:"1"},
    evidence:{
      workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
      prohibited_action_check:{passed:true,observed:[]},
      runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},
      evidence_refs:[evidence_ref],
      artifact_refs:artifact_ref ? [artifact_ref] : [],
    },
    cleanup:{attempted:true,ok:true},
    started_at:"2026-10-01T12:00:00.000Z",
    finished_at:"2026-10-01T12:00:01.000Z",
  };
  const record = settleLiveSandbox(admission, outcome, {
    duration_ms:1000,
    tool_calls:0,
    input_tokens:100,
    output_tokens:50,
    cost:{status:"KNOWN",amount_usd:0.01},
  });
  const attempt = attemptFromRuntimeOutcome(outcome, {
    attempt_id:"attempt-public-live-001",
    task_id:task.task_id,
    ordinal:1,
    model_route_ref:admission.model_route_ref,
    capability_route_refs:admission.capability_route_refs,
    receipt_ref:"receipt:sha256:"+"4".repeat(64),
  });
  const task_node = {
    ...task,
    state:"SUCCEEDED",
    attempt_ids:[attempt.attempt_id],
    evidence_refs:[...task.evidence_refs,...attempt.evidence_refs],
    receipt_refs:[attempt.receipt_ref],
    blocking:null,
    updated_at:"2026-10-01T12:00:01.000Z",
  };
  return { executed:true, outcome, admission, record, attempt, task_node };
}

test("public demo API exposes bounded defaults", () => {
  assert.equal(PUBLIC_DEMO_API, 1);
  assert.equal(PUBLIC_DEMO_DEFAULT_LIMITS.max_active_missions, 1);
  assert.ok(PUBLIC_DEMO_DEFAULT_LIMITS.max_demo_missions > 0);
  assert.ok(PUBLIC_DEMO_DEFAULT_LIMITS.max_live_missions > 0);
  assert.ok(PUBLIC_DEMO_DEFAULT_LIMITS.max_objective_chars <= 4000);
});

test("deterministic demo returns the same synthetic plan for the same objective", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-a","token-b"),
  });
  const a = service.createSession();
  const b = service.createSession();
  const objective = "Audit SEO landing page performance and produce a brief.";
  const first = await service.runDemo(a.token, { objective });
  const second = await service.runDemo(b.token, { objective });

  assert.equal(first.status, 200);
  assert.equal(first.body.experience, "DEMO");
  assert.equal(first.body.truth_label, "SYNTHETIC");
  assert.equal(first.body.live, false);
  assert.equal(first.body.session.active_mission, null);
  assert.deepEqual(first.body.plan, second.body.plan);
  assert.ok(first.body.plan.task_nodes.length >= 1);
  assert.ok(first.body.presentation.task_nodes.every((node) => node.truth_label === "SYNTHETIC"));
  assert.equal("token" in a.public_session, false);
});

test("anonymous session quotas are isolated between visitors", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-a","token-b"),
    limits:{ max_demo_missions:1, max_requests_per_window:10 },
  });
  const a = service.createSession();
  const b = service.createSession();

  assert.equal((await service.runDemo(a.token,{objective:"Prepare a bounded SEO audit."})).status,200);
  const blocked = await service.runDemo(a.token,{objective:"Prepare another bounded SEO audit."});
  assert.equal(blocked.status,429);
  assert.equal(blocked.body.error_code,"DEMO_SESSION_QUOTA_EXCEEDED");
  assert.equal((await service.runDemo(b.token,{objective:"Prepare a bounded SEO audit."})).status,200);
});

test("rate limit fails closed without leaking another session", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-a","token-b"),
    limits:{ max_requests_per_window:1, max_demo_missions:5 },
  });
  const a = service.createSession();
  const b = service.createSession();

  assert.equal((await service.runDemo(a.token,{objective:"SEO audit."})).status,200);
  const limited = await service.runDemo(a.token,{objective:"SEO audit two."});
  assert.equal(limited.status,429);
  assert.equal(limited.body.error_code,"SESSION_RATE_LIMITED");
  assert.equal((await service.runDemo(b.token,{objective:"SEO audit."})).status,200);
});

test("live unavailable is explicit and offers deterministic demo fallback", async () => {
  const service = createPublicDemoService({ now:() => fixedNow, token_factory:tokenFactory("token-a") });
  const session = service.createSession();
  const result = await service.runLive(session.token,{objective:"Review this request safely."});

  assert.equal(result.status,503);
  assert.equal(result.body.experience,"LIVE");
  assert.equal(result.body.live,false);
  assert.equal(result.body.state,"LIVE_UNAVAILABLE");
  assert.equal(result.body.truth_label,"NOT_LIVE");
  assert.deepEqual(result.body.fallback,{ experience:"DEMO", endpoint:"/api/public/demo" });
});

test("one anonymous session cannot run two live missions concurrently", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-a"),
    live_runner:async ({ plan }) => { await gate; return safeLiveResult(plan); },
  });
  const session = service.createSession();
  const first = service.runLive(session.token,{objective:"Handle xyzzy frobnicator."});
  await new Promise((resolve) => setImmediate(resolve));
  const second = await service.runLive(session.token,{objective:"Handle another frobnicator."});
  assert.equal(second.status,409);
  assert.equal(second.body.error_code,"SESSION_MISSION_ACTIVE");
  release();
  assert.equal((await first).status,200);
});

test("live success is labeled LIVE only with passing sandbox and teardown evidence", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-a"),
    live_runner:async ({ plan }) => safeLiveResult(plan),
  });
  const session = service.createSession();
  const result = await service.runLive(session.token,{objective:"Handle xyzzy frobnicator."});

  assert.equal(result.status,200);
  assert.equal(result.body.experience,"LIVE");
  assert.equal(result.body.truth_label,"LIVE_RUNTIME");
  assert.equal(result.body.live,true);
  assert.equal(result.body.session.active_mission,null);
  assert.equal(result.body.sandbox.status,"PASS");
  assert.equal(result.body.sandbox.quota_status,"PASS");
  assert.equal(result.body.sandbox.teardown_verified,true);
  assert.equal(result.body.telemetry.execution.state,"SUCCEEDED");
  assert.equal(result.body.telemetry.execution.terminal,true);
  assert.equal(result.body.telemetry.execution.state_source,"EXECUTION_ATTEMPT_V1");
  assert.equal(result.body.telemetry.employee.employee_id,result.body.presentation.task_nodes.find((node)=>node.truth_label==="LIVE_RUNTIME").employee_id);
  assert.equal(result.body.telemetry.model.model_id,"fixture-model");
  assert.equal(result.body.telemetry.runtime.provider,"fixture-runtime");
  assert.equal(result.body.telemetry.usage.input_tokens,100);
  assert.equal(result.body.telemetry.usage.output_tokens,50);
  assert.equal(result.body.telemetry.usage.total_tokens,150);
  assert.equal(result.body.telemetry.usage.cost.amount_usd,0.01);
  assert.ok(result.body.telemetry.evidence_refs.includes("evidence:fixture"));
  assert.match(result.body.telemetry.receipt_ref,/^receipt:sha256:/);
  assert.equal(result.body.telemetry.traceability.sandbox_record_ref,result.body.sandbox.sandbox_record_ref);
  const executed = result.body.presentation.task_nodes.filter((node) => node.truth_label === "LIVE_RUNTIME");
  const planned = result.body.presentation.task_nodes.filter((node) => node.truth_label === "LIVE_PLANNED");
  assert.equal(executed.length,1);
  assert.equal(executed[0].task_id,result.body.presentation.executed_task_id);
  assert.equal(executed.length + planned.length,result.body.presentation.task_nodes.length);
});

test("unsafe or unverifiable live runner output never becomes a live success", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-a"),
    live_runner:async ({ plan }) => {
      const result = safeLiveResult(plan);
      return { ...result, record:{ ...result.record, teardown_verified:false } };
    },
  });
  const session = service.createSession();
  const result = await service.runLive(session.token,{objective:"Handle xyzzy frobnicator."});

  assert.equal(result.status,502);
  assert.equal(result.body.live,false);
  assert.equal(result.body.state,"LIVE_VERIFICATION_FAILED");
  assert.equal(result.body.truth_label,"NOT_LIVE");
  assert.deepEqual(result.body.fallback,{ experience:"DEMO", endpoint:"/api/public/demo" });
});

test("objective input is bounded and invalid session tokens fail closed", async () => {
  const service = createPublicDemoService({ now:() => fixedNow, token_factory:tokenFactory("token-a") });
  const session = service.createSession();

  const missing = await service.runDemo("not-a-session",{objective:"SEO audit."});
  assert.equal(missing.status,401);
  assert.equal(missing.body.error_code,"ANONYMOUS_SESSION_REQUIRED");

  const tooLong = await service.runDemo(session.token,{objective:"x".repeat(PUBLIC_DEMO_DEFAULT_LIMITS.max_objective_chars+1)});
  assert.equal(tooLong.status,400);
  assert.equal(tooLong.body.error_code,"OBJECTIVE_TOO_LONG");
});

test("max session capacity evicts the oldest disposable session before admitting another", async () => {
  let current = fixedNow;
  const service = createPublicDemoService({
    now:() => current++,
    token_factory:tokenFactory("token-a","token-b","token-c"),
    limits:{ max_sessions:2, max_requests_per_window:10 },
  });
  const a = service.createSession();
  const b = service.createSession();
  const c = service.createSession();

  const oldest = await service.runDemo(a.token,{objective:"SEO audit."});
  assert.equal(oldest.status,401);
  assert.equal(oldest.body.error_code,"ANONYMOUS_SESSION_REQUIRED");
  assert.equal((await service.runDemo(b.token,{objective:"SEO audit."})).status,200);
  assert.equal((await service.runDemo(c.token,{objective:"SEO audit."})).status,200);
});


test("live success without canonical Attempt traceability fails closed", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-a"),
    live_runner:async ({ plan }) => {
      const result = safeLiveResult(plan);
      const { attempt, task_node, admission, ...incomplete } = result;
      return incomplete;
    },
  });
  const session = service.createSession();
  const result = await service.runLive(session.token,{objective:"Handle xyzzy frobnicator."});
  assert.equal(result.status,502);
  assert.equal(result.body.live,false);
  assert.equal(result.body.state,"LIVE_VERIFICATION_FAILED");
  assert.equal(result.body.truth_label,"NOT_LIVE");
});


test("public live telemetry redacts private machine references before browser exposure", async () => {
  const privateRuntime = "C:\\Users\\User\\private\\runtime";
  const privateEvidence = "D:\\Private\\evidence.json";
  const privateArtifact = "/home/user/private/report.json";
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-redaction"),
    live_runner:async ({ plan }) => safeLiveResult(plan, {
      runtime_ref:privateRuntime,
      evidence_ref:privateEvidence,
      artifact_ref:privateArtifact,
    }),
  });
  const session = service.createSession();
  const result = await service.runLive(session.token,{objective:"Handle xyzzy frobnicator."});
  assert.equal(result.status,200);
  assert.equal(result.body.telemetry.runtime.runtime_ref,"REDACTED_PRIVATE_REF");
  assert.deepEqual(result.body.telemetry.evidence_refs,["REDACTED_PRIVATE_REF"]);
  assert.deepEqual(result.body.telemetry.artifact_refs,["REDACTED_PRIVATE_REF"]);
  const serialized = JSON.stringify(result.body);
  assert.equal(serialized.includes("C:\\\\Users"),false);
  assert.equal(serialized.includes("D:\\\\Private"),false);
  assert.equal(serialized.includes("/home/user/private"),false);
});


async function reviewForLive(live, { observed_value="SUCCEEDED" } = {}) {
  const sourceRef = live.attempt.artifact_refs[0] || "artifact:verification-source";
  const fact = "attempt="+live.attempt.attempt_id;
  return runSitiVerification({
    task_node:live.task_node,
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:{
      expected:{
        required_facts:[fact],
        required_artifacts:[sourceRef],
        required_completion_items:["runtime-succeeded"],
        required_evidence_refs:[sourceRef],
      },
      report:{text:"Independent "+fact,claimed_executed:false},
      evidence:{
        observed_text:"Observed "+fact,
        refs:[sourceRef],
        artifacts:[sourceRef],
        completion_items:["runtime-succeeded"],
        checked_at:"2026-10-01T12:00:01.000Z",
      },
    },
    research:{claims:[{
      claim_id:"runtime-state",
      statement:"Runtime attempt succeeded.",
      source_ref:sourceRef,
      source_exists:true,
      source_relevant:true,
      source_current:true,
      expected_value:"SUCCEEDED",
      observed_value,
      expected_unit:"state",
      observed_unit:"state",
    }]},
    now:new Date("2026-10-01T12:00:02.000Z"),
  });
}

test("public live response exposes canonical independent verification when provided", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-verify-pass"),
    live_runner:async ({plan}) => {
      const live=safeLiveResult(plan,{artifact_ref:"artifact:verification-source"});
      return {...live,verification:await reviewForLive(live)};
    },
  });
  const session=service.createSession();
  const result=await service.runLive(session.token,{objective:"Handle xyzzy frobnicator."});

  assert.equal(result.status,200);
  assert.equal(result.body.live,true);
  assert.equal(result.body.verification.review_state,"PASS");
  assert.equal(result.body.verification.decision,"VERIFIED");
  assert.equal(result.body.verification.verifier_id,"siti");
  assert.equal(result.body.verification.independent,true);
  assert.match(result.body.verification.verification_ref,/^verification:sha256:/);
  assert.deepEqual(result.body.verification.contradictions,[]);
});

test("public live response keeps independent verification contradictions visible", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-verify-fail"),
    live_runner:async ({plan}) => {
      const live=safeLiveResult(plan,{artifact_ref:"artifact:verification-source"});
      return {...live,verification:await reviewForLive(live,{observed_value:"FAILED"})};
    },
  });
  const session=service.createSession();
  const result=await service.runLive(session.token,{objective:"Handle xyzzy frobnicator."});

  assert.equal(result.status,200);
  assert.equal(result.body.truth_label,"LIVE_RUNTIME");
  assert.equal(result.body.verification.review_state,"FAIL");
  assert.equal(result.body.verification.decision,"NOT_VERIFIED");
  assert.ok(result.body.verification.contradictions.some((item)=>item.code==="VALUE_MISMATCH"));
});

test("tampered independent verification sidecar fails live response closed", async () => {
  const service = createPublicDemoService({
    now:() => fixedNow,
    token_factory:tokenFactory("token-verify-tampered"),
    live_runner:async ({plan}) => {
      const live=safeLiveResult(plan,{artifact_ref:"artifact:verification-source"});
      const review=await reviewForLive(live);
      return {...live,verification:{...review,review_state:"FAIL",decision:"NOT_VERIFIED"}};
    },
  });
  const session=service.createSession();
  const result=await service.runLive(session.token,{objective:"Handle xyzzy frobnicator."});

  assert.equal(result.status,502);
  assert.equal(result.body.live,false);
  assert.equal(result.body.state,"LIVE_VERIFICATION_FAILED");
});
