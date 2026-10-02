import { createHash } from "node:crypto";

export const ARTIFACT_WORKSPACE_API = 1;
export const ARTIFACT_TYPES = Object.freeze(["REPORT","DATA","CODE","IMAGE","EVIDENCE"]);
export const REPLAY_STREAM_API = 1;

const TYPE_SET = new Set(ARTIFACT_TYPES);
const ARTIFACT_REF = /^artifact:([a-z0-9][a-z0-9._-]{2,159}):v([1-9]\d*):sha256:([a-f0-9]{64})$/;
const clean = (value,max=4000) => String(value ?? "").trim().slice(0,max);

function assert(condition,message){ if(!condition) throw new Error(message); }
function validTimestamp(value){ return typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value)); }
function unique(values,max=1000){
  return Object.freeze([...new Set((Array.isArray(values)?values:[]).map((v)=>clean(v,max)).filter(Boolean))]);
}
function canonicalize(value){
  if(value===null || typeof value==="string" || typeof value==="boolean") return value;
  if(typeof value==="number"){
    assert(Number.isFinite(value),"Canonical JSON forbids non-finite numbers.");
    return Object.is(value,-0)?0:value;
  }
  if(Array.isArray(value)) return value.map(canonicalize);
  if(value && typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().filter((k)=>value[k]!==undefined).map((k)=>[k,canonicalize(value[k])]));
  }
  throw new Error("Canonical JSON forbids type: "+typeof value);
}
export function canonicalArtifactJson(value){ return JSON.stringify(canonicalize(value)); }
export function sha256Hex(value){
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value),"utf8");
  return createHash("sha256").update(bytes).digest("hex");
}
function payloadBytes(payload={}){
  assert(payload && typeof payload==="object" && !Array.isArray(payload),"Artifact payload must be an object.");
  const encoding=clean(payload.encoding||"utf8",20).toLowerCase();
  assert(["utf8","base64"].includes(encoding),"Artifact payload encoding must be utf8 or base64.");
  const data=String(payload.data ?? "");
  if(encoding==="base64"){
    assert(/^[A-Za-z0-9+/]*={0,2}$/.test(data) && data.length%4===0,"Artifact base64 payload is invalid.");
    return Object.freeze({encoding,bytes:Buffer.from(data,"base64"),data});
  }
  return Object.freeze({encoding,bytes:Buffer.from(data,"utf8"),data});
}
function normalizeOwnership(value={}){
  assert(value && typeof value==="object" && !Array.isArray(value),"Artifact ownership must be an object.");
  const missionId=clean(value.mission_id,160);
  const taskId=value.task_id==null?null:clean(value.task_id,160)||null;
  const attemptId=value.attempt_id==null?null:clean(value.attempt_id,160)||null;
  const employeeId=value.employee_id==null?null:clean(value.employee_id,40).toLowerCase()||null;
  assert(missionId,"Artifact ownership.mission_id is required.");
  if(attemptId) assert(taskId,"Artifact ownership attempt_id requires task_id.");
  return Object.freeze({mission_id:missionId,task_id:taskId,attempt_id:attemptId,employee_id:employeeId});
}
function normalizeProvenance(value={}){
  assert(value && typeof value==="object" && !Array.isArray(value),"Artifact provenance must be an object.");
  const sourceKind=clean(value.source_kind||"DERIVED",40).toUpperCase();
  const createdBy=clean(value.created_by,120);
  assert(["RUNTIME","USER","DERIVED","IMPORT","SYSTEM"].includes(sourceKind),"Artifact provenance.source_kind is invalid.");
  assert(createdBy,"Artifact provenance.created_by is required.");
  return Object.freeze({
    source_kind:sourceKind,
    source_refs:unique(value.source_refs),
    created_by:createdBy,
  });
}
function normalizeBody(input={}){
  const artifactId=clean(input.artifact_id,160).toLowerCase();
  const artifactType=clean(input.artifact_type,40).toUpperCase();
  const mediaType=clean(input.media_type||"application/octet-stream",160).toLowerCase();
  const version=Number(input.version);
  const createdAt=clean(input.created_at,80);
  const previous=input.previous_artifact_ref??null;
  assert(/^[a-z0-9][a-z0-9._-]{2,159}$/.test(artifactId),"Artifact artifact_id must be a lowercase stable slug.");
  assert(TYPE_SET.has(artifactType),"Artifact artifact_type is invalid.");
  assert(Number.isInteger(version)&&version>=1,"Artifact version must be an integer >= 1.");
  assert(mediaType.includes("/"),"Artifact media_type is invalid.");
  assert(validTimestamp(createdAt),"Artifact created_at must be valid.");
  const contentSha=clean(input.content?.sha256,64);
  const byteLength=Number(input.content?.byte_length);
  const encoding=clean(input.content?.encoding,20).toLowerCase();
  assert(/^[a-f0-9]{64}$/.test(contentSha),"Artifact content.sha256 is invalid.");
  assert(Number.isInteger(byteLength)&&byteLength>=0,"Artifact content.byte_length is invalid.");
  assert(["utf8","base64"].includes(encoding),"Artifact content.encoding is invalid.");
  if(version===1) assert(previous==null,"Artifact v1 cannot have previous_artifact_ref.");
  else assert(ARTIFACT_REF.test(previous||""),"Artifact version >1 requires valid previous_artifact_ref.");
  return Object.freeze({
    schema:ARTIFACT_WORKSPACE_API,
    artifact_id:artifactId,
    version,
    artifact_type:artifactType,
    media_type:mediaType,
    ownership:normalizeOwnership(input.ownership),
    provenance:normalizeProvenance(input.provenance),
    content:Object.freeze({sha256:contentSha,byte_length:byteLength,encoding}),
    previous_artifact_ref:previous,
    created_at:new Date(createdAt).toISOString(),
  });
}
export function normalizeArtifactRecord(input={}){
  assert(input && typeof input==="object" && !Array.isArray(input),"Artifact record must be an object.");
  assert(input.schema===ARTIFACT_WORKSPACE_API,"Artifact record schema must be 1.");
  const recordSha=clean(input.record_sha256,64);
  const artifactRef=clean(input.artifact_ref,1000);
  assert(/^[a-f0-9]{64}$/.test(recordSha),"Artifact record_sha256 is invalid.");
  const match=artifactRef.match(ARTIFACT_REF);
  assert(match,"Artifact artifact_ref is invalid.");
  const body=normalizeBody(input);
  const computed=sha256Hex(canonicalArtifactJson(body));
  assert(computed===recordSha,"Artifact record checksum mismatch.");
  assert(match[1]===body.artifact_id && Number(match[2])===body.version && match[3]===recordSha,"Artifact ref does not match record identity.");
  return Object.freeze({...body,record_sha256:recordSha,artifact_ref:artifactRef});
}
function makeArtifactRecord(input,{version,content,previousArtifactRef}){
  const body=normalizeBody({
    ...input,
    version,
    previous_artifact_ref:previousArtifactRef,
    content:{
      sha256:sha256Hex(content.bytes),
      byte_length:content.bytes.length,
      encoding:content.encoding,
    },
  });
  const recordSha=sha256Hex(canonicalArtifactJson(body));
  return Object.freeze({
    ...body,
    record_sha256:recordSha,
    artifact_ref:"artifact:"+body.artifact_id+":v"+body.version+":sha256:"+recordSha,
  });
}

function storageAssert(storage){
  assert(storage && typeof storage==="object","Artifact storage adapter is required.");
  assert(typeof storage.get==="function" && typeof storage.set==="function" && typeof storage.remove==="function","Artifact storage requires get/set/remove.");
}
const INDEX_KEY="artifact-workspace:index:v1";
const recordKey=(id,version)=>"artifact-workspace:record:"+id+":v"+version;
const blobKey=(sha)=>"artifact-workspace:blob:sha256:"+sha;

function emptyIndex(){ return {schema:1,records:[],events:[],updated_at:null}; }
function readIndex(storage){
  const raw=storage.get(INDEX_KEY);
  if(raw==null||raw==="") return emptyIndex();
  const parsed=JSON.parse(raw);
  assert(parsed?.schema===1 && Array.isArray(parsed.records) && Array.isArray(parsed.events),"Artifact workspace index is invalid.");
  return parsed;
}
function writeIndex(storage,index){ storage.set(INDEX_KEY,JSON.stringify(index)); }

function workspaceEventBody(input={}){
  assert(validTimestamp(input.at),"Artifact workspace event timestamp is invalid.");
  return Object.freeze({
    schema:1,
    sequence:Number(input.sequence),
    at:new Date(input.at).toISOString(),
    kind:clean(input.kind,80).toUpperCase(),
    artifact_ref:clean(input.artifact_ref,1000),
    mission_id:clean(input.mission_id,160),
    task_id:input.task_id==null?null:clean(input.task_id,160)||null,
    attempt_id:input.attempt_id==null?null:clean(input.attempt_id,160)||null,
    previous_event_sha256:input.previous_event_sha256??null,
  });
}
function makeWorkspaceEvent(index,input){
  const sequence=index.events.length+1;
  const previous=index.events.length?index.events[index.events.length-1].event_sha256:null;
  const body=workspaceEventBody({...input,sequence,previous_event_sha256:previous});
  const eventSha=sha256Hex(canonicalArtifactJson(body));
  return Object.freeze({...body,event_sha256:eventSha});
}
export function validateWorkspaceEvents(events=[]){
  assert(Array.isArray(events),"Artifact workspace events must be an array.");
  let previous=null;
  for(let i=0;i<events.length;i++){
    const event=events[i];
    assert(event?.sequence===i+1,"Artifact workspace event sequence gap.");
    assert(event.previous_event_sha256===previous,"Artifact workspace event chain mismatch.");
    const body=workspaceEventBody(event);
    const digest=sha256Hex(canonicalArtifactJson(body));
    assert(digest===event.event_sha256,"Artifact workspace event checksum mismatch.");
    previous=digest;
  }
  return true;
}

export function createMemoryArtifactStorage(initial={}){
  const map=new Map(Object.entries(initial).map(([k,v])=>[String(k),String(v)]));
  return Object.freeze({
    get:key=>map.has(String(key))?map.get(String(key)):null,
    set:(key,value)=>{map.set(String(key),String(value));},
    remove:key=>{map.delete(String(key));},
    snapshot:()=>Object.freeze(Object.fromEntries([...map.entries()].sort(([a],[b])=>a.localeCompare(b)))),
  });
}

export function createArtifactWorkspace({storage,clock=()=>new Date().toISOString()}={}){
  storageAssert(storage);
  const now=()=>{const value=clock();assert(validTimestamp(value),"Artifact workspace clock must return valid timestamp.");return new Date(value).toISOString();};

  const api={
    put(input={}){
      const content=payloadBytes(input.payload);
      const index=readIndex(storage);
      validateWorkspaceEvents(index.events);
      const artifactId=clean(input.artifact_id,160).toLowerCase();
      const records=index.records.filter((x)=>x.artifact_id===artifactId).sort((a,b)=>a.version-b.version);
      const version=records.length?records[records.length-1].version+1:1;
      const previousArtifactRef=records.length?records[records.length-1].artifact_ref:null;
      const record=makeArtifactRecord({...input,created_at:input.created_at||now()},{version,content,previousArtifactRef});
      if(previousArtifactRef){
        const previous=api.getRecord(previousArtifactRef);
        assert(previous.version+1===record.version,"Artifact version chain is not contiguous.");
      }
      storage.set(blobKey(record.content.sha256),content.data);
      storage.set(recordKey(record.artifact_id,record.version),JSON.stringify(record));
      const event=makeWorkspaceEvent(index,{
        at:record.created_at,
        kind:"ARTIFACT_VERSION_STORED",
        artifact_ref:record.artifact_ref,
        mission_id:record.ownership.mission_id,
        task_id:record.ownership.task_id,
        attempt_id:record.ownership.attempt_id,
      });
      index.records.push({artifact_id:record.artifact_id,version:record.version,artifact_ref:record.artifact_ref});
      index.events.push(event);
      index.updated_at=record.created_at;
      writeIndex(storage,index);
      return record;
    },
    getRecord(ref){
      const match=clean(ref,1000).match(ARTIFACT_REF);
      assert(match,"Artifact ref is invalid.");
      const raw=storage.get(recordKey(match[1],Number(match[2])));
      assert(raw!=null,"Artifact record is missing.");
      const record=normalizeArtifactRecord(JSON.parse(raw));
      assert(record.artifact_ref===ref,"Artifact record/ref mismatch.");
      return record;
    },
    read(ref){
      const record=api.getRecord(ref);
      const raw=storage.get(blobKey(record.content.sha256));
      assert(raw!=null,"Artifact payload is missing.");
      const bytes=record.content.encoding==="base64"?Buffer.from(raw,"base64"):Buffer.from(raw,"utf8");
      assert(bytes.length===record.content.byte_length,"Artifact payload length mismatch.");
      assert(sha256Hex(bytes)===record.content.sha256,"Artifact payload checksum mismatch.");
      return Object.freeze({record,payload:Object.freeze({encoding:record.content.encoding,data:raw})});
    },
    list({mission_id=null,task_id=null,artifact_type=null}={}){
      const index=readIndex(storage);
      validateWorkspaceEvents(index.events);
      return Object.freeze(index.records.map((entry)=>api.getRecord(entry.artifact_ref)).filter((record)=>
        (mission_id==null||record.ownership.mission_id===mission_id)
        &&(task_id==null||record.ownership.task_id===task_id)
        &&(artifact_type==null||record.artifact_type===clean(artifact_type,40).toUpperCase())
      ));
    },
    events({mission_id=null}={}){
      const index=readIndex(storage);
      validateWorkspaceEvents(index.events);
      return Object.freeze(index.events.filter((event)=>mission_id==null||event.mission_id===mission_id).map((event)=>Object.freeze({...event})));
    },
    verify(){
      const index=readIndex(storage);
      validateWorkspaceEvents(index.events);
      const refs=new Set();
      for(const entry of index.records){
        assert(!refs.has(entry.artifact_ref),"Artifact workspace index has duplicate ref.");
        refs.add(entry.artifact_ref);
        const record=api.getRecord(entry.artifact_ref);
        api.read(entry.artifact_ref);
        if(record.version>1){
          const previous=api.getRecord(record.previous_artifact_ref);
          assert(previous.artifact_id===record.artifact_id && previous.version===record.version-1,"Artifact version chain mismatch.");
        }
      }
      return Object.freeze({
        ok:true,
        record_count:index.records.length,
        event_count:index.events.length,
        head_event_sha256:index.events.length?index.events[index.events.length-1].event_sha256:null,
      });
    },
    exportBundle(){
      const index=readIndex(storage);
      api.verify();
      const records=index.records.map((entry)=>api.read(entry.artifact_ref));
      const payload={schema:1,format:"nyobakantorai-artifact-workspace",index,records};
      const bundleSha=sha256Hex(canonicalArtifactJson(payload));
      return Object.freeze({...payload,bundle_sha256:bundleSha});
    },
  };
  return Object.freeze(api);
}


export function importArtifactWorkspaceBundle(text,{storage}={}){
  storageAssert(storage);
  let bundle;
  try { bundle=typeof text==="string"?JSON.parse(text):structuredClone(text); }
  catch { throw new Error("Artifact workspace bundle requires valid JSON."); }
  assert(bundle?.schema===1 && bundle?.format==="nyobakantorai-artifact-workspace","Artifact workspace bundle format is invalid.");
  assert(Array.isArray(bundle.records),"Artifact workspace bundle records are required.");
  assert(bundle.index?.schema===1 && Array.isArray(bundle.index.records) && Array.isArray(bundle.index.events),"Artifact workspace bundle index is invalid.");
  const payload={
    schema:bundle.schema,
    format:bundle.format,
    index:bundle.index,
    records:bundle.records,
  };
  assert(/^[a-f0-9]{64}$/.test(bundle.bundle_sha256||""),"Artifact workspace bundle checksum is invalid.");
  assert(sha256Hex(canonicalArtifactJson(payload))===bundle.bundle_sha256,"Artifact workspace bundle integrity check failed.");
  validateWorkspaceEvents(bundle.index.events);
  assert(bundle.index.records.length===bundle.records.length,"Artifact workspace bundle record count mismatch.");

  const byRef=new Map();
  for(const item of bundle.records){
    assert(item?.record && item?.payload,"Artifact workspace bundle record entry is invalid.");
    const record=normalizeArtifactRecord(item.record);
    const content=payloadBytes(item.payload);
    assert(content.encoding===record.content.encoding,"Artifact workspace bundle payload encoding mismatch.");
    assert(content.bytes.length===record.content.byte_length,"Artifact workspace bundle payload length mismatch.");
    assert(sha256Hex(content.bytes)===record.content.sha256,"Artifact workspace bundle payload checksum mismatch.");
    byRef.set(record.artifact_ref,{record,content});
  }
  for(const entry of bundle.index.records){
    const found=byRef.get(entry.artifact_ref);
    assert(found,"Artifact workspace bundle index references missing record.");
    assert(found.record.artifact_id===entry.artifact_id && found.record.version===entry.version,"Artifact workspace bundle index identity mismatch.");
    if(found.record.version>1){
      const previous=byRef.get(found.record.previous_artifact_ref);
      assert(previous,"Artifact workspace bundle version chain is missing previous version.");
      assert(previous.record.artifact_id===found.record.artifact_id && previous.record.version===found.record.version-1,"Artifact workspace bundle version chain mismatch.");
    }
  }

  for(const {record,content} of byRef.values()){
    storage.set(blobKey(record.content.sha256),content.data);
    storage.set(recordKey(record.artifact_id,record.version),JSON.stringify(record));
  }
  writeIndex(storage,structuredClone(bundle.index));
  const workspace=createArtifactWorkspace({storage});
  workspace.verify();
  return workspace;
}

export function validateArtifactOwnership(recordInput,{mission,tasks=[],attempts=[]}={}){
  const record=normalizeArtifactRecord(recordInput);
  assert(mission && typeof mission==="object","Mission is required for artifact ownership validation.");
  assert(record.ownership.mission_id===mission.mission_id,"Artifact mission ownership mismatch.");
  const task=record.ownership.task_id==null?null:tasks.find((x)=>x.task_id===record.ownership.task_id);
  if(record.ownership.task_id) assert(task,"Artifact task ownership references missing TaskNode.");
  if(task){
    assert(task.mission_id===mission.mission_id,"Artifact TaskNode belongs to another Mission.");
    if(record.ownership.employee_id) assert(record.ownership.employee_id===task.employee_id,"Artifact employee ownership mismatch.");
  }
  if(record.ownership.attempt_id){
    const attempt=attempts.find((x)=>x.attempt_id===record.ownership.attempt_id);
    assert(attempt,"Artifact attempt ownership references missing Execution Attempt.");
    assert(attempt.task_id===record.ownership.task_id,"Artifact attempt/task ownership mismatch.");
  }
  return true;
}

function replaySourceEvent(sourceType,event,index){
  assert(event && typeof event==="object" && !Array.isArray(event),"Replay source event must be an object.");
  const at=clean(event.at||event.created_at,80);
  assert(validTimestamp(at),"Replay source event timestamp is invalid.");
  const kind=clean(event.kind||event.action,80).toUpperCase();
  assert(kind,"Replay source event kind is required.");
  const payload=structuredClone(event);
  return Object.freeze({
    source_type:sourceType,
    source_index:index,
    at:new Date(at).toISOString(),
    kind,
    mission_id:clean(event.mission_id,160)||null,
    task_id:clean(event.task_id,160)||null,
    attempt_id:clean(event.attempt_id,160)||null,
    source_record_sha256:sha256Hex(canonicalArtifactJson(payload)),
    payload:Object.freeze(payload),
  });
}
function replayEventBody(input){
  return Object.freeze({
    schema:REPLAY_STREAM_API,
    stream_id:input.stream_id,
    sequence:input.sequence,
    at:input.at,
    kind:input.kind,
    mission_id:input.mission_id,
    task_id:input.task_id,
    attempt_id:input.attempt_id,
    source_type:input.source_type,
    source_index:input.source_index,
    source_record_sha256:input.source_record_sha256,
    payload:input.payload,
    previous_event_sha256:input.previous_event_sha256,
  });
}
function replayEventHash(body){ return sha256Hex(canonicalArtifactJson(body)); }

export function buildReplayStream({
  mission,
  tasks=[],
  attempts=[],
  orchestrator_events=[],
  artifact_events=[],
  created_at=new Date().toISOString(),
}={}){
  assert(mission && typeof mission==="object","Replay requires Mission.");
  assert(validTimestamp(created_at),"Replay created_at must be valid.");
  const missionId=clean(mission.mission_id,160);
  assert(missionId,"Replay Mission mission_id is required.");
  for(const task of tasks) assert(task.mission_id===missionId,"Replay TaskNode belongs to another Mission.");
  const taskIds=new Set(tasks.map((x)=>x.task_id));
  for(const attempt of attempts) assert(taskIds.has(attempt.task_id),"Replay Attempt references missing TaskNode.");

  const sources=[
    ...orchestrator_events.map((event,index)=>replaySourceEvent("MISSION_ORCHESTRATOR",event,index)),
    ...artifact_events.filter((event)=>event.mission_id===missionId).map((event,index)=>replaySourceEvent("ARTIFACT_WORKSPACE",event,index)),
  ].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.source_type.localeCompare(b.source_type)||a.source_index-b.source_index);

  const events=[];
  let previous=null;
  for(let i=0;i<sources.length;i++){
    const source=sources[i];
    const body=replayEventBody({
      ...source,
      stream_id:"replay:"+missionId,
      sequence:i+1,
      previous_event_sha256:previous,
    });
    const eventSha=replayEventHash(body);
    events.push(Object.freeze({...body,event_sha256:eventSha}));
    previous=eventSha;
  }

  const snapshot=Object.freeze({
    mission:structuredClone(mission),
    tasks:Object.freeze(tasks.map((x)=>structuredClone(x))),
    attempts:Object.freeze(attempts.map((x)=>structuredClone(x))),
  });
  const snapshotSha=sha256Hex(canonicalArtifactJson(snapshot));
  const manifest={
    schema:REPLAY_STREAM_API,
    stream_id:"replay:"+missionId,
    mission_id:missionId,
    created_at:new Date(created_at).toISOString(),
    event_count:events.length,
    head_event_sha256:previous,
    canonical_snapshot_sha256:snapshotSha,
    canonical_snapshot:snapshot,
    events:Object.freeze(events),
  };
  const streamSha=sha256Hex(canonicalArtifactJson(manifest));
  return Object.freeze({...manifest,stream_sha256:streamSha});
}

export function validateReplayStream(stream={}){
  assert(stream?.schema===REPLAY_STREAM_API,"Replay stream schema must be 1.");
  assert(/^replay:.+/.test(clean(stream.stream_id,240)),"Replay stream_id is invalid.");
  assert(validTimestamp(stream.created_at),"Replay created_at is invalid.");
  assert(Array.isArray(stream.events),"Replay events must be an array.");
  assert(stream.event_count===stream.events.length,"Replay event_count mismatch.");
  const snapshotSha=sha256Hex(canonicalArtifactJson(stream.canonical_snapshot));
  assert(snapshotSha===stream.canonical_snapshot_sha256,"Replay canonical snapshot checksum mismatch.");

  let previous=null;
  for(let i=0;i<stream.events.length;i++){
    const event=stream.events[i];
    assert(event.sequence===i+1,"Replay event sequence gap.");
    assert(event.stream_id===stream.stream_id,"Replay event stream identity mismatch.");
    assert(event.mission_id==null||event.mission_id===stream.mission_id,"Replay event Mission mismatch.");
    assert(event.previous_event_sha256===previous,"Replay event chain mismatch.");
    const sourceSha=sha256Hex(canonicalArtifactJson(event.payload));
    assert(sourceSha===event.source_record_sha256,"Replay source record checksum mismatch.");
    const body=replayEventBody(event);
    const eventSha=replayEventHash(body);
    assert(eventSha===event.event_sha256,"Replay event checksum mismatch.");
    previous=eventSha;
  }
  assert(previous===stream.head_event_sha256,"Replay head checksum mismatch.");
  const manifest={
    schema:stream.schema,
    stream_id:stream.stream_id,
    mission_id:stream.mission_id,
    created_at:stream.created_at,
    event_count:stream.event_count,
    head_event_sha256:stream.head_event_sha256,
    canonical_snapshot_sha256:stream.canonical_snapshot_sha256,
    canonical_snapshot:stream.canonical_snapshot,
    events:stream.events,
  };
  assert(sha256Hex(canonicalArtifactJson(manifest))===stream.stream_sha256,"Replay stream checksum mismatch.");
  return true;
}

export function reconstructTimeline(streamInput={}){
  validateReplayStream(streamInput);
  return Object.freeze(streamInput.events.map((event)=>Object.freeze({
    sequence:event.sequence,
    at:event.at,
    kind:event.kind,
    mission_id:event.mission_id,
    task_id:event.task_id,
    attempt_id:event.attempt_id,
    source_type:event.source_type,
    source_record_sha256:event.source_record_sha256,
    facts:Object.freeze(structuredClone(event.payload)),
  })));
}

export function archiveMissionRun({workspace,result,artifacts=[],created_at=null}={}){
  assert(workspace && typeof workspace.put==="function" && typeof workspace.events==="function","Artifact workspace is required.");
  assert(result?.mission && Array.isArray(result.tasks) && Array.isArray(result.attempts) && Array.isArray(result.events),"Mission result is incomplete.");
  const stored=[];
  for(const artifact of artifacts){
    const record=workspace.put({
      ...artifact,
      ownership:{
        mission_id:artifact.ownership?.mission_id||result.mission.mission_id,
        task_id:artifact.ownership?.task_id??null,
        attempt_id:artifact.ownership?.attempt_id??null,
        employee_id:artifact.ownership?.employee_id??null,
      },
    });
    validateArtifactOwnership(record,{mission:result.mission,tasks:result.tasks,attempts:result.attempts});
    stored.push(record);
  }
  const replay=buildReplayStream({
    mission:result.mission,
    tasks:result.tasks,
    attempts:result.attempts,
    orchestrator_events:result.events,
    artifact_events:workspace.events({mission_id:result.mission.mission_id}),
    created_at:created_at||result.mission.updated_at,
  });
  return Object.freeze({
    schema:1,
    mission_id:result.mission.mission_id,
    artifact_refs:Object.freeze(stored.map((x)=>x.artifact_ref)),
    replay,
  });
}
