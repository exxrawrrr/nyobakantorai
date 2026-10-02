import { createHash } from "node:crypto";
import { planMission, normalizeMissionPlan } from "../mission-engine/planner.mjs";
import { assessCostAdmission, normalizeCostPolicy } from "../cost-governor/index.mjs";

export const SCHEDULER_APPROVAL_API=1;
export const SCHEDULE_STATES=Object.freeze(["ACTIVE","PAUSED","REVOKED","EXPIRED"]);
export const APPROVAL_DECISIONS=Object.freeze(["APPROVED","EDITED","REJECTED"]);
const clean=(v,max=4000)=>String(v??"").trim().slice(0,max);
const uniq=(a,max=1000)=>Object.freeze([...new Set((Array.isArray(a)?a:[]).map(x=>clean(x,max)).filter(Boolean))]);
const sortedUniq=(a,max=1000)=>Object.freeze([...uniq(a,max)].sort((x,y)=>x.localeCompare(y)));
function assert(c,m){if(!c)throw new Error(m);}
function validTime(v){return typeof v==="string"&&v.trim()&&!Number.isNaN(Date.parse(v));}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function ref(kind,v){return kind+":sha256:"+createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}

function normalizeBudget(input={}){
  const amount=input.hard_limit_amount==null?null:Number(input.hard_limit_amount);
  const currency=input.currency==null?null:clean(input.currency,3).toUpperCase();
  if(amount==null) assert(currency==null,"Schedule budget currency must be null without hard limit.");
  else {assert(Number.isFinite(amount)&&amount>=0,"Schedule budget hard limit must be non-negative.");assert(/^[A-Z]{3}$/.test(currency||""),"Schedule budget currency required.");}
  return Object.freeze({hard_limit_amount:amount,currency});
}

function schedulePayload(x){return Object.freeze({
  schema:1,schedule_id:x.schedule_id,objective:x.objective,state:x.state,
  cadence:x.cadence,time_window:x.time_window,budget:x.budget,risk_class:x.risk_class,
  constraints:x.constraints,required_evidence:x.required_evidence,work_items:x.work_items,
  created_at:x.created_at,starts_at:x.starts_at,expires_at:x.expires_at,max_runs:x.max_runs,
});}

export function createRecurringSchedule(input={}){
  assert(input?.schema===1,"Schedule schema must be 1.");
  const id=clean(input.schedule_id,160),objective=clean(input.objective,4000);
  assert(id&&objective,"Schedule id and objective are required.");
  const state=clean(input.state||"ACTIVE",30).toUpperCase();
  assert(SCHEDULE_STATES.includes(state),"Schedule state invalid.");
  const cadence=input.cadence||{};
  const frequency=clean(cadence.frequency,20).toUpperCase();
  assert(["DAILY","WEEKLY"].includes(frequency),"Schedule frequency must be DAILY or WEEKLY.");
  const interval=Number(cadence.interval??1); assert(Number.isInteger(interval)&&interval>=1&&interval<=30,"Schedule interval invalid.");
  const days=uniq(cadence.days_of_week||[],20);
  if(frequency==="WEEKLY") assert(days.length>0&&days.every(d=>["MO","TU","WE","TH","FR","SA","SU"].includes(d)),"Weekly schedule requires valid days.");
  const window=input.time_window||{};
  const start=clean(window.start,5),end=clean(window.end,5),tz=clean(window.timezone||"UTC",80);
  assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(start)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(end),"Schedule time window must be HH:MM.");
  assert(start<end,"Schedule time window start must precede end.");
  assert(tz,"Schedule timezone required.");
  const created=clean(input.created_at,80),starts=clean(input.starts_at||input.created_at,80),expires=input.expires_at==null?null:clean(input.expires_at,80);
  assert(validTime(created)&&validTime(starts),"Schedule created_at/starts_at invalid.");
  if(expires!=null) assert(validTime(expires)&&Date.parse(expires)>Date.parse(starts),"Schedule expires_at invalid.");
  const maxRuns=input.max_runs==null?null:Number(input.max_runs);
  if(maxRuns!=null) assert(Number.isInteger(maxRuns)&&maxRuns>=1,"Schedule max_runs invalid.");
  const out={
    schema:1,schedule_id:id,objective,state,
    cadence:Object.freeze({frequency,interval,days_of_week:days}),
    time_window:Object.freeze({start,end,timezone:tz}),
    budget:normalizeBudget(input.budget||{}),
    risk_class:clean(input.risk_class||"READ_ONLY",40).toUpperCase(),
    constraints:uniq(input.constraints),
    required_evidence:uniq(input.required_evidence),
    work_items:Object.freeze(structuredClone(Array.isArray(input.work_items)?input.work_items:[])),
    created_at:new Date(created).toISOString(),
    starts_at:new Date(starts).toISOString(),
    expires_at:expires==null?null:new Date(expires).toISOString(),
    max_runs:maxRuns,
  };
  return Object.freeze({...out,schedule_ref:ref("schedule",schedulePayload(out))});
}

function zonedParts(date,timeZone){
  let parts;
  try{
    parts=new Intl.DateTimeFormat("en-CA",{
      timeZone,year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23",weekday:"short",
    }).formatToParts(date);
  }catch{
    throw new Error("Schedule timezone is invalid.");
  }
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const weekdayMap={Sun:"SU",Mon:"MO",Tue:"TU",Wed:"WE",Thu:"TH",Fri:"FR",Sat:"SA"};
  return Object.freeze({
    date:map.year+"-"+map.month+"-"+map.day,
    hhmm:map.hour+":"+map.minute,
    weekday:weekdayMap[map.weekday],
  });
}
function calendarDayNumber(dateString){
  const [y,m,d]=dateString.split("-").map(Number);
  return Math.floor(Date.UTC(y,m-1,d)/86400000);
}

export function assessScheduleTrigger(scheduleInput,{at,previousRuns=[]}={}){
  const s=createRecurringSchedule(scheduleInput);
  assert(validTime(at),"Schedule trigger at invalid.");
  const t=new Date(at);
  if(s.state!=="ACTIVE") return Object.freeze({due:false,reason:"SCHEDULE_"+s.state});
  if(Date.parse(at)<Date.parse(s.starts_at)) return Object.freeze({due:false,reason:"SCHEDULE_NOT_STARTED"});
  if(s.expires_at&&Date.parse(at)>=Date.parse(s.expires_at)) return Object.freeze({due:false,reason:"SCHEDULE_EXPIRED"});
  if(s.max_runs!=null&&previousRuns.length>=s.max_runs) return Object.freeze({due:false,reason:"SCHEDULE_MAX_RUNS_REACHED"});
  const local=zonedParts(t,s.time_window.timezone);
  const startLocal=zonedParts(new Date(s.starts_at),s.time_window.timezone);
  const dayDelta=calendarDayNumber(local.date)-calendarDayNumber(startLocal.date);
  if(dayDelta<0) return Object.freeze({due:false,reason:"SCHEDULE_NOT_STARTED"});
  if(local.hhmm<s.time_window.start||local.hhmm>=s.time_window.end) return Object.freeze({due:false,reason:"OUTSIDE_TIME_WINDOW"});
  if(s.cadence.frequency==="DAILY"&&dayDelta%s.cadence.interval!==0) return Object.freeze({due:false,reason:"CADENCE_INTERVAL_MISMATCH"});
  if(s.cadence.frequency==="WEEKLY"){
    if(!s.cadence.days_of_week.includes(local.weekday)) return Object.freeze({due:false,reason:"CADENCE_DAY_MISMATCH"});
    const weekDelta=Math.floor(dayDelta/7);
    if(weekDelta%s.cadence.interval!==0) return Object.freeze({due:false,reason:"CADENCE_INTERVAL_MISMATCH"});
  }
  if(previousRuns.some(r=>{
    if(!validTime(r?.triggered_at)) return false;
    return zonedParts(new Date(r.triggered_at),s.time_window.timezone).date===local.date;
  })) return Object.freeze({due:false,reason:"ALREADY_TRIGGERED_THIS_DAY"});
  return Object.freeze({due:true,reason:"DUE",local_date:local.date,local_time:local.hhmm,timezone:s.time_window.timezone});
}

export function materializeScheduledMission({
  schedule:scheduleInput,at,previousRuns=[],costPolicy,costLedger=[],estimatedCost,projectId=null,approvalRef=null,idFactory,
}={}){
  const schedule=createRecurringSchedule(scheduleInput);
  const trigger=assessScheduleTrigger(schedule,{at,previousRuns});
  if(!trigger.due) return Object.freeze({dispatched:false,reason:trigger.reason,schedule_ref:schedule.schedule_ref});
  const stamp=new Date(at).toISOString().replace(/[-:.TZ]/g,"").slice(0,14);
  const missionId="scheduled-"+schedule.schedule_id+"-"+stamp;
  const policy=normalizeCostPolicy(costPolicy);
  const cost=assessCostAdmission({
    policy,ledger:costLedger,
    context:{at,project_id:projectId,mission_id:missionId,mission_budget:schedule.budget},
    estimate:estimatedCost,approval_ref:approvalRef,
  });
  if(!["ALLOW","WARN"].includes(cost.action)){
    return Object.freeze({dispatched:false,reason:"COST_"+cost.action,schedule_ref:schedule.schedule_ref,cost_decision:cost});
  }
  const plan=planMission({
    mission_id:missionId,
    objective:schedule.objective,
    constraints:[...schedule.constraints,"scheduled_from:"+schedule.schedule_ref,"triggered_at:"+new Date(at).toISOString()],
    required_evidence:schedule.required_evidence,
    risk_class:schedule.risk_class,
    budget:schedule.budget,
    autonomy:{mode:"GUARDED",delegated_capabilities:[]},
    work_items:schedule.work_items,
  },{
    clock:()=>new Date(at).toISOString(),
    ...(idFactory?{idFactory}:{}),
  });
  normalizeMissionPlan(plan);
  const run={schema:1,run_id:"run-"+missionId,schedule_ref:schedule.schedule_ref,triggered_at:new Date(at).toISOString(),mission_id:plan.mission.mission_id,mission_plan_generated_at:plan.generated_at,cost_decision_ref:cost.decision_ref};
  return Object.freeze({dispatched:true,reason:"NORMAL_MISSION_ENGINE",schedule_ref:schedule.schedule_ref,cost_decision:cost,run:Object.freeze({...run,run_ref:ref("schedule-run",run)}),mission_plan:plan});
}

function approvalPayload(x){return Object.freeze({
  schema:1,approval_id:x.approval_id,target:x.target,risk_class:x.risk_class,budget:x.budget,
  reason:x.reason,evidence_refs:x.evidence_refs,preview:x.preview,scope:x.scope,
  requested_at:x.requested_at,expires_at:x.expires_at,status:x.status,
});}

export function createApprovalRequest(input={}){
  assert(input?.schema===1,"Approval request schema must be 1.");
  const approvalId=clean(input.approval_id,160); assert(approvalId,"approval_id required.");
  const target=input.target||{}; const targetType=clean(target.type,80).toUpperCase(),targetId=clean(target.id,240);
  assert(targetType&&targetId,"Approval target type/id required.");
  const risk=clean(input.risk_class,40).toUpperCase(); assert(risk,"Approval risk_class required.");
  const reason=clean(input.reason,4000); assert(reason,"Approval reason required.");
  const evidence=uniq(input.evidence_refs); assert(evidence.length>0,"Approval evidence_refs required.");
  const preview=clean(input.preview,8000); assert(preview,"Approval preview required.");
  const scope=input.scope||{};
  const actions=sortedUniq(scope.actions,160); const resources=sortedUniq(scope.resources,500);
  assert(actions.length>0&&resources.length>0,"Approval scope actions/resources required.");
  assert(!resources.some(r=>r==="*"||r.includes("*")),"Approval scope wildcard resources forbidden.");
  const requested=clean(input.requested_at,80),expires=clean(input.expires_at,80);
  assert(validTime(requested)&&validTime(expires)&&Date.parse(expires)>Date.parse(requested),"Approval timestamps invalid.");
  const out={
    schema:1,approval_id:approvalId,
    target:Object.freeze({type:targetType,id:targetId}),
    risk_class:risk,budget:normalizeBudget(input.budget||{}),reason,evidence_refs:evidence,preview,
    scope:Object.freeze({actions,resources}),
    requested_at:new Date(requested).toISOString(),expires_at:new Date(expires).toISOString(),status:"PENDING",
  };
  return Object.freeze({...out,approval_ref:ref("approval-request",approvalPayload(out))});
}

function decisionPayload(x){return Object.freeze({
  schema:1,approval_ref:x.approval_ref,decision:x.decision,actor:x.actor,decided_at:x.decided_at,
  expires_at:x.expires_at,scope:x.scope,edited_preview:x.edited_preview,evidence_ref:x.evidence_ref,
});}

export function decideApprovalRequest(request,decision={}){
  const expected=createApprovalRequest({...request,status:undefined});
  assert(expected.approval_ref===request.approval_ref,"Approval request checksum mismatch.");
  const actor=clean(decision.actor,80).toLowerCase(); assert(actor==="owner","Only owner may decide approval.");
  const d=clean(decision.decision,20).toUpperCase(); assert(APPROVAL_DECISIONS.includes(d),"Approval decision invalid.");
  const at=clean(decision.decided_at,80); assert(validTime(at),"Approval decision timestamp invalid.");
  assert(Date.parse(at)>=Date.parse(expected.requested_at)&&Date.parse(at)<Date.parse(expected.expires_at),"Approval decision outside request validity.");
  const evidenceRef=clean(decision.evidence_ref,1000); assert(/^[a-z][a-z0-9+.-]*:/i.test(evidenceRef),"Approval decision evidence_ref required.");
  const nextScope=decision.scope?{actions:sortedUniq(decision.scope.actions,160),resources:sortedUniq(decision.scope.resources,500)}:expected.scope;
  assert(nextScope.actions.length>0&&nextScope.resources.length>0,"Approval decision scope required.");
  assert(!nextScope.resources.some(r=>r==="*"||r.includes("*")),"Approval decision wildcard resources forbidden.");
  assert(nextScope.actions.every(a=>expected.scope.actions.includes(a)),"Edited approval cannot expand action scope.");
  assert(nextScope.resources.every(r=>expected.scope.resources.includes(r)),"Edited approval cannot expand resource scope.");
  const expires=decision.expires_at==null?expected.expires_at:clean(decision.expires_at,80);
  assert(validTime(expires)&&Date.parse(expires)>Date.parse(at)&&Date.parse(expires)<=Date.parse(expected.expires_at),"Approval decision expiry cannot exceed request expiry.");
  const editedPreview=d==="EDITED"?clean(decision.edited_preview,8000):null;
  if(d==="EDITED") assert(editedPreview,"EDITED approval requires edited_preview.");
  const payload={
    schema:1,approval_ref:expected.approval_ref,decision:d,actor:"owner",decided_at:new Date(at).toISOString(),
    expires_at:new Date(expires).toISOString(),scope:Object.freeze(nextScope),edited_preview:editedPreview,
    evidence_ref:evidenceRef,
  };
  return Object.freeze({...payload,decision_ref:ref("approval-decision",decisionPayload(payload))});
}

export function authorizeWithApproval(request,decision,{action,resource,at}={}){
  const expected=createApprovalRequest({...request,status:undefined});
  assert(expected.approval_ref===request.approval_ref,"Approval request checksum mismatch.");
  const d=decideApprovalRequest(request,decision);
  assert(validTime(at),"Approval authorization time invalid.");
  if(d.decision==="REJECTED") return Object.freeze({allowed:false,reason:"APPROVAL_REJECTED",approval_ref:request.approval_ref,decision_ref:d.decision_ref});
  if(Date.parse(at)>=Date.parse(d.expires_at)) return Object.freeze({allowed:false,reason:"APPROVAL_EXPIRED",approval_ref:request.approval_ref,decision_ref:d.decision_ref});
  const a=clean(action,160),r=clean(resource,500);
  if(!d.scope.actions.includes(a)||!d.scope.resources.includes(r)) return Object.freeze({allowed:false,reason:"APPROVAL_SCOPE_MISMATCH",approval_ref:request.approval_ref,decision_ref:d.decision_ref});
  return Object.freeze({allowed:true,reason:"SCOPED_APPROVAL_VALID",approval_ref:request.approval_ref,decision_ref:d.decision_ref,evidence_ref:d.evidence_ref,expires_at:d.expires_at});
}

export function morningBriefingFixture(){
  return createRecurringSchedule({
    schema:1,schedule_id:"morning-briefing",objective:"Prepare a morning briefing from verified overnight updates.",
    state:"ACTIVE",cadence:{frequency:"DAILY",interval:1,days_of_week:[]},
    time_window:{start:"07:00",end:"09:00",timezone:"Asia/Jakarta"},
    budget:{hard_limit_amount:1.5,currency:"USD"},risk_class:"READ_ONLY",
    constraints:["Do not publish externally.","Use only evidence-backed updates."],
    required_evidence:["briefing-source-evidence"],
    work_items:[{key:"brief",title:"Morning briefing",objective:"Summarize verified overnight updates.",assigned_id:"siti",required_skills:["verification"],required_evidence:["briefing-source-evidence"],risk_class:"READ_ONLY",depends_on:[]}],
    created_at:"2026-10-02T00:00:00.000Z",starts_at:"2026-10-02T00:00:00.000Z",expires_at:"2026-12-31T23:59:59.000Z",max_runs:90,
  });
}
