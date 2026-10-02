import { contentRef,assert,clean,freeze,iso } from "../geo-intelligence/common.mjs";
import { createRecurringSchedule } from "../scheduler-approval-center/index.mjs";

function baseline(candidate,policy){
  const fields={};
  for(const field of policy.monitoring.allowed_baseline_fields||[]){
    fields[field]=contentRef("lead-field-value",{field,value:candidate[field]??null});
  }
  return freeze(fields);
}
export function createLeadWatchlist({watchlist_id,created_at,interval_days,candidates=[],hard_limit_amount=1}={}, {policy}={}){
  const id=clean(watchlist_id,160);assert(id,"Watchlist id required.");
  const createdAt=iso(created_at,"Watchlist created_at");
  const days=Number(interval_days);
  assert(Number.isInteger(days)&&days>=Number(policy.monitoring.min_interval_days)&&days<=Number(policy.monitoring.max_interval_days),"Watchlist interval out of bounds.");
  assert(candidates.length>0&&candidates.length<=Number(policy.monitoring.max_entries),"Watchlist entry bound invalid.");
  const amount=Number(hard_limit_amount);
  assert(Number.isFinite(amount)&&amount>=0&&amount<=Number(policy.monitoring.max_hard_limit_per_run),"Watchlist per-run budget exceeds policy.");
  const entries=candidates.map(candidate=>{
    assert(candidate?.candidate_ref&&candidate?.external_write_state==="NOT_WRITTEN","Watchlist requires CRM-ready candidate.");
    const core={crm_lead_id:candidate.crm_lead_id,candidate_ref:candidate.candidate_ref,profile_ref:candidate.profile_ref,
      place_id:candidate.place_id||null,baseline_hashes:baseline(candidate,policy)};
    return freeze({...core,watch_entry_ref:contentRef("lead-watch-entry",core)});
  });
  const core={schema:1,watchlist_id:id,created_at:createdAt,interval_days:days,entries,
    budget:{hard_limit_amount:amount,currency:policy.monitoring.currency},
    raw_provider_content_persisted:false,completeness_claim:false};
  return freeze({...core,watchlist_ref:contentRef("lead-watchlist",core)});
}

export function createWatchlistSchedule(watchlist,{policy}={}){
  assert(watchlist?.watchlist_ref,"Watchlist required.");
  assert(policy.monitoring.require_normal_scheduler===true&&policy.monitoring.require_cost_governor===true,"Monitoring policy must require scheduler and cost governor.");
  return createRecurringSchedule({
    schema:1,
    schedule_id:"watch-"+watchlist.watchlist_id,
    objective:"Check verified lead watchlist for evidence-backed public changes without persisting raw provider responses.",
    state:"ACTIVE",
    cadence:{frequency:"DAILY",interval:watchlist.interval_days,days_of_week:[]},
    time_window:{start:"08:00",end:"10:00",timezone:"Asia/Jakarta"},
    budget:watchlist.budget,risk_class:"READ_ONLY",
    constraints:["Do not send outreach.","Do not write to CRM.","Do not persist raw provider content.","Use reviewed geo/public-source policies."],
    required_evidence:[watchlist.watchlist_ref],
    work_items:[{
      key:"watchlist-check",title:"Lead watchlist check",
      objective:"Re-check verified lead evidence and produce change candidates for human review.",
      assigned_id:"ratri",required_skills:["verification"],required_evidence:[watchlist.watchlist_ref],
      risk_class:"READ_ONLY",depends_on:[]
    }],
    created_at:watchlist.created_at,starts_at:watchlist.created_at,
    expires_at:new Date(Date.parse(watchlist.created_at)+Number(policy.monitoring.max_runs)*watchlist.interval_days*86400000).toISOString(),
    max_runs:Number(policy.monitoring.max_runs),
  });
}

export function diffLeadCandidate(previous,current,{policy,observed_at}={}){
  assert(previous?.crm_lead_id===current?.crm_lead_id,"Lead change diff identity mismatch.");
  const observedAt=iso(observed_at,"Lead change observed_at");
  const changes=[];
  for(const field of policy.monitoring.allowed_baseline_fields||[]){
    const before=contentRef("lead-field-value",{field,value:previous[field]??null});
    const after=contentRef("lead-field-value",{field,value:current[field]??null});
    if(before!==after) changes.push({field,before_hash:before,after_hash:after,evidence_refs:[...(current.source_refs||[])]});
  }
  const core={schema:1,crm_lead_id:current.crm_lead_id,previous_candidate_ref:previous.candidate_ref,current_candidate_ref:current.candidate_ref,
    observed_at:observedAt,changes,raw_provider_content_persisted:false};
  return freeze({...core,change_ref:contentRef("lead-change",core)});
}
