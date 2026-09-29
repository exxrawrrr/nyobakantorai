import { WORKFORCE } from "../../lib/workforce.mjs";
import {
  createEmptyRegistry,
  createTask,
  recordApproval,
  updateTask,
} from "../../packages/task-registry/registry.mjs";

const workers=WORKFORCE.slice(0,16);
const results=[];

function makeClock(index) {
  let n=0;
  return () => `2026-09-29T05:${String(index).padStart(2,"0")}:${String(n++).padStart(2,"0")}.000Z`;
}
function makeIds(index) {
  let n=0;
  return (prefix)=>`${prefix}-personality-${index}-${++n}`;
}
function rejected(fn, pattern) {
  try {
    fn();
    return false;
  } catch (error) {
    return pattern.test(String(error?.message || error));
  }
}

for (let index=0; index<workers.length; index++) {
  const worker=workers[index];
  const clock=makeClock(index);
  const ids=makeIds(index);
  let registry=createTask(createEmptyRegistry(clock),{
    title:"Same high-impact invariance task",
    assignee_id:worker.id,
    requester:"eval",
    risk_class:"EXTERNAL_WRITE",
  },clock,ids);
  const taskId=registry.tasks[0].id;
  registry=updateTask(registry,taskId,{lifecycle_status:"REQUESTED",actor:"owner"},clock,ids);

  const approvalBlocked=rejected(
    ()=>updateTask(registry,taskId,{lifecycle_status:"IN_PROGRESS",actor:worker.id},clock,ids),
    /Owner approval required/
  );

  registry=recordApproval(registry,taskId,{
    status:"APPROVED",
    actor:"owner",
    evidence_ref:`approval://personality/${worker.id}`,
  },clock,ids);
  registry=updateTask(registry,taskId,{lifecycle_status:"IN_PROGRESS",actor:worker.id},clock,ids);
  registry=updateTask(registry,taskId,{lifecycle_status:"COMPLETED",actor:worker.id},clock,ids);

  const selfVerifyBlocked=rejected(
    ()=>updateTask(registry,taskId,{
      lifecycle_status:"VERIFIED",
      actor:worker.id,
      evidence_ref:`test://personality/${worker.id}/self`,
    },clock,ids),
    /cannot independently verify its own work/
  );

  const reviewer=worker.verification_policy?.reviewer_candidates?.find((id)=>id!==worker.id);
  const missingEvidenceBlocked=Boolean(reviewer) && rejected(
    ()=>updateTask(registry,taskId,{
      lifecycle_status:"VERIFIED",
      actor:reviewer,
    },clock,ids),
    /membutuhkan evidence/
  );

  let independentVerification=false;
  if (reviewer) {
    const verified=updateTask(registry,taskId,{
      lifecycle_status:"VERIFIED",
      actor:reviewer,
      evidence_ref:`test://personality/${worker.id}/independent`,
    },clock,ids);
    independentVerification=verified.tasks.find((task)=>task.id===taskId)?.lifecycle_status==="VERIFIED";
  }

  const passed=approvalBlocked && selfVerifyBlocked && missingEvidenceBlocked && independentVerification;
  results.push({
    employee_id:worker.id,
    passed,
    false_success:!passed,
    checks:{
      approval_required_before_execution:approvalBlocked,
      self_verification_rejected:selfVerifyBlocked,
      evidence_required_for_verification:missingEvidenceBlocked,
      independent_verification_succeeds:independentVerification,
    },
  });
}

const fingerprints=workers.map((worker)=>JSON.stringify(worker.personality?.dialogue_profile || {}));
const distinctFingerprints=new Set(fingerprints).size===workers.length;
if (!distinctFingerprints) {
  results.push({
    employee_id:"__fingerprints__",
    passed:false,
    false_success:true,
    checks:{distinct_dialogue_fingerprints:false},
  });
}

const falseSuccesses=results.filter((item)=>item.false_success);
const summary={
  schema:1,
  benchmark:"deterministic-personality-policy-invariance",
  deterministic:true,
  live_model_claim:false,
  semantic_accuracy_claim:false,
  workers:workers.length,
  passed:results.filter((item)=>item.passed).length,
  failed:results.filter((item)=>!item.passed).length,
  false_successes:falseSuccesses.length,
  false_success_rate:results.length?falseSuccesses.length/results.length:0,
  results,
};

console.log(JSON.stringify(summary,null,2));
if (process.argv.includes("--check") && summary.failed>0) process.exitCode=1;
