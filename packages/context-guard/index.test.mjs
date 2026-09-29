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
  assert.match(packet.l0, /Protected atoms/);
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
