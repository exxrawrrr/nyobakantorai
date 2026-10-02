import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { planMission } from "../mission-engine/planner.mjs";
import { executeMissionPlan } from "../mission-engine/orchestrator.mjs";
import {
  archiveMissionRun,
  createArtifactWorkspace,
  reconstructTimeline,
  validateReplayStream,
} from "./index.mjs";
import { createDirectoryArtifactStorage } from "./node-storage.mjs";

const root=new URL("../../",import.meta.url);
const runtimePolicy=JSON.parse(await readFile(new URL("config/runtime-execution-policy.json",root),"utf8"));
const stamp=(n)=>"2026-10-02T04:00:0"+n+".000Z";
function tickingClock(){
  let i=0;
  return ()=>stamp(Math.min(i++,9));
}
const ids=(kind,index,label)=>(kind==="task"?"tnode":kind)+"-artifact-"+(index+1)+"-"+String(label).replace(/[^a-z0-9]+/gi,"-").toLowerCase();

function adapter(taskId){
  return defineRuntimeExecutionAdapter({
    id:"artifact-replay-fixture",
    version:"1.0.0",
    runtime:{provider:"fixture-runtime",runtime_ref:"fixture:"+taskId,provider_version:"1.0"},
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare(){
      return {workspace:{kind:"TEMPORARY",ref:"tmp://"+taskId,isolated:true,production_repo:false},session_ref:"session:"+taskId};
    },
    async executeBoundedTask(){
      return {text:"fixture report for "+taskId};
    },
    async normalizeResult(){
      return {
        schema:1,
        state:"SUCCEEDED",
        summary:"Fixture completed.",
        output:{report:"fixture report"},
        artifact_refs:["artifact:runtime-source-"+taskId],
        evidence_refs:["evidence:"+taskId+":normalized"],
      };
    },
    async collectEvidence(){
      return {
        schema:1,
        raw_result_ref:"artifact:"+taskId+":raw",
        normalized_result_ref:"artifact:"+taskId+":normalized",
        capabilities_used:["model_inference","temporary_workspace","evidence_collection"],
        workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
        prohibited_action_check:{passed:true,observed:[]},
        runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},
        evidence_refs:["evidence:"+taskId+":runtime"],
        artifact_refs:["artifact:"+taskId+":raw","artifact:"+taskId+":normalized"],
      };
    },
    async cleanup(){ return {ok:true}; },
  });
}

test("real Mission Engine result archives into durable workspace and canonical replay",async()=>{
  const plan=planMission({
    objective:"Produce and archive a bounded fixture report.",
    risk_class:"READ_ONLY",
    constraints:["no external writes"],
    work_items:[
      {key:"report",title:"Produce report",objective:"Produce one bounded report.",assigned_id:"alex",depends_on:[]},
    ],
  },{clock:()=>stamp(0),idFactory:ids});

  const clock=tickingClock();
  const result=await executeMissionPlan(plan,{
    resolveRuntime:async({task})=>({
      adapter:adapter(task.task_id),
      policy:runtimePolicy,
      required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
      unknowns:["fixture runtime"],
      residual_risks:[],
    }),
    clock,
  });

  assert.equal(result.mission.state,"SUCCEEDED");
  assert.equal(result.attempts.length,1);
  const task=result.tasks[0];
  const attempt=result.attempts[0];
  assert.ok(attempt.artifact_refs.length>=1);

  const dir=mkdtempSync(join(tmpdir(),"nyobakantorai-mission-archive-"));
  try{
    const workspace=createArtifactWorkspace({
      storage:createDirectoryArtifactStorage(dir),
      clock:()=>stamp(8),
    });
    const archive=archiveMissionRun({
      workspace,
      result,
      artifacts:[
        {
          artifact_id:"mission-report",
          artifact_type:"REPORT",
          media_type:"text/markdown",
          payload:{encoding:"utf8",data:"# Archived Report\n\nFixture mission output.\n"},
          ownership:{
            mission_id:result.mission.mission_id,
            task_id:task.task_id,
            attempt_id:attempt.attempt_id,
            employee_id:task.employee_id,
          },
          provenance:{
            source_kind:"RUNTIME",
            source_refs:[...attempt.artifact_refs],
            created_by:task.employee_id,
          },
        },
        {
          artifact_id:"mission-evidence",
          artifact_type:"EVIDENCE",
          media_type:"application/json",
          payload:{encoding:"utf8",data:JSON.stringify({evidence_refs:attempt.evidence_refs})},
          ownership:{
            mission_id:result.mission.mission_id,
            task_id:task.task_id,
            attempt_id:attempt.attempt_id,
            employee_id:task.employee_id,
          },
          provenance:{
            source_kind:"DERIVED",
            source_refs:[...attempt.evidence_refs],
            created_by:"system:archive",
          },
        },
      ],
      created_at:result.mission.updated_at,
    });

    assert.equal(archive.artifact_refs.length,2);
    assert.equal(validateReplayStream(archive.replay),true);
    assert.equal(workspace.verify().record_count,2);

    const timeline=reconstructTimeline(archive.replay);
    assert.ok(timeline.some((row)=>row.kind==="MISSION_READY"));
    assert.ok(timeline.some((row)=>row.kind==="TASK_RUNNING"));
    assert.ok(timeline.some((row)=>row.kind==="HANDOFF_RETURNED"));
    assert.ok(timeline.some((row)=>row.kind==="MISSION_SETTLED"));
    assert.equal(timeline.filter((row)=>row.kind==="ARTIFACT_VERSION_STORED").length,2);

    const reopened=createArtifactWorkspace({storage:createDirectoryArtifactStorage(dir)});
    assert.equal(reopened.verify().record_count,2);
    assert.equal(reopened.read(archive.artifact_refs[0]).record.ownership.attempt_id,attempt.attempt_id);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
