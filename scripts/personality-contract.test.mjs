import test from "node:test";
import assert from "node:assert/strict";
import { WORKFORCE } from "../office/workforce.mjs";

const required = [
  "default_register",
  "opening_behavior",
  "response_shape",
  "sentence_rhythm",
  "question_style",
  "disagreement_style",
  "uncertainty_style",
  "humor_style",
  "closing_behavior",
  "signature_moves",
  "avoid",
];

test("all workers expose a complete dialogue fingerprint", () => {
  assert.ok(WORKFORCE.length >= 16);
  for (const employee of WORKFORCE) {
    const profile = employee.personality?.dialogue_profile;
    assert.ok(profile, `${employee.id} dialogue profile missing`);
    for (const field of required) assert.ok(profile[field], `${employee.id} missing ${field}`);
    assert.ok(profile.signature_moves.length >= 2, `${employee.id} needs signature moves`);
    assert.ok(profile.avoid.length >= 2, `${employee.id} needs avoid rules`);
  }
});

test("the sixteen baseline workers do not share one generic conversation fingerprint", () => {
  const baseline = WORKFORCE.slice(0, 16);
  const fingerprints = baseline.map((employee) => {
    const p = employee.personality.dialogue_profile;
    return JSON.stringify({
      opening: p.opening_behavior,
      shape: p.response_shape,
      questions: p.question_style,
      disagreement: p.disagreement_style,
      closing: p.closing_behavior,
      moves: p.signature_moves,
    });
  });
  assert.equal(new Set(fingerprints).size, baseline.length);
});

test("personality is style, never an authority override", () => {
  for (const employee of WORKFORCE) {
    assert.equal(employee.verification_policy.self_verify, false);
    assert.equal(employee.approval_policy.autonomy, "GUARDED");
  }
});


test("all baseline personalities preserve the same high-impact governance invariants", () => {
  const highImpact=["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"];
  for (const employee of WORKFORCE.slice(0,16)) {
    assert.equal(employee.approval_policy.autonomy,"GUARDED",employee.id);
    assert.equal(employee.approval_policy.delegated_policy_required,true,employee.id);
    assert.equal(employee.verification_policy.independent_required,true,employee.id);
    assert.equal(employee.verification_policy.self_verify,false,employee.id);
    for (const risk of highImpact) {
      assert.ok(employee.approval_policy.requires_approval.includes(risk),`${employee.id} missing approval guard for ${risk}`);
    }
  }
});
