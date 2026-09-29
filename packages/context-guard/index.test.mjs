import test from "node:test";
import assert from "node:assert/strict";
import { compileGuardPacket, estimateTokens, extractProtectedAtoms, verifyProtectedAtoms } from "./index.mjs";

const sample = `Target publish 26 September 2026 pukul 13:30 WIB.
Budget Rp1.500.000 dan toleransi 3.7%.
Gunakan https://example.com/source dan file D:\\WORK\\brief.md.
Harus pertahankan angka persis.
Jangan publish sebelum approval owner.`;

test("protected atom extraction preserves high-risk exact details", () => {
  const atoms = extractProtectedAtoms(sample);
  assert.ok(atoms.dates.includes("26 September 2026"));
  assert.ok(atoms.times.includes("13:30 WIB"));
  assert.ok(atoms.amounts.includes("Rp1.500.000"));
  assert.ok(atoms.percentages.includes("3.7%"));
  assert.ok(atoms.urls.includes("https://example.com/source"));
  assert.deepEqual(atoms.windows_paths, ["D:\\WORK\\brief.md"]);
  assert.ok(atoms.constraints.some((value) => value.startsWith("Harus")));
  assert.ok(atoms.constraints.some((value) => value.startsWith("Jangan")));
});

test("guard packet preserves the original source as L2 and exposes a compact L0", () => {
  const packet = compileGuardPacket({
    objective: "Siapkan brief tanpa mengubah constraint.",
    sources: [{ id:"owner-request", type:"chat", text:sample }],
    targetTokens: 250,
  });
  assert.match(packet.l0, /^P:/m);
  assert.match(packet.l1, /Source pointers/);
  assert.match(packet.l1, /26 September 2026/);
  assert.match(packet.l2, /26 September 2026/);
  assert.match(packet.l2, /Rp1\.500\.000/);
  assert.equal(packet.token_budget.target, 250);
  assert.ok(packet.token_budget.original_estimate > 0);
});

test("fidelity gate fails when a compiled brief drops an exact protected atom", () => {
  const bad = "Target publish 26 September 2026. Harus pertahankan angka persis. Jangan publish sebelum approval owner.";
  const result = verifyProtectedAtoms({ original:sample, compiled:bad });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("Rp1.500.000"));
  assert.ok(result.recall < 1);
});

test("fidelity gate passes when all protected atoms survive", () => {
  const packet = compileGuardPacket({ sources:[{id:"x",text:sample}] });
  const result = verifyProtectedAtoms({ original:sample, compiled:packet.l0 + "\n" + packet.l2 });
  assert.equal(result.ok, true);
  assert.equal(result.recall, 1);
});

test("token estimator is explicitly approximate and deterministic", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("12345678"), 2);
  assert.equal(estimateTokens("12345678"), estimateTokens("12345678"));
});


test("Windows path and URL extraction does not swallow sentence tails", () => {
  const text = "Source D:\\WORK\\service\\config.json. Health http://127.0.0.1:4322. Date 2026-09-29.";
  const atoms = extractProtectedAtoms(text);
  assert.ok(atoms.windows_paths.includes("D:\\WORK\\service\\config.json"));
  assert.equal(atoms.windows_paths.some((value) => value.includes("Health")), false);
  assert.ok(atoms.urls.includes("http://127.0.0.1:4322"));
  assert.equal(atoms.urls.some((value) => value.endsWith(".")), false);
});


test("L1 and execution brief include supplied semantic fields without inventing missing ones", () => {
  const packet = compileGuardPacket({
    objective:"Prepare approval brief.",
    sources:[{id:"owner-request",type:"chat",text:sample}],
    working:{
      owner:"maya",
      background:["Campaign is in review."],
      decisions:["Keep budget unchanged."],
      dependencies:["Owner approval."],
      requested_actions:["Prepare change proposal."],
      prohibited_actions:["Do not publish."],
      expected_artifacts:["Approval brief."],
      acceptance_criteria:["Exact budget and date preserved."],
      verification:["Independent read-back after any approved mutation."],
      risk_classes:["PAID_ACTION"],
      open_questions:["Which creative variant?"],
      next_action:"Send draft for owner approval.",
    },
  });
  assert.equal(packet.execution_brief.owner,"maya");
  assert.ok(packet.execution_brief.must_preserve.includes("Rp1.500.000"));
  assert.ok(packet.execution_brief.prohibited_actions.some((value)=>/Jangan publish/.test(value)));
  assert.ok(packet.execution_brief.prohibited_actions.includes("Do not publish."));
  assert.match(packet.l1,/Campaign is in review/);
  assert.match(packet.l1,/Owner approval/);
  assert.match(packet.l1,/Which creative variant/);
  assert.ok(packet.token_budget.l1_estimate > 0);
  assert.equal(packet.execution_brief.token_budget, packet.token_budget);
});

test("L1 stays source-traceable when semantic working fields are absent", () => {
  const packet = compileGuardPacket({
    objective:"Preserve source truth.",
    sources:[{id:"source-a",type:"chat",text:sample}],
  });
  assert.deepEqual(packet.execution_brief.requested_actions,[]);
  assert.deepEqual(packet.execution_brief.open_questions,[]);
  assert.match(packet.l1,/source-a \(chat\)/);
  assert.match(packet.l1,/Rp1\.500\.000/);
  assert.doesNotMatch(packet.l1,/invented background/i);
});
