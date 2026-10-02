import test from "node:test";
import assert from "node:assert/strict";
import { runSitiVerification, SITI_VERIFICATION_API } from "./siti.mjs";

const now = new Date("2026-10-02T01:30:00.000Z");

function task(employee_id="alex") {
  return {
    schema:1,
    task_id:"task-chat10-001",
    mission_id:"mission-chat10-001",
    title:"Verify mission output",
    objective:"Verify the output independently.",
    employee_id,
    risk_class:"READ_ONLY",
    state:"SUCCEEDED",
    approval:{required:false,status:"NOT_REQUIRED",approval_ref:null},
    attempt_ids:["attempt-chat10-001"],
    evidence_refs:["artifact:result"],
    receipt_refs:[],
    blocking:null,
    legacy:null,
    created_at:"2026-10-02T01:00:00.000Z",
    updated_at:"2026-10-02T01:10:00.000Z",
  };
}

function packet(overrides={}) {
  return {
    expected:{
      required_facts:["claim-value-42"],
      required_artifacts:["artifact:result"],
      required_completion_items:["work-complete"],
      required_evidence_refs:["https://example.test/source"],
      ...overrides.expected,
    },
    report:{
      text:"Result contains claim-value-42.",
      claimed_verified:true,
      claimed_executed:false,
      ...overrides.report,
    },
    evidence:{
      observed_text:"Independent evidence contains claim-value-42.",
      refs:["https://example.test/source"],
      artifacts:["artifact:result"],
      completion_items:["work-complete"],
      checked_at:"2026-10-02T01:25:00.000Z",
      ...overrides.evidence,
    },
  };
}

function research(overrides={}) {
  return {
    claims:[{
      claim_id:"claim-1",
      statement:"Metric is 42 ms.",
      source_ref:"https://example.test/source",
      source_exists:true,
      source_relevant:true,
      source_current:true,
      expected_value:"42",
      observed_value:"42",
      expected_unit:"ms",
      observed_unit:"ms",
      ...overrides,
    }],
  };
}

test("research PASS transitions SUCCEEDED task to VERIFIED with Siti evidence", async () => {
  const result = await runSitiVerification({
    task_node:task(),
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:packet(),
    research:research(),
    now,
  });

  assert.equal(result.api,SITI_VERIFICATION_API);
  assert.equal(result.review_state,"PASS");
  assert.equal(result.decision,"VERIFIED");
  assert.equal(result.verifier_id,"siti");
  assert.equal(result.independent,true);
  assert.equal(result.claim_checks[0].verdict,"SUPPORTED");
  assert.deepEqual(result.contradictions,[]);
  assert.deepEqual(result.unknowns,[]);
  assert.match(result.verification_ref,/^verification:sha256:[a-f0-9]{64}$/);
  assert.equal(result.task_node.state,"VERIFIED");
  assert.ok(result.task_node.evidence_refs.includes(result.verification_ref));
});

test("research contradiction stays visible and cannot become VERIFIED", async () => {
  const result = await runSitiVerification({
    task_node:task(),
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:packet(),
    research:research({observed_value:"41"}),
    now,
  });

  assert.equal(result.review_state,"FAIL");
  assert.equal(result.decision,"NOT_VERIFIED");
  assert.equal(result.claim_checks[0].verdict,"CONTRADICTED");
  assert.ok(result.contradictions.some((item)=>item.code==="VALUE_MISMATCH"));
  assert.equal(result.task_node.state,"SUCCEEDED");
});

test("missing or weak research source remains NOT_VERIFIED and INCOMPLETE", async () => {
  const result = await runSitiVerification({
    task_node:task(),
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:packet(),
    research:research({source_current:false}),
    now,
  });

  assert.equal(result.review_state,"INCOMPLETE");
  assert.equal(result.claim_checks[0].verdict,"NOT_VERIFIED");
  assert.ok(result.unknowns.some((item)=>item.code==="SOURCE_NOT_CURRENT"));
  assert.equal(result.task_node.state,"SUCCEEDED");
});

test("code PASS requires changed-file inspection, tests, regression, negative checks and fix evidence", async () => {
  const result = await runSitiVerification({
    task_node:task("subagjo"),
    verifier_id:"siti",
    kind:"CODE",
    evidence_packet:packet(),
    code:{
      changed_files:["packages/x.mjs"],
      inspected_files:["packages/x.mjs"],
      tests:[{id:"unit",status:"PASS",evidence_refs:["test:unit"]}],
      regression_checks:[{id:"regression",status:"PASS",evidence_refs:["test:regression"]}],
      negative_checks:[{id:"negative",status:"PASS",evidence_refs:["test:negative"]}],
      fix_claims:[{claim_id:"fix-1",evidence_refs:["test:unit","test:regression"]}],
      remaining_unknowns:[],
    },
    now,
  });

  assert.equal(result.review_state,"PASS");
  assert.equal(result.decision,"VERIFIED");
  assert.equal(result.task_node.state,"VERIFIED");
  assert.deepEqual(result.contradictions,[]);
  assert.deepEqual(result.unknowns,[]);
});

test("code regression failure is a contradiction and blocks VERIFIED", async () => {
  const result = await runSitiVerification({
    task_node:task("subagjo"),
    verifier_id:"siti",
    kind:"CODE",
    evidence_packet:packet(),
    code:{
      changed_files:["packages/x.mjs"],
      inspected_files:["packages/x.mjs"],
      tests:[{id:"unit",status:"PASS",evidence_refs:["test:unit"]}],
      regression_checks:[{id:"regression",status:"FAIL",evidence_refs:["test:regression"]}],
      negative_checks:[{id:"negative",status:"PASS",evidence_refs:["test:negative"]}],
      fix_claims:[{claim_id:"fix-1",evidence_refs:["test:unit"]}],
      remaining_unknowns:[],
    },
    now,
  });

  assert.equal(result.review_state,"FAIL");
  assert.ok(result.contradictions.some((item)=>item.code==="REGRESSION_CHECK_FAILED"));
  assert.equal(result.task_node.state,"SUCCEEDED");
});

test("external state without a verifier hook remains INCOMPLETE", async () => {
  const result = await runSitiVerification({
    task_node:task(),
    verifier_id:"siti",
    kind:"EXTERNAL_STATE",
    evidence_packet:packet(),
    external_state:{target_ref:"resource:demo",expected_state:"ACTIVE"},
    now,
  });

  assert.equal(result.review_state,"INCOMPLETE");
  assert.equal(result.decision,"NOT_VERIFIED");
  assert.ok(result.unknowns.some((item)=>item.code==="EXTERNAL_STATE_CHECK_UNAVAILABLE"));
  assert.equal(result.task_node.state,"SUCCEEDED");
});

test("read-only external state hook can independently support VERIFIED", async () => {
  let calls=0;
  const result = await runSitiVerification({
    task_node:task(),
    verifier_id:"siti",
    kind:"EXTERNAL_STATE",
    evidence_packet:packet(),
    external_state:{target_ref:"resource:demo",expected_state:"ACTIVE"},
    external_state_check:async (request) => {
      calls += 1;
      assert.equal(Object.isFrozen(request),true);
      return {
        status:"MATCH",
        observed_state:"ACTIVE",
        evidence_refs:["runtime:readback/demo"],
        checked_at:"2026-10-02T01:26:00.000Z",
        read_only:true,
      };
    },
    now,
  });

  assert.equal(calls,1);
  assert.equal(result.review_state,"PASS");
  assert.equal(result.external_state.status,"MATCH");
  assert.deepEqual(result.external_state.evidence_refs,["runtime:readback/demo"]);
  assert.equal(result.task_node.state,"VERIFIED");
});

test("contradicted external state remains visible and blocks VERIFIED", async () => {
  const result = await runSitiVerification({
    task_node:task(),
    verifier_id:"siti",
    kind:"EXTERNAL_STATE",
    evidence_packet:packet(),
    external_state:{target_ref:"resource:demo",expected_state:"ACTIVE"},
    external_state_check:async () => ({
      status:"CONTRADICTED",
      observed_state:"DISABLED",
      evidence_refs:["runtime:readback/demo"],
      checked_at:"2026-10-02T01:26:00.000Z",
      read_only:true,
    }),
    now,
  });

  assert.equal(result.review_state,"FAIL");
  assert.ok(result.contradictions.some((item)=>item.code==="EXTERNAL_STATE_CONTRADICTED"));
  assert.equal(result.task_node.state,"SUCCEEDED");
});

test("Siti cannot verify her own production task and unauthorized verifier fails closed", async () => {
  const self = await runSitiVerification({
    task_node:task("siti"),
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:packet(),
    research:research(),
    now,
  });
  assert.equal(self.review_state,"FAIL");
  assert.equal(self.independent,false);
  assert.ok(self.contradictions.some((item)=>item.code==="SELF_VERIFICATION"));
  assert.equal(self.task_node.state,"SUCCEEDED");

  const unauthorized = await runSitiVerification({
    task_node:task("alex"),
    verifier_id:"subagjo",
    kind:"RESEARCH",
    evidence_packet:packet(),
    research:research(),
    now,
  });
  assert.equal(unauthorized.review_state,"FAIL");
  assert.equal(unauthorized.independent,false);
  assert.ok(unauthorized.contradictions.some((item)=>item.code==="UNAUTHORIZED_VERIFIER"));
  assert.equal(unauthorized.task_node.state,"SUCCEEDED");
});

test("missing required evidence is INCOMPLETE rather than softened into PASS", async () => {
  const weak = packet();
  weak.evidence.refs=[];
  const result = await runSitiVerification({
    task_node:task(),
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:weak,
    research:research(),
    now,
  });

  assert.equal(result.review_state,"INCOMPLETE");
  assert.equal(result.decision,"NOT_VERIFIED");
  assert.ok(result.unknowns.some((item)=>item.code==="MISSING_REQUIRED_EVIDENCE"));
  assert.equal(result.task_node.state,"SUCCEEDED");
});


test("verification record ref detects tampering before reuse", async () => {
  const { validateSitiVerificationRecord } = await import("./siti.mjs");
  const result = await runSitiVerification({
    task_node:task(),
    verifier_id:"siti",
    kind:"RESEARCH",
    evidence_packet:packet(),
    research:research(),
    now,
  });
  assert.equal(validateSitiVerificationRecord(result),true);

  const tampered = {
    ...result,
    review_state:"FAIL",
    decision:"NOT_VERIFIED",
  };
  assert.throws(()=>validateSitiVerificationRecord(tampered),/verification ref|content/i);
});


test("external state hook receives the actual authorized reviewer identity", async () => {
  let observedVerifier=null;
  const result = await runSitiVerification({
    task_node:task("siti"),
    verifier_id:"subagjo",
    kind:"EXTERNAL_STATE",
    evidence_packet:packet(),
    external_state:{target_ref:"resource:demo",expected_state:"ACTIVE"},
    external_state_check:async (request) => {
      observedVerifier=request.verifier_id;
      return {
        status:"MATCH",
        observed_state:"ACTIVE",
        evidence_refs:["runtime:readback/demo"],
        checked_at:"2026-10-02T01:26:00.000Z",
        read_only:true,
      };
    },
    now,
  });
  assert.equal(observedVerifier,"subagjo");
  assert.equal(result.review_state,"PASS");
  assert.equal(result.task_node.state,"VERIFIED");
});
