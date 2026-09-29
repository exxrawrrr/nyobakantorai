import test from "node:test";
import assert from "node:assert/strict";
import { EMPLOYEE_PRESETS, findEmployeeSelectionArg, resolveEmployeeSelection } from "./employee-selection.mjs";

const all = ["praroro","paijo","subagjo","alex","sumiati","siti","maya","gugun","ratri","bimo","nara","dina","bambang","fikri","tari","caca"];

test("all/full resolve to the complete canonical workforce", () => {
  assert.deepEqual(resolveEmployeeSelection("all", all), all);
  assert.deepEqual(resolveEmployeeSelection("full", all), all);
});

test("arbitrary employee subsets preserve canonical order and remove duplicates", () => {
  assert.deepEqual(resolveEmployeeSelection("siti,praroro,siti", all), ["praroro","siti"]);
});

test("presets expand without pulling unrelated workers", () => {
  assert.deepEqual(resolveEmployeeSelection("growth", all), EMPLOYEE_PRESETS.growth);
  assert.equal(resolveEmployeeSelection("engineering", all).includes("maya"), false);
});

test("preset and explicit employees can be combined", () => {
  assert.deepEqual(resolveEmployeeSelection("research,bimo", all), ["alex","siti","bimo","fikri"]);
});

test("unknown employee or preset fails closed", () => {
  assert.throws(() => resolveEmployeeSelection("ghost", all), /Unknown employee\/preset/);
});

test("CLI parser accepts both equals and separate-value forms", () => {
  assert.equal(findEmployeeSelectionArg(["--employees=siti,praroro"]), "siti,praroro");
  assert.equal(findEmployeeSelectionArg(["--employees","growth"]), "growth");
  assert.equal(findEmployeeSelectionArg([]), "all");
  assert.throws(() => findEmployeeSelectionArg(["--employees"]), /requires/);
});
