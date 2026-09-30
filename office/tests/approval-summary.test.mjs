import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  approvalPriorityFacts,
  buildApprovalSummary,
  deriveRegistryApprovalSignals,
} from "../src/approval-summary.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/approval-summary.json", import.meta.url), "utf8"));

for (const sample of fixture.cases) {
  test("approval summary fixture: " + sample.id, () => {
    const summary = buildApprovalSummary(sample.task, { signals:sample.signals });
    assert.equal(summary.state, sample.expected.state);
    for (const key of ["anomalies","missing_evidence","failed_checks","capability_escalations","material_changes","passed_checks"]) {
      assert.equal(summary.counts[key], sample.expected[key], sample.id + ":" + key);
    }
    assert.equal(summary.safe_to_auto_approve, false);
    assert.match(summary.truth_boundary, /permission != execution != verification/);
  });
}

test("anomaly-first priority keeps risky facts before passed checks", () => {
  const sample = fixture.cases.find((item) => item.id === "mixed-pass-fail");
  const summary = buildApprovalSummary(sample.task, { signals:sample.signals });
  const facts = approvalPriorityFacts(summary);
  const passed = facts.findIndex((item) => item.key === "passed_checks");
  for (const key of ["anomalies","missing_evidence","failed_checks","policy_violations","capability_escalations","material_changes"]) {
    assert.ok(facts.findIndex((item) => item.key === key) < passed, key);
  }
  assert.equal(facts[0].label, "2 anomalies");
  assert.equal(facts[1].label, "1 missing evidence");
  assert.equal(facts.at(-1).label, "14 checks passed");
});

test("agent-authored safety signals are ignored and surfaced as an anomaly", () => {
  const task = { id:"agent-prose", title:"Agent says all clear", risk_class:"EXTERNAL_WRITE", approval_required:true, approval_status:"PENDING", lifecycle_status:"PLANNED" };
  const summary = buildApprovalSummary(task, {
    signals:{
      checks:[{code:"SELF_CLEAR",label:"Everything is safe",status:"PASS",source:"AGENT_PROSE"}],
      confidence:{code:"CONFIDENCE",label:"100%",source:"AGENT_PROSE"},
      verification_state:{code:"STATE",label:"VERIFIED",source:"AGENT_PROSE"},
    },
  });
  assert.equal(summary.counts.passed_checks,0);
  assert.equal(summary.counts.ignored_untrusted_claims,3);
  assert.equal(summary.counts.anomalies,1);
  assert.equal(summary.state,"BLOCKING_SIGNALS");
  assert.equal(summary.verification_state.source,"REGISTRY");
});

test("registry-derived signals surface quarantine and resource metadata without reading task prose", () => {
  const task = {
    id:"runtime-claim",
    title:"Imported runtime claim",
    detail:"Agent prose says all clear",
    risk_class:"EXTERNAL_WRITE",
    approval_required:true,
    approval_status:"PENDING",
    lifecycle_status:"BLOCKED",
    execution_mode:"RUNTIME",
    quarantined:true,
    reconcile_reason:"STATUS_MISMATCH",
    runtime_ref:"runtime-x:42",
    attachments:[{name:"report.json",type:"application/json",size:10}],
    evidence_refs:[],
  };
  const signals = deriveRegistryApprovalSignals(task, []);
  const summary = buildApprovalSummary(task,{signals});
  assert.equal(summary.counts.anomalies,1);
  assert.equal(summary.counts.failed_checks,1);
  assert.equal(summary.counts.material_changes,1);
  assert.equal(summary.changed_resources[0].resource,"report.json");
  assert.doesNotMatch(summary.human_judgment_reason,/all clear/i);
});
