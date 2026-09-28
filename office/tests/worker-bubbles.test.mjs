import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EMPLOYEE_DESKS, WORKER_NAMES, shortWords, selectWorkerTask, makeWorkerCaption } from "../src/worker-bubbles.mjs";
test("six desk bubbles match the six canonical employees",()=>{
  assert.equal(Object.keys(EMPLOYEE_DESKS).length,6);
  assert.deepEqual(Object.keys(EMPLOYEE_DESKS),Object.keys(WORKER_NAMES));
});
test("every preview is at most six words",()=>{
  const sample="PUBLIC SANDBOX TEST: Analyze a fictional campaign click-through rate.";
  const result="The calculation is five percent with clear source-backed assumptions.";
  for(const id of Object.keys(EMPLOYEE_DESKS)){
    for(const state of ["QUEUED","RUNNING","RESULT_READY","FAILED","INTERRUPTED"]){
      const caption=makeWorkerCaption({state,prompt:sample,result},id);
      assert.ok(caption.trim().split(/\s+/).length<=6, id+" "+state+" "+caption);
    }
    assert.ok(makeWorkerCaption(null,id,false).trim().split(/\s+/).length<=6);
    assert.ok(makeWorkerCaption(null,id,true).trim().split(/\s+/).length<=6);
  }
});
test("activity bubbles follow actual worker state and do not invent work",()=>{
  assert.match(makeWorkerCaption(null,"alex",true),/Lagi kosong/);
  assert.match(makeWorkerCaption(null,"alex",false),/belum nyala/);
  assert.match(makeWorkerCaption({state:"RUNNING",prompt:"Preparing a public brief for a test"},"alex"),/Lagi merancang/);
  assert.match(makeWorkerCaption({state:"RESULT_READY",result:"Draft is available for owner review"},"alex"),/Beres/);
  assert.match(makeWorkerCaption({state:"FAILED"},"alex"),/kendala/);
  assert.equal(makeWorkerCaption({state:"RESULT_READY",completed_at:"2020-01-01T10:00:00+0700"},"alex"),"Ide strategi terakhir siap dicek");
});
test("most recent active task takes priority without merging official board",()=>{
  const tasks=[{employee:"alex",state:"RESULT_READY",id:"p_one"},{employee:"siti",state:"RUNNING",id:"p_other"},
  {employee:"alex",state:"QUEUED",id:"p_two"},{employee:"alex",state:"RESULT_READY",id:"p_three"}];
  assert.equal(selectWorkerTask(tasks,"alex").id,"p_two");
  assert.equal(selectWorkerTask(tasks,"siti").id,"p_other");
  assert.equal(selectWorkerTask(tasks,"praroro"),null);
  assert.equal(shortWords("one two three four five six",4),"one two three four");
});
test("frontend and backend keep the real worker pilot isolated from Kanban",async()=>{
  const html=await readFile(new URL("../src/index.html",import.meta.url),"utf8");
  const server=await readFile(new URL("../server.mjs",import.meta.url),"utf8");
  assert.match(html,/id="speech-layer"/);assert.match(html,/id="worker-frame"/);
  assert.match(server,/if \(pathname === "\/api\/worker\/tasks" && request\.method === "GET"\)/);
  assert.match(server,/source: "PUBLIC_PILOT_NOT_OFFICIAL_KANBAN"/);
  assert.match(server,/dispatch: \{ enabled: false/);
});
