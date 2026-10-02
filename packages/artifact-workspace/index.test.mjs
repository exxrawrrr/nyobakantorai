import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDirectoryArtifactStorage } from "./node-storage.mjs";
import {
  archiveMissionRun,
  buildReplayStream,
  createArtifactWorkspace,
  createMemoryArtifactStorage,
  importArtifactWorkspaceBundle,
  reconstructTimeline,
  validateArtifactOwnership,
  validateReplayStream,
} from "./index.mjs";

const root=new URL("../../",import.meta.url);
const fixtures=JSON.parse(await readFile(new URL("packages/artifact-workspace/fixtures/artifacts-v1.json",root),"utf8"));
const times=[
  "2026-10-02T03:20:00.000Z",
  "2026-10-02T03:20:01.000Z",
  "2026-10-02T03:20:02.000Z",
  "2026-10-02T03:20:03.000Z",
  "2026-10-02T03:20:04.000Z",
  "2026-10-02T03:20:05.000Z",
  "2026-10-02T03:20:06.000Z",
];
function clock(){
  let i=0;
  return ()=>times[Math.min(i++,times.length-1)];
}
function owner(){
  return {
    mission_id:fixtures.mission_id,
    task_id:fixtures.task_id,
    attempt_id:fixtures.attempt_id,
    employee_id:fixtures.employee_id,
  };
}
function missionResult(){
  return {
    mission:{
      schema:1,
      mission_id:fixtures.mission_id,
      objective:"Archive a bounded fixture mission.",
      state:"SUCCEEDED",
      task_ids:[fixtures.task_id],
      artifact_refs:[],
      evidence_refs:["evidence:mission-fixture"],
      approval_refs:[],
      risk_class:"READ_ONLY",
      budget:{hard_limit_amount:null,currency:null},
      autonomy:{mode:"GUARDED",delegated_capabilities:[]},
      constraints:[],
      created_at:"2026-10-02T03:19:00.000Z",
      updated_at:"2026-10-02T03:20:06.000Z",
    },
    tasks:[{
      schema:1,
      task_id:fixtures.task_id,
      mission_id:fixtures.mission_id,
      employee_id:fixtures.employee_id,
      state:"SUCCEEDED",
    }],
    attempts:[{
      schema:1,
      attempt_id:fixtures.attempt_id,
      task_id:fixtures.task_id,
      ordinal:1,
      state:"SUCCEEDED",
    }],
    events:[
      {kind:"MISSION_READY",at:"2026-10-02T03:20:00.000Z",mission_id:fixtures.mission_id},
      {kind:"MISSION_RUNNING",at:"2026-10-02T03:20:01.000Z",mission_id:fixtures.mission_id},
      {kind:"TASK_RUNNING",at:"2026-10-02T03:20:02.000Z",mission_id:fixtures.mission_id,task_id:fixtures.task_id,employee_id:fixtures.employee_id},
      {kind:"HANDOFF_RETURNED",at:"2026-10-02T03:20:04.000Z",mission_id:fixtures.mission_id,task_id:fixtures.task_id,attempt_id:fixtures.attempt_id,state:"SUCCEEDED"},
      {kind:"MISSION_SETTLED",at:"2026-10-02T03:20:06.000Z",mission_id:fixtures.mission_id,state:"SUCCEEDED"},
    ],
  };
}
function putFixture(workspace,item,ownership=owner()){
  return workspace.put({...item,ownership});
}

test("report/data/code/image/evidence fixtures persist with checksums and explicit ownership",()=>{
  const storage=createMemoryArtifactStorage();
  const workspace=createArtifactWorkspace({storage,clock:clock()});
  const records=fixtures.artifacts.map((item)=>putFixture(workspace,item));

  assert.deepEqual(records.map((x)=>x.artifact_type),["REPORT","DATA","CODE","IMAGE","EVIDENCE"]);
  assert.ok(records.every((x)=>x.version===1));
  assert.ok(records.every((x)=>/^[a-f0-9]{64}$/.test(x.content.sha256)));
  assert.ok(records.every((x)=>/^[a-f0-9]{64}$/.test(x.record_sha256)));
  assert.ok(records.every((x)=>x.ownership.mission_id===fixtures.mission_id));
  assert.ok(records.every((x)=>x.ownership.task_id===fixtures.task_id));
  assert.ok(records.every((x)=>x.ownership.attempt_id===fixtures.attempt_id));
  assert.equal(workspace.verify().record_count,5);

  const image=workspace.read(records[3].artifact_ref);
  assert.equal(image.payload.encoding,"base64");
  assert.equal(image.record.media_type,"image/png");
});

test("artifact edit creates an immutable next version linked to the previous ref",()=>{
  const storage=createMemoryArtifactStorage();
  const workspace=createArtifactWorkspace({storage,clock:clock()});
  const first=putFixture(workspace,fixtures.artifacts[0]);
  const second=workspace.put({
    ...fixtures.artifacts[0],
    payload:{encoding:"utf8",data:"# Fixture Report v2\n"},
    provenance:{source_kind:"DERIVED",source_refs:[first.artifact_ref],created_by:"alex"},
    ownership:owner(),
  });

  assert.equal(first.version,1);
  assert.equal(second.version,2);
  assert.equal(second.previous_artifact_ref,first.artifact_ref);
  assert.notEqual(second.artifact_ref,first.artifact_ref);
  assert.equal(workspace.read(first.artifact_ref).payload.data,fixtures.artifacts[0].payload.data);
  assert.equal(workspace.read(second.artifact_ref).payload.data,"# Fixture Report v2\n");
  assert.deepEqual(workspace.list({artifact_type:"REPORT"}).map((x)=>x.version),[1,2]);
});

test("directory storage survives a new workspace instance and process-like reopen",()=>{
  const dir=mkdtempSync(join(tmpdir(),"nyobakantorai-artifacts-"));
  try{
    const first=createArtifactWorkspace({storage:createDirectoryArtifactStorage(dir),clock:clock()});
    const record=putFixture(first,fixtures.artifacts[0]);
    assert.equal(first.verify().record_count,1);

    const reopened=createArtifactWorkspace({storage:createDirectoryArtifactStorage(dir)});
    assert.equal(reopened.verify().record_count,1);
    assert.equal(reopened.read(record.artifact_ref).payload.data,fixtures.artifacts[0].payload.data);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

test("artifact workspace survives export/import into a new storage adapter",()=>{
  const storage=createMemoryArtifactStorage();
  const workspace=createArtifactWorkspace({storage,clock:clock()});
  const records=fixtures.artifacts.map((item)=>putFixture(workspace,item));
  const bundle=workspace.exportBundle();

  const restoredStorage=createMemoryArtifactStorage();
  const restored=importArtifactWorkspaceBundle(JSON.stringify(bundle),{storage:restoredStorage});
  const verification=restored.verify();

  assert.equal(verification.ok,true);
  assert.equal(verification.record_count,5);
  assert.equal(restored.read(records[0].artifact_ref).payload.data,fixtures.artifacts[0].payload.data);
  assert.deepEqual(
    restored.list({mission_id:fixtures.mission_id}).map((x)=>x.artifact_ref),
    records.map((x)=>x.artifact_ref),
  );
});

test("payload tampering and metadata tampering are rejected",()=>{
  const storage=createMemoryArtifactStorage();
  const workspace=createArtifactWorkspace({storage,clock:clock()});
  const record=putFixture(workspace,fixtures.artifacts[0]);
  const snapshot={...storage.snapshot()};

  const blobKey=Object.keys(snapshot).find((key)=>key.includes("artifact-workspace:blob:sha256:"+record.content.sha256));
  snapshot[blobKey]="tampered payload";
  const payloadTampered=createArtifactWorkspace({storage:createMemoryArtifactStorage(snapshot)});
  assert.throws(()=>payloadTampered.read(record.artifact_ref),/payload (length|checksum) mismatch/i);

  const cleanSnapshot={...storage.snapshot()};
  const recordKey=Object.keys(cleanSnapshot).find((key)=>key.includes("artifact-workspace:record:"+record.artifact_id+":v1"));
  const tamperedRecord=JSON.parse(cleanSnapshot[recordKey]);
  tamperedRecord.provenance.created_by="mallory";
  cleanSnapshot[recordKey]=JSON.stringify(tamperedRecord);
  const metadataTampered=createArtifactWorkspace({storage:createMemoryArtifactStorage(cleanSnapshot)});
  assert.throws(()=>metadataTampered.getRecord(record.artifact_ref),/record checksum mismatch/i);
});

test("ownership validator rejects missing task, wrong employee, and wrong attempt binding",()=>{
  const workspace=createArtifactWorkspace({storage:createMemoryArtifactStorage(),clock:clock()});
  const record=putFixture(workspace,fixtures.artifacts[0]);
  const result=missionResult();

  assert.equal(validateArtifactOwnership(record,result),true);
  assert.throws(
    ()=>validateArtifactOwnership(record,{mission:result.mission,tasks:[],attempts:result.attempts}),
    /missing TaskNode/,
  );
  assert.throws(
    ()=>validateArtifactOwnership(record,{
      mission:result.mission,
      tasks:[{...result.tasks[0],employee_id:"nara"}],
      attempts:result.attempts,
    }),
    /employee ownership mismatch/,
  );
  assert.throws(
    ()=>validateArtifactOwnership(record,{
      mission:result.mission,
      tasks:result.tasks,
      attempts:[{...result.attempts[0],task_id:"task-other"}],
    }),
    /attempt\/task ownership mismatch/,
  );
});

test("archiveMissionRun creates durable artifact refs and replay from canonical events",()=>{
  const workspace=createArtifactWorkspace({storage:createMemoryArtifactStorage(),clock:clock()});
  const result=missionResult();
  const archive=archiveMissionRun({
    workspace,
    result,
    artifacts:fixtures.artifacts.slice(0,2).map((item)=>({...item,ownership:owner()})),
    created_at:"2026-10-02T03:20:06.000Z",
  });

  assert.equal(archive.mission_id,fixtures.mission_id);
  assert.equal(archive.artifact_refs.length,2);
  assert.equal(validateReplayStream(archive.replay),true);
  assert.equal(archive.replay.canonical_snapshot.mission.mission_id,fixtures.mission_id);
  assert.equal(archive.replay.canonical_snapshot.tasks[0].task_id,fixtures.task_id);
  assert.equal(archive.replay.canonical_snapshot.attempts[0].attempt_id,fixtures.attempt_id);

  const timeline=reconstructTimeline(archive.replay);
  assert.equal(timeline.length,result.events.length+2);
  assert.ok(timeline.some((row)=>row.kind==="ARTIFACT_VERSION_STORED"));
  assert.ok(timeline.some((row)=>row.kind==="MISSION_SETTLED"));
  assert.ok(timeline.every((row)=>row.facts && typeof row.facts==="object"));
  assert.ok(timeline.every((row)=>!("narrative" in row) && !("summary" in row)));
});

test("replay detects payload tamper, missing middle event, missing tail event, and snapshot tamper",()=>{
  const result=missionResult();
  const stream=buildReplayStream({
    mission:result.mission,
    tasks:result.tasks,
    attempts:result.attempts,
    orchestrator_events:result.events,
    artifact_events:[],
    created_at:"2026-10-02T03:20:06.000Z",
  });
  assert.equal(validateReplayStream(stream),true);

  const payloadTamper=structuredClone(stream);
  payloadTamper.events[1].payload.kind="FAKE_EVENT";
  assert.throws(()=>validateReplayStream(payloadTamper),/source record checksum mismatch|event checksum mismatch|stream checksum mismatch/i);

  const missingMiddle=structuredClone(stream);
  missingMiddle.events.splice(1,1);
  assert.throws(()=>validateReplayStream(missingMiddle),/(event_count|sequence|chain) mismatch|sequence gap/i);

  const missingTail=structuredClone(stream);
  missingTail.events.pop();
  assert.throws(()=>validateReplayStream(missingTail),/event_count mismatch/i);

  const snapshotTamper=structuredClone(stream);
  snapshotTamper.canonical_snapshot.mission.state="VERIFIED";
  assert.throws(()=>validateReplayStream(snapshotTamper),/snapshot checksum mismatch/i);
});

test("replay ordering is deterministic and timeline facts equal canonical source payloads",()=>{
  const result=missionResult();
  const workspace=createArtifactWorkspace({
    storage:createMemoryArtifactStorage(),
    clock:()=>"2026-10-02T03:20:03.000Z",
  });
  workspace.put({...fixtures.artifacts[0],ownership:owner()});
  const artifactEvents=workspace.events();
  const first=buildReplayStream({
    mission:result.mission,tasks:result.tasks,attempts:result.attempts,
    orchestrator_events:result.events,artifact_events:artifactEvents,
    created_at:"2026-10-02T03:20:06.000Z",
  });
  const second=buildReplayStream({
    mission:result.mission,tasks:result.tasks,attempts:result.attempts,
    orchestrator_events:result.events,artifact_events:artifactEvents,
    created_at:"2026-10-02T03:20:06.000Z",
  });
  assert.equal(first.stream_sha256,second.stream_sha256);
  assert.deepEqual(first.events.map((x)=>x.kind),[
    "MISSION_READY","MISSION_RUNNING","TASK_RUNNING","ARTIFACT_VERSION_STORED","HANDOFF_RETURNED","MISSION_SETTLED",
  ]);
  const timeline=reconstructTimeline(first);
  for(let i=0;i<timeline.length;i++){
    assert.deepEqual(timeline[i].facts,first.events[i].payload);
  }
});

test("artifact workspace index checksum detects metadata deletion or edit",()=>{
  const storage=createMemoryArtifactStorage();
  const workspace=createArtifactWorkspace({storage,clock:clock()});
  putFixture(workspace,fixtures.artifacts[0]);
  const snapshot={...storage.snapshot()};
  const indexKey=Object.keys(snapshot).find((key)=>key==="artifact-workspace:index:v1");
  const index=JSON.parse(snapshot[indexKey]);
  index.records=[];
  snapshot[indexKey]=JSON.stringify(index);
  const tampered=createArtifactWorkspace({storage:createMemoryArtifactStorage(snapshot)});
  assert.throws(()=>tampered.verify(),/index checksum mismatch/i);
});

test("bundle checksum prevents edited exported records from being imported",()=>{
  const workspace=createArtifactWorkspace({storage:createMemoryArtifactStorage(),clock:clock()});
  putFixture(workspace,fixtures.artifacts[0]);
  const bundle=structuredClone(workspace.exportBundle());
  bundle.records[0].payload.data="edited after export";
  assert.throws(
    ()=>importArtifactWorkspaceBundle(JSON.stringify(bundle),{storage:createMemoryArtifactStorage()}),
    /bundle integrity check failed/i,
  );
});
