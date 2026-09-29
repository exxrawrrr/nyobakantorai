import test from "node:test";
import assert from "node:assert/strict";
import { planSelectedProfileRemoval, removalSucceeded } from "./hermes-remove-selected.mjs";

test("removal defaults to preview-only even for a valid subset", () => {
  const plan = planSelectedProfileRemoval({ selection:"praroro,siti" });
  assert.equal(plan.action,"PREVIEW_ONLY");
  assert.equal(plan.confirmed,false);
  assert.deepEqual(plan.profiles,["praroro","siti"]);
});

test("destructive removal requires explicit user-state confirmation", () => {
  const plan = planSelectedProfileRemoval({ selection:"siti", confirmDeleteUserState:true });
  assert.equal(plan.action,"DELETE_PROFILE_AND_USER_STATE");
  assert.equal(plan.confirmed,true);
});

test("removal selection never expands to unrelated profiles", () => {
  const plan = planSelectedProfileRemoval({ selection:"praroro,siti", confirmDeleteUserState:true });
  assert.equal(plan.profiles.includes("maya"),false);
  assert.equal(plan.profiles.includes("gugun"),false);
});

test("removal verification fails closed if any selected profile still exists", () => {
  assert.equal(removalSucceeded({
    results:[{profile:"siti",ok:true}],
    verification:[{id:"siti",exists:true}],
  }),false);
});

test("removal verification accepts already-absent selected profiles", () => {
  assert.equal(removalSucceeded({
    results:[{profile:"siti",action:"already-absent",ok:true}],
    verification:[{id:"siti",exists:false}],
  }),true);
});
