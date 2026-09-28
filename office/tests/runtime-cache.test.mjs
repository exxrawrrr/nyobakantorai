import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeSnapshotCache } from "../runtime-cache.mjs";

const good = (id) => ({ id, hermes:{board_connected:true},tasks:[],employees:{
  praroro:{profile_exists:true},paijo:{profile_exists:true},subagjo:{profile_exists:true},
  alex:{profile_exists:true},sumiati:{profile_exists:true},siti:{profile_exists:true},
}});
const valid = (value) => value?.hermes?.board_connected === true
  && Array.isArray(value?.tasks)
  && ["praroro","paijo","subagjo","alex","sumiati","siti"]
    .every((id)=>value.employees?.[id]?.profile_exists === true);

test("within bounded TTL, returns explicit cached age and preserves original record", async () => {
  let clock=100, calls=0;
  const read=createRuntimeSnapshotCache(async()=>good(++calls),{now:()=>clock,ttlMs:1500,cacheable:valid});
  const first=await read();clock=1000;const second=await read();
  assert.equal(first.source,"LIVE_REFRESH");assert.equal(second.source,"BOUNDED_CACHE");
  assert.equal(second.age_ms,900);assert.strictEqual(first.snapshot,second.snapshot);assert.equal(calls,1);
  clock=1600;const third=await read();
  assert.equal(third.source,"LIVE_REFRESH");assert.equal(third.snapshot.id,2);
});
test("simultaneous requests join exactly one expensive Hermes refresh", async()=>{
  let calls=0, release;
  const gate=new Promise(resolve=>{release=resolve;});
  const read=createRuntimeSnapshotCache(async()=>{calls++;await gate;return good(calls);},{cacheable:valid});
  const first=read(), second=read(), third=read();
  assert.equal(calls,1);release();
  const results=await Promise.all([first,second,third]);
  assert.deepEqual(results.map(x=>x.source),["LIVE_REFRESH","JOINED_REFRESH","JOINED_REFRESH"]);
  assert.ok(results.every(x=>x.snapshot.id===1));
});
test("failed refresh propagates and later request retries, never serves expired success",async()=>{
  let now=0,calls=0;
  const read=createRuntimeSnapshotCache(async()=>{
    calls++;if(calls===2)throw new Error("Hermes unavailable");return good(calls);
  },{now:()=>now,ttlMs:10,cacheable:valid});
  await read();now=20;
  await assert.rejects(read(),/Hermes unavailable/);
  const retry=await read();assert.equal(retry.snapshot.id,3);assert.equal(calls,3);
});
test("incomplete official board or employee status is NOT cached",async()=>{
  let now=0,calls=0;
  const read=createRuntimeSnapshotCache(async()=>{
    calls++;if(calls===1)return {...good(1),hermes:{board_connected:false},tasks:null};
    return good(calls);
  },{now:()=>now,cacheable:valid});
  const first=await read();const second=await read();
  assert.equal(first.snapshot.tasks,null);assert.equal(second.source,"LIVE_REFRESH");
  assert.equal(second.snapshot.id,2);
});
test("invalid configuration rejected and clock rollback never returns cached record",async()=>{
  assert.throws(()=>createRuntimeSnapshotCache(async()=>good(1),{ttlMs:10001}),TypeError);
  let now=20,calls=0;
  const read=createRuntimeSnapshotCache(async()=>good(++calls),{now:()=>now,cacheable:valid});
  await read();now=10;assert.equal((await read()).snapshot.id,2);
});


test("two-level runtime cache refreshes official tasks more often than employee metadata",async()=>{
  let tick=100,boardCalls=0,profileCalls=0;
  const readEmployee=createRuntimeSnapshotCache(async()=>({version:"v1", profiles:++profileCalls}),{
    now:()=>tick,ttlMs:8000,cacheable:v=>Boolean(v.version)
  });
  const readOffice=createRuntimeSnapshotCache(async()=>{
    const employee=await readEmployee();
    return {board:++boardCalls, profiles:employee.snapshot.profiles,
      evidence:employee.source,version:employee.snapshot.version};
  },{now:()=>tick,ttlMs:1500});
  const a=await readOffice();
  tick=1800; const b=await readOffice();
  tick=8300; const c=await readOffice();
  assert.deepEqual([a.snapshot.board,b.snapshot.board,c.snapshot.board],[1,2,3]);
  assert.deepEqual([a.snapshot.profiles,b.snapshot.profiles,c.snapshot.profiles],[1,1,2]);
  assert.deepEqual([a.snapshot.evidence,b.snapshot.evidence,c.snapshot.evidence],
                   ["LIVE_REFRESH","BOUNDED_CACHE","LIVE_REFRESH"]);
  assert.equal(profileCalls,2);
});
