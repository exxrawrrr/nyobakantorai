import { assert,clean,contentRef,freeze,iso,normalizedText,uniq } from "../geo-intelligence/common.mjs";
import { createSearchExpansionPlan,validateExpansionPlan } from "../geo-intelligence/index.mjs";
import {
  createLeadWatchlist,createWatchlistSchedule,
  createOutreachDraft,createOutreachApprovalRequest,
} from "../map-missions/index.mjs";
import { authorizeWithApproval } from "../scheduler-approval-center/index.mjs";

function requirePolicy(policy){
  assert(policy?.schema===1&&policy?.prospecting_loop&&policy?.adaptive_queries&&policy?.crm_lifecycle,"Lead Intelligence policy required.");
}
function verifiedCandidate(candidate){
  assert(candidate?.candidate_ref&&candidate?.crm_lead_id,"Verified CRM candidate required.");
  assert(candidate?.verification_ref,"Candidate verification_ref required.");
  assert(candidate?.external_write_state==="NOT_WRITTEN","Candidate must remain NOT_WRITTEN before external CRM approval.");
  assert(candidate?.completeness_claim===false,"Candidate may not claim completeness.");
  return candidate;
}
function boundedRefs(values,max,label){
  const refs=uniq((values||[]).map(x=>clean(x,1000)).filter(Boolean));
  assert(refs.length<=Number(max),label+" bound exceeded.");
  return refs;
}
function keywordList(values,max,label){
  const out=[],seen=new Set();
  for(const raw of values||[]){
    const display=clean(raw,300),key=normalizedText(display);
    if(!display||!key||seen.has(key)) continue;
    seen.add(key);out.push(display);
  }
  assert(out.length>0,label+" requires at least one keyword.");
  assert(out.length<=Number(max),label+" bound exceeded.");
  return out;
}

export function createProspectingCycle({
  cycle_id,created_at,search_plan_ref,verified_candidates=[],learning_evidence_refs=[],
}={}, {policy}={}){
  requirePolicy(policy);
  const id=clean(cycle_id,160),planRef=clean(search_plan_ref,1000);
  assert(id&&planRef,"Prospecting cycle id/search_plan_ref required.");
  assert(verified_candidates.length>0,"Prospecting cycle requires verified candidates.");
  assert(verified_candidates.length<=Number(policy.prospecting_loop.max_verified_candidates_per_cycle),"Prospecting verified candidate bound exceeded.");
  for(const candidate of verified_candidates) verifiedCandidate(candidate);
  const learning=boundedRefs(
    learning_evidence_refs,
    policy.prospecting_loop.max_learning_evidence_refs,
    "Prospecting learning evidence"
  );
  assert(learning.length>0,"Prospecting LEARN stage requires evidence refs.");
  const stages=[...(policy.prospecting_loop.stages||[])];
  assert(JSON.stringify(stages)===JSON.stringify(["DISCOVER","ENRICH","SCORE","VERIFY","LEARN"]),"Prospecting stage contract drift.");
  const core={
    schema:1,cycle_id:id,created_at:iso(created_at,"Prospecting cycle created_at"),
    search_plan_ref:planRef,stages,
    candidate_refs:verified_candidates.map(x=>x.candidate_ref).sort(),
    verification_refs:verified_candidates.map(x=>x.verification_ref).sort(),
    learning_evidence_refs:learning.sort(),
    verified_only:true,completeness_claim:false,adaptive_execution_allowed:false,
    claim_boundary:policy.claim_boundary,
  };
  return freeze({...core,cycle_ref:contentRef("lead-prospecting-cycle",core)});
}

export function createAdaptiveQueryProposal({
  cycle,proposed_keywords=[],reason,evidence_refs=[],created_at,
}={}, {policy}={}){
  requirePolicy(policy);
  assert(cycle?.cycle_ref&&cycle?.adaptive_execution_allowed===false,"Prospecting cycle required for adaptive proposal.");
  assert(policy.adaptive_queries.execution_without_review_allowed===false,"Adaptive execution must remain review-gated.");
  const keywords=keywordList(proposed_keywords,policy.adaptive_queries.max_keywords_per_proposal,"Adaptive query proposal");
  const refs=boundedRefs(evidence_refs,policy.adaptive_queries.max_evidence_refs,"Adaptive proposal evidence");
  if(policy.adaptive_queries.require_evidence_refs===true) assert(refs.length>0,"Adaptive query proposal requires evidence refs.");
  const cycleEvidence=new Set(cycle.learning_evidence_refs||[]);
  for(const ref of refs) assert(cycleEvidence.has(ref),"Adaptive proposal evidence must come from cycle LEARN evidence.");
  const core={
    schema:1,cycle_ref:cycle.cycle_ref,current_plan_ref:cycle.search_plan_ref,
    proposed_keywords:keywords,reason:clean(reason,2000),
    evidence_refs:refs.sort(),created_at:iso(created_at,"Adaptive proposal created_at"),
    state:"PROPOSED",review_required:true,execution_authorized:false,
    provider_execution_authorized:false,completeness_claim:false,
  };
  assert(core.reason,"Adaptive query proposal reason required.");
  return freeze({...core,proposal_ref:contentRef("lead-adaptive-query-proposal",core)});
}

export function reviewAdaptiveQueryProposal(proposal,{
  actor,decision,reviewed_at,note,
}={}, {policy}={}){
  requirePolicy(policy);
  assert(proposal?.proposal_ref&&proposal?.state==="PROPOSED","Adaptive proposal required.");
  const reviewer=clean(actor,120),result=clean(decision,40).toUpperCase();
  assert(reviewer===policy.adaptive_queries.reviewer_actor,"Adaptive query proposal reviewer is not authorized.");
  assert((policy.adaptive_queries.allowed_decisions||[]).includes(result),"Adaptive query proposal review decision invalid.");
  const core={
    schema:1,proposal_ref:proposal.proposal_ref,actor:reviewer,decision:result,
    reviewed_at:iso(reviewed_at,"Adaptive proposal reviewed_at"),note:clean(note,2000)||null,
    query_change_authorized:result==="APPROVED",
    provider_execution_authorized:false,
  };
  return freeze({...core,review_ref:contentRef("lead-adaptive-query-review",core)});
}

function geographiesFromPlan(plan){
  const out=[],seen=new Set();
  for(const q of plan.queries||[]){
    if(seen.has(q.geography_id)) continue;
    seen.add(q.geography_id);
    out.push({id:q.geography_id,label:q.geography_label,area:structuredClone(q.area)});
  }
  return out;
}

export function applyApprovedQueryProposal({
  current_plan,proposal,review,
}={}, {policy,geo_intelligence_policy,geo_policy}={}){
  requirePolicy(policy);
  assert(review?.review_ref&&review?.decision==="APPROVED"&&review?.query_change_authorized===true,"Approved review required before adaptive query change.");
  assert(review.proposal_ref===proposal?.proposal_ref,"Adaptive review/proposal binding mismatch.");
  assert(proposal.current_plan_ref===current_plan?.plan_ref,"Adaptive proposal/current plan binding mismatch.");
  validateExpansionPlan(current_plan,{policy:geo_intelligence_policy,geo_policy});
  const currentKeywords=uniq((current_plan.queries||[]).map(x=>x.keyword));
  const keywords=keywordList(
    [...currentKeywords,...proposal.proposed_keywords],
    geo_intelligence_policy.search_expansion.max_keywords,
    "Approved adaptive query set"
  );
  const plan=createSearchExpansionPlan({
    mission_id:current_plan.mission_id,
    created_at:review.reviewed_at,
    keywords,
    geographies:geographiesFromPlan(current_plan),
  },{policy:geo_intelligence_policy,geo_policy});
  const core={
    schema:1,previous_plan_ref:current_plan.plan_ref,proposal_ref:proposal.proposal_ref,review_ref:review.review_ref,
    next_plan_ref:plan.plan_ref,added_keywords:[...proposal.proposed_keywords],
    adaptive_change_applied:true,provider_execution_authorized:false,completeness_claim:false,
  };
  return freeze({...core,change_ref:contentRef("lead-adaptive-query-change",core),plan});
}

export function createCrmLifecycleRecord(candidate,{policy,created_at}={}){
  requirePolicy(policy);verifiedCandidate(candidate);
  const state=policy.crm_lifecycle.initial_state_by_qualification_tier?.[candidate.qualification_tier];
  assert((policy.crm_lifecycle.states||[]).includes(state),"CRM lifecycle initial state not configured for qualification tier.");
  const at=iso(created_at,"CRM lifecycle created_at");
  const history=[freeze({event:"CREATE",state,at,evidence_refs:[candidate.candidate_ref,candidate.verification_ref].sort()})];
  const core={
    schema:1,crm_lead_id:candidate.crm_lead_id,candidate_ref:candidate.candidate_ref,
    verification_ref:candidate.verification_ref,source_refs:[...(candidate.source_refs||[])].sort(),
    qualification_tier:candidate.qualification_tier,state,revision:1,created_at:at,updated_at:at,
    history,external_write_performed:false,completeness_claim:false,
  };
  return freeze({...core,record_ref:contentRef("crm-lead-lifecycle",core)});
}

export function transitionCrmLifecycle(record,{
  event,at,evidence_refs=[],note,
}={}, {policy}={}){
  requirePolicy(policy);
  assert(record?.record_ref&&record?.crm_lead_id,"CRM lifecycle record required.");
  const evt=clean(event,80).toUpperCase();
  const next=policy.crm_lifecycle.transitions?.[record.state]?.[evt];
  assert(next,"CRM lifecycle transition is not allowed: "+record.state+" + "+evt);
  const refs=boundedRefs(evidence_refs,policy.adaptive_queries.max_evidence_refs,"CRM transition evidence");
  if(policy.crm_lifecycle.evidence_required_for_every_transition===true) assert(refs.length>0,"CRM lifecycle transition requires evidence.");
  const time=iso(at,"CRM lifecycle transition at");
  const history=[
    ...(record.history||[]),
    freeze({event:evt,from_state:record.state,state:next,at:time,evidence_refs:refs.sort(),note:clean(note,2000)||null}),
  ];
  assert(history.length<=Number(policy.crm_lifecycle.max_history_entries),"CRM lifecycle history bound exceeded.");
  const core={
    schema:1,crm_lead_id:record.crm_lead_id,candidate_ref:record.candidate_ref,
    verification_ref:record.verification_ref,source_refs:[...(record.source_refs||[])].sort(),
    qualification_tier:record.qualification_tier,state:next,revision:Number(record.revision)+1,
    created_at:record.created_at,updated_at:time,history,
    previous_record_ref:record.record_ref,
    external_write_performed:false,completeness_claim:false,
  };
  return freeze({...core,record_ref:contentRef("crm-lead-lifecycle",core)});
}

function monitorFromCandidates({kind,monitor_id,created_at,interval_days,candidates,source_ref},{policy,map_policy}){
  requirePolicy(policy);
  assert(policy.monitoring.normal_scheduler_required===true&&policy.monitoring.cost_governor_required===true,"Monitoring must reuse normal scheduler and cost governor.");
  assert(candidates.length>0&&candidates.length<=Number(policy.monitoring.max_subjects),"Monitoring subject bound invalid.");
  const days=Number(interval_days);
  assert(Number.isInteger(days)&&days>=Number(policy.monitoring.min_interval_days)&&days<=Number(policy.monitoring.max_interval_days),"Monitoring interval out of bounds.");
  const watchlist=createLeadWatchlist({
    watchlist_id:clean(monitor_id,160),
    created_at,interval_days:days,candidates,
    hard_limit_amount:Number(policy.monitoring.default_hard_limit_per_run),
  },{policy:map_policy});
  const schedule=createWatchlistSchedule(watchlist,{policy:map_policy});
  const core={
    schema:1,monitor_id:clean(monitor_id,160),kind,source_ref,
    candidate_refs:candidates.map(x=>x.candidate_ref).sort(),
    watchlist_ref:watchlist.watchlist_ref,schedule_id:schedule.schedule_id,
    created_at:watchlist.created_at,interval_days:days,
    raw_provider_content_persisted:false,completeness_claim:false,
  };
  assert(core.monitor_id,"Monitor id required.");
  return freeze({...core,monitor_ref:contentRef("lead-monitor",core),watchlist,schedule});
}

export function createCompetitorMonitor({
  monitor_id,radar,candidates=[],interval_days,created_at,
}={}, {policy,map_policy}={}){
  assert(radar?.radar_ref&&radar?.verified_only===true&&radar?.completeness_claim===false,"Verified bounded competitor radar required.");
  const byId=new Map(candidates.map(x=>[x.crm_lead_id,verifiedCandidate(x)]));
  const selected=[];
  for(const row of radar.rows||[]){
    if(row.role!=="COMPETITOR") continue;
    const candidate=byId.get(row.crm_lead_id);assert(candidate,"Competitor monitor candidate missing.");
    selected.push(candidate);
  }
  assert(selected.length>0,"Competitor monitor requires at least one evidenced competitor.");
  return monitorFromCandidates({kind:"COMPETITOR",monitor_id,created_at,interval_days,candidates:selected,source_ref:radar.radar_ref},{policy,map_policy});
}

export function createTerritoryMonitor({
  monitor_id,territory_plan,candidates=[],interval_days,created_at,
}={}, {policy,map_policy}={}){
  assert(territory_plan?.territory_plan_ref&&territory_plan?.completeness_claim===false,"Bounded territory plan required.");
  const ids=new Set((territory_plan.territories||[]).flatMap(x=>(x.leads||[]).map(y=>y.crm_lead_id)));
  const selected=candidates.filter(x=>ids.has(x.crm_lead_id)).map(verifiedCandidate);
  assert(selected.length>0,"Territory monitor requires in-territory verified candidates.");
  return monitorFromCandidates({kind:"TERRITORY",monitor_id,created_at,interval_days,candidates:selected,source_ref:territory_plan.territory_plan_ref},{policy,map_policy});
}

export function createMonitoringLearningSignal({
  monitor,observed_at,change_refs=[],evidence_refs=[],suggested_keywords=[],
}={}, {policy}={}){
  requirePolicy(policy);
  assert(monitor?.monitor_ref&&monitor?.completeness_claim===false,"Bounded monitor required.");
  const changes=boundedRefs(change_refs,policy.prospecting_loop.max_learning_evidence_refs,"Monitoring change refs");
  const evidence=boundedRefs(evidence_refs,policy.adaptive_queries.max_evidence_refs,"Monitoring evidence refs");
  assert(changes.length>0||evidence.length>0,"Monitoring learning signal requires change or evidence refs.");
  const keywords=keywordList(suggested_keywords,policy.adaptive_queries.max_learning_keywords,"Monitoring learning signal");
  const core={
    schema:1,stage:"LEARN",monitor_ref:monitor.monitor_ref,monitor_kind:clean(monitor.kind,40).toUpperCase(),
    observed_at:iso(observed_at,"Monitoring observed_at"),
    change_refs:changes.sort(),evidence_refs:evidence.sort(),suggested_keywords:keywords,
    auto_apply_allowed:false,review_required:true,completeness_claim:false,
  };
  return freeze({...core,signal_ref:contentRef("lead-monitor-learning-signal",core)});
}

export function createQualifiedOutreachPackage({
  record,candidate,channel,subject,body,created_at,requested_at,expires_at,
}={}, {policy,map_policy}={}){
  requirePolicy(policy);verifiedCandidate(candidate);
  assert(record?.record_ref&&record.crm_lead_id===candidate.crm_lead_id,"Outreach lifecycle/candidate binding mismatch.");
  assert((policy.outreach.eligible_states||[]).includes(record.state),"CRM lifecycle state is not eligible for outreach drafting.");
  assert(policy.outreach.draft_only===true&&policy.outreach.automatic_send_allowed===false&&policy.outreach.approval_required===true,"Outreach policy must remain draft-only and approval-gated.");
  const draft=createOutreachDraft({candidate,channel,subject,body,created_at},{policy:map_policy});
  const approval_request=createOutreachApprovalRequest(draft,{policy:map_policy,requested_at,expires_at});
  const core={
    schema:1,record_ref:record.record_ref,candidate_ref:candidate.candidate_ref,draft_ref:draft.draft_ref,
    approval_request_ref:approval_request.approval_ref,
    approval_required:true,external_send_performed:false,automatic_send_allowed:false,
    recommended_lifecycle_event:"REQUEST_CONTACT",
  };
  return freeze({...core,package_ref:contentRef("qualified-outreach-package",core),draft,approval_request});
}


export function applyApprovedOutreachDecision({
  record,outreach_package,decision,at,
}={}, {policy}={}){
  requirePolicy(policy);
  assert(record?.record_ref&&record.state==="CONTACT_REVIEW","Outreach approval requires CONTACT_REVIEW lifecycle state.");
  assert(outreach_package?.package_ref&&outreach_package?.approval_request?.approval_ref,"Qualified outreach package required.");
  assert(record.crm_lead_id===outreach_package.draft?.crm_lead_id,"Outreach approval CRM identity mismatch.");
  assert(record.candidate_ref===outreach_package.candidate_ref,"Outreach approval candidate mismatch.");
  assert(record.previous_record_ref===outreach_package.record_ref,"Outreach approval package is not bound to the lifecycle record under review.");
  assert(outreach_package.approval_request_ref===outreach_package.approval_request.approval_ref,"Outreach approval request ref mismatch.");
  const actions=outreach_package.approval_request.scope?.actions||[];
  const resources=outreach_package.approval_request.scope?.resources||[];
  assert(actions.length===1&&resources.length===1,"Outreach approval request must have exact single action/resource scope.");
  const authorization=authorizeWithApproval(outreach_package.approval_request,decision,{
    action:actions[0],resource:resources[0],at,
  });
  assert(authorization.allowed===true,"Outreach approval authorization failed: "+authorization.reason);
  const next=transitionCrmLifecycle(record,{
    event:"APPROVE_CONTACT",at,
    evidence_refs:[
      authorization.decision_ref,
      outreach_package.approval_request.approval_ref,
      outreach_package.draft.draft_ref,
    ],
    note:"Exact human approval validated for one outreach draft; no send performed.",
  },{policy});
  const core={
    schema:1,package_ref:outreach_package.package_ref,record_ref:record.record_ref,
    next_record_ref:next.record_ref,approval_ref:authorization.approval_ref,
    decision_ref:authorization.decision_ref,authorized_action:actions[0],authorized_resource:resources[0],
    approval_validated:true,external_send_performed:false,send_authorized_by_package:false,
  };
  return freeze({...core,binding_ref:contentRef("outreach-lifecycle-approval",core),record:next,authorization});
}
