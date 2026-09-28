import test from "node:test";
import assert from "node:assert/strict";
import { planProfileAction, USER_OWNED_HERMES_STATE } from "./hermes-bootstrap-plan.mjs";
import { EMPLOYEE_IDS } from "../office/workforce.mjs";
const v02 = new Set(["praroro","paijo","subagjo","alex","sumiati","siti"]);

test("v0.2 to v0.3 upgrade natively updates six existing profiles and installs ten new profiles", () => {
  const actions=Object.fromEntries(EMPLOYEE_IDS.map((id)=>[id,planProfileAction({mode:"upgrade",exists:v02.has(id)})]));
  assert.equal(EMPLOYEE_IDS.length,16);
  for(const id of v02)assert.equal(actions[id],"native-upgrade");
  assert.equal(Object.values(actions).filter((x)=>x==="install").length,10);
});
test("upgrade contract names Hermes user-owned state that must survive distribution upgrades",()=>{for(const item of [".env","auth.json","memories/","sessions/","state.db*"])assert.ok(USER_OWNED_HERMES_STATE.includes(item));});
test("normal install remains conservative for an existing profile",()=>assert.equal(planProfileAction({mode:"install",exists:true}),"skip-existing"));
test("force remains explicit and separate from safe upgrade",()=>assert.equal(planProfileAction({mode:"upgrade",exists:true,force:true}),"force-install"));
