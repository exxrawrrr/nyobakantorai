import test from "node:test";
import assert from "node:assert/strict";
import { planProfileAction, planSelectedProfileActions, USER_OWNED_HERMES_STATE, bootstrapSucceeded } from "./hermes-bootstrap-plan.mjs";
import { EMPLOYEE_IDS } from "../office/workforce.mjs";

const v02 = new Set(["praroro","paijo","subagjo","alex","sumiati","siti"]);

test("v0.2 to v0.3 upgrade updates six existing profiles and installs every missing worker", () => {
  const actions = Object.fromEntries(EMPLOYEE_IDS.map((id) => [id, planProfileAction({ mode:"upgrade", exists:v02.has(id) })]));
  assert.ok(EMPLOYEE_IDS.length >= 16);
  for (const id of v02) assert.equal(actions[id], "native-upgrade");
  assert.equal(Object.values(actions).filter((value) => value === "install").length, EMPLOYEE_IDS.length - v02.size);
});

test("upgrade contract names Hermes user-owned state that must survive distribution upgrades", () => {
  for (const item of [".env","auth.json","memories/","sessions/","state.db*"]) assert.ok(USER_OWNED_HERMES_STATE.includes(item));
});

test("normal install remains conservative for an existing profile", () => {
  assert.equal(planProfileAction({ mode:"install", exists:true }), "skip-existing");
});

test("force remains explicit and separate from safe upgrade", () => {
  assert.equal(planProfileAction({ mode:"upgrade", exists:true, force:true }), "force-install");
});


test("bootstrap fails closed when any install/update action failed even if profiles still exist", () => {
  assert.equal(bootstrapSucceeded({
    results:[{profile:"praroro",ok:false}],
    profiles:[{id:"praroro",ok:true}],
    boardOk:true,
    mode:"upgrade",
  }), false);
});

test("bootstrap succeeds only when actions, profiles, and board are all ready", () => {
  assert.equal(bootstrapSucceeded({
    results:[{profile:"praroro",ok:true},{profile:"maya",ok:true}],
    profiles:[{id:"praroro",ok:true},{id:"maya",ok:true}],
    boardOk:true,
    mode:"upgrade",
  }), true);
});


test("selected upgrade plan never includes unselected profiles", () => {
  const actions = planSelectedProfileActions({
    selectedIds:["praroro","siti"],
    existingIds:["praroro","siti","maya","gugun"],
    mode:"upgrade",
  });
  assert.deepEqual(actions,[
    {profile:"praroro",action:"native-upgrade"},
    {profile:"siti",action:"native-upgrade"},
  ]);
  assert.equal(actions.some((item)=>item.profile==="maya" || item.profile==="gugun"),false);
});

test("selected install plan is deterministic and deduplicates repeated IDs", () => {
  const actions = planSelectedProfileActions({
    selectedIds:["siti","praroro","siti"],
    existingIds:["praroro"],
    mode:"install",
  });
  assert.deepEqual(actions,[
    {profile:"siti",action:"install"},
    {profile:"praroro",action:"skip-existing"},
  ]);
});
