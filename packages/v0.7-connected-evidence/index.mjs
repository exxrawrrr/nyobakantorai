import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createApprovalRequest,
  decideApprovalRequest,
  authorizeWithApproval,
  createRecurringSchedule,
  materializeScheduledMission,
} from "../scheduler-approval-center/index.mjs";
import {
  createConnectorConnection,
  transitionConnectorConnection,
  createConnectorGrant,
  authorizeConnectorAction,
} from "../connector-center/index.mjs";

const rootDefault=resolve(import.meta.dirname,"../..");

function assert(condition,message){ if(!condition) throw new Error(message); }
const clean=(v)=>String(v??"").trim();
const validTime=(v)=>Boolean(clean(v))&&!Number.isNaN(Date.parse(v));

async function readJson(root,path){
  return JSON.parse(await readFile(resolve(root,path),"utf8"));
}

function assessReadOnlyObservations(config){
  const items=Array.isArray(config.read_only_observations)?config.read_only_observations:[];
  const providers=new Set(items.map((item)=>clean(item.provider)));
  const errors=[];
  if(items.length<2) errors.push("At least two live read-only connector observations are required.");
  if(providers.size<2) errors.push("Read-only connector observations must cover at least two providers.");
  for(const item of items){
    if(!item.live_observed) errors.push(item.id+": live_observed must be true.");
    if(!clean(item.user_owned_scope)) errors.push(item.id+": user_owned_scope required.");
    if(!clean(item.operation)) errors.push(item.id+": operation required.");
    if(item.raw_private_payload_committed!==false) errors.push(item.id+": raw private payload must not be committed.");
    if(item.provider==="google-drive"){
      if(item.filenames_committed!==false) errors.push(item.id+": Drive filenames must not be committed.");
      if(item.file_ids_committed!==false) errors.push(item.id+": Drive file IDs must not be committed.");
    }
  }
  return Object.freeze({
    status:errors.length?"BLOCKED":"PASS",
    observed_count:items.length,
    distinct_provider_count:providers.size,
    providers:Object.freeze([...providers].sort()),
    errors:Object.freeze(errors),
  });
}

function buildWriteEvidence(config){
  const flow=config.write_flow||{};
  const approval=flow.approval||{};
  const execution=flow.execution||{};
  const evidenceRefs=[
    "git-commit:"+clean(approval.plan_commit),
    "chat22:preview:"+clean(flow.id),
  ];
  const request=createApprovalRequest({
    schema:1,
    approval_id:"chat22-"+clean(flow.id),
    target:{type:"CONNECTED_WRITE",id:clean(flow.id)},
    risk_class:"EXTERNAL_WRITE",
    budget:{hard_limit_amount:0,currency:"USD"},
    reason:"Execute one bounded, reversible connected-office write for CHAT 22 release evidence.",
    evidence_refs:evidenceRefs,
    preview:clean(flow.preview?.title)+"\n\n"+clean(flow.preview?.body),
    scope:approval.scope,
    requested_at:approval.requested_at,
    expires_at:approval.expires_at,
  });
  const decision=decideApprovalRequest(request,{
    actor:approval.actor,
    decision:approval.decision,
    decided_at:approval.decided_at,
    evidence_ref:approval.evidence_ref,
  });
  assert(clean(approval.plan_commit).length===40,"Write approval plan commit must be a full Git SHA.");
  assert(validTime(approval.plan_commit_at),"Write approval plan commit timestamp invalid.");
  assert(validTime(execution.created_at)&&validTime(execution.closed_at),"Write execution timestamps invalid.");
  assert(Date.parse(approval.plan_commit_at)<Date.parse(execution.created_at),"Approval plan commit must precede external write.");
  assert(Date.parse(execution.created_at)<=Date.parse(execution.closed_at),"Write close time must not precede create time.");
  const createAuth=authorizeWithApproval(request,decision,{
    action:"create_issue",
    resource:flow.resource,
    at:execution.created_at,
  });
  const closeAuth=authorizeWithApproval(request,decision,{
    action:"close_issue",
    resource:flow.resource,
    at:execution.closed_at,
  });
  const verified=
    flow.execution_state==="PASS" &&
    flow.verification_state==="PASS" &&
    createAuth.allowed &&
    closeAuth.allowed &&
    Number.isInteger(execution.issue_number) &&
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(clean(execution.issue_url)) &&
    execution.final_state==="closed" &&
    execution.state_reason==="completed" &&
    execution.author_association==="OWNER" &&
    execution.direct_readback===true &&
    clean(execution.performed_via)==="chatgpt-codex-connector";
  return Object.freeze({
    status:verified?"PASS":"BLOCKED",
    approval_ref:request.approval_ref,
    decision_ref:decision.decision_ref,
    create_authorized:createAuth.allowed,
    close_authorized:closeAuth.allowed,
    issue_number:execution.issue_number??null,
    issue_url:clean(execution.issue_url)||null,
    final_state:execution.final_state??null,
    direct_readback:execution.direct_readback===true,
    approval_preceded_execution:Date.parse(approval.plan_commit_at)<Date.parse(execution.created_at),
  });
}

function buildScheduledMissionEvidence(config,costPolicy){
  const observationIds=(config.read_only_observations||[]).map((item)=>clean(item.id)).filter(Boolean).sort();
  const schedule=createRecurringSchedule({
    schema:1,
    schedule_id:"chat22-connected-read-briefing",
    objective:"Summarize the sanitized CHAT 22 user-owned connector observations.",
    state:"ACTIVE",
    cadence:{frequency:"DAILY",interval:1,days_of_week:[]},
    time_window:{start:"14:00",end:"15:00",timezone:"Asia/Jakarta"},
    budget:{hard_limit_amount:0.25,currency:"USD"},
    risk_class:"READ_ONLY",
    constraints:[
      "Use only sanitized committed connector observations.",
      "Do not fetch additional private file content.",
      "Do not publish externally."
    ],
    required_evidence:observationIds,
    work_items:[{
      key:"connected-read-brief",
      title:"Connected read briefing",
      objective:"Summarize sanitized GitHub and Google Drive connector observations.",
      assigned_id:"siti",
      required_skills:["verification"],
      required_evidence:observationIds,
      risk_class:"READ_ONLY",
      depends_on:[],
    }],
    created_at:"2026-10-02T07:38:30.000Z",
    starts_at:"2026-10-02T07:38:30.000Z",
    expires_at:"2026-10-03T07:38:30.000Z",
    max_runs:1,
  });
  const result=materializeScheduledMission({
    schedule,
    at:"2026-10-02T07:39:00.000Z",
    previousRuns:[],
    costPolicy,
    costLedger:[],
    estimatedCost:{status:"KNOWN",amount:0.05,currency:"USD"},
    projectId:"connected-office-chat22",
    idFactory:(kind,index,label)=>kind+"-"+String(index+1).padStart(3,"0")+"-"+String(label).replace(/[^a-z0-9]+/gi,"-").toLowerCase(),
  });
  const pass=
    result.dispatched===true &&
    result.reason==="NORMAL_MISSION_ENGINE" &&
    result.cost_decision?.action==="ALLOW" &&
    result.mission_plan?.mission?.state==="PLANNED" &&
    result.mission_plan?.mission?.autonomy?.mode==="GUARDED" &&
    observationIds.every((id)=>result.mission_plan.mission.required_evidence.includes(id));
  return Object.freeze({
    status:pass?"PASS":"BLOCKED",
    schedule_ref:schedule.schedule_ref,
    run_ref:result.run?.run_ref??null,
    mission_id:result.run?.mission_id??null,
    cost_decision_ref:result.cost_decision?.decision_ref??null,
    dispatch_reason:result.reason,
    mission_state:result.mission_plan?.mission?.state??null,
    autonomy_mode:result.mission_plan?.mission?.autonomy?.mode??null,
    live_connector_observations_bound:observationIds,
    production_daemon_delivery_claim:false,
  });
}

function buildRevocationEvidence(registry){
  const resource={resource_type:"google_ads_customer",resource_id:"customers/chat22-evidence"};
  const initial=createConnectorConnection({
    registry,
    connectionId:"chat22-revocation-connection",
    connectorId:"google-ads-readonly",
  });
  const connected=transitionConnectorConnection(initial,"CONNECT",{
    registry,
    at:"2026-10-02T07:38:20.000Z",
    evidenceRef:"chat22:application-revocation:connect",
    credentialRef:"connector-secret://chat22/google-ads-readonly",
    expiresAt:"2026-10-03T07:38:20.000Z",
  });
  const grant=createConnectorGrant({
    schema:1,
    grant_id:"chat22-revocation-grant",
    employee_id:"gugun",
    connector_id:"google-ads-readonly",
    capability_id:"ads.google.read",
    access_modes:["READ"],
    actions:["list-campaigns"],
    resources:[resource],
    issued_at:"2026-10-02T07:38:20.000Z",
    expires_at:"2026-10-03T07:38:20.000Z",
    evidence_ref:"chat22:application-revocation:grant",
  },{registry});
  const before=authorizeConnectorAction({
    registry,connections:[connected],grants:[grant],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource,now:"2026-10-02T07:38:30.000Z",
  });
  const revoked=transitionConnectorConnection(connected,"REVOKE",{
    registry,
    at:"2026-10-02T07:38:40.000Z",
    evidenceRef:"chat22:application-revocation:revoke",
  });
  const after=authorizeConnectorAction({
    registry,connections:[connected,revoked],grants:[grant],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource,now:"2026-10-02T07:38:50.000Z",
  });
  const pass=before.allowed===true&&revoked.state==="REVOKED"&&after.allowed===false&&after.reason==="CONNECTOR_REVOKED";
  return Object.freeze({
    status:pass?"PASS":"BLOCKED",
    pre_revocation_allowed:before.allowed,
    revoked_state:revoked.state,
    post_revocation_allowed:after.allowed,
    post_revocation_reason:after.reason,
    provider_credential_revocation_claim:false,
    boundary:"This proves Connector Center application-level revocation blocks future routing. It does not claim the upstream provider credential itself was revoked.",
  });
}

export function assessV07ConnectedEvidenceInputs({config,costPolicy,registry}={}){
  assert(config?.schema===1&&config.candidate==="v0.7.0"&&config.chat==="CHAT22","v0.7 connected evidence identity invalid.");
  const readOnly=assessReadOnlyObservations(config);
  const write=buildWriteEvidence(config);
  const scheduled=buildScheduledMissionEvidence(config,costPolicy);
  const revocation=buildRevocationEvidence(registry);
  const browserState=clean(config.browser_evidence?.state);
  const browser=Object.freeze({
    status:browserState==="PASS"?"PASS":"BLOCKED",
    state:browserState||"MISSING",
    reason:clean(config.browser_evidence?.reason)||null,
  });
  const components=Object.freeze({
    READ_ONLY_USER_OWNED_CONNECTORS:readOnly.status,
    SCOPED_WRITE_FLOW:write.status,
    CONNECTOR_REVOCATION:revocation.status,
    SCHEDULED_MISSION:scheduled.status,
    LIVE_BROWSER:browser.status,
  });
  const blockers=Object.freeze(Object.entries(components).filter(([,status])=>status!=="PASS").map(([id])=>id));
  return Object.freeze({
    ok:true,
    candidate:"v0.7.0",
    connected_office_decision:blockers.length?"BLOCKED":"PASS",
    components,
    blockers,
    read_only:readOnly,
    write,
    revocation,
    scheduled,
    browser,
    provider_lifecycle_claim:blockers.length?"PARTIAL":"LIVE_EVIDENCE_SUPPORTED",
    claim_boundary:Object.freeze({
      external_read_observations_are_runtime_grants:false,
      provider_credential_revocation_claim:false,
      production_scheduler_daemon_claim:false,
      browser_live_claim:browser.status==="PASS",
    }),
  });
}

export async function assessV07ConnectedEvidence({root=rootDefault}={}){
  const [config,costPolicy,registry]=await Promise.all([
    readJson(root,"config/v0.7-connected-live-evidence.json"),
    readJson(root,"config/cost-governor-policy.json"),
    readJson(root,"config/connector-registry.json"),
  ]);
  return assessV07ConnectedEvidenceInputs({config,costPolicy,registry});
}
