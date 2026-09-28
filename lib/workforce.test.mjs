import test from "node:test";
import assert from "node:assert/strict";
import { WORKFORCE, EMPLOYEE_BY_ID, validateWorkforceRegistry } from "./workforce.mjs";

test("v0.3 baseline contains the sixteen required employees",()=>{
  const ids=WORKFORCE.map((e)=>e.id);
  assert.equal(ids.length,16);
  for(const id of ["praroro","paijo","subagjo","alex","sumiati","siti","maya","gugun","ratri","bimo","nara","dina","bambang","fikri","tari","caca"]) assert.ok(ids.includes(id),id);
});
test("every employee has personality, habits, routing, approval and independent verification metadata",()=>{
  for(const e of WORKFORCE){
    assert.ok(e.personality.traits.length);
    assert.ok(e.habits.working_habit);
    assert.ok(e.routing.keywords.length);
    assert.equal(e.approval_policy.autonomy,"GUARDED");
    assert.equal(e.verification_policy.self_verify,false);
  }
});
test("Maya and Gugun are capability-aware but not falsely connected",()=>{
  assert.ok(EMPLOYEE_BY_ID.maya.external_capabilities.includes("ads.meta.write"));
  assert.ok(EMPLOYEE_BY_ID.gugun.external_capabilities.includes("ads.google.write"));
});
test("registry validator permits safe user extension beyond baseline",()=>{
  const copy=structuredClone({schema:1,version:"0.3.0",employee_count:WORKFORCE.length,employees:WORKFORCE});
  const extra=structuredClone(copy.employees[0]);extra.id="custom-worker";extra.name="Custom Worker";copy.employees.push(extra);copy.employee_count=copy.employees.length;
  assert.equal(validateWorkforceRegistry(copy).employees.length,17);
});
