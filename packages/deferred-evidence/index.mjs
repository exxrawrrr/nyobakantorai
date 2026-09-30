const nonEmpty=(v)=>typeof v==="string"&&v.trim().length>0;

const DECISION_HOLD="HOLD";
const DECISION_ACCEPTED="RELEASE_WITH_ACCEPTED_DEFERRALS";

export function validateDeferredEvidenceLedger({
  ledger,
  crossHarness,
  memoryResults,
  browserResults,
  realTaskStatus,
}={}){
  const errors=[];
  if(ledger?.schema!==1) errors.push("ledger schema must be 1");

  const decision=ledger?.decision;
  if(![DECISION_HOLD,DECISION_ACCEPTED].includes(decision)){
    errors.push("ledger decision must be HOLD or RELEASE_WITH_ACCEPTED_DEFERRALS");
  }
  if(!Array.isArray(ledger?.items)||ledger.items.length<1) errors.push("ledger items required");

  const ids=new Set();
  for(const item of ledger?.items||[]){
    if(!nonEmpty(item?.id)) errors.push("deferred item id required");
    else if(ids.has(item.id)) errors.push("duplicate deferred item id "+item.id);
    else ids.add(item.id);
    if(typeof item?.blocking_stable_promotion!=="boolean") errors.push((item?.id||"unknown")+": blocking_stable_promotion must be boolean");
    if(!nonEmpty(item?.status)) errors.push((item?.id||"unknown")+": status required");
    if(!nonEmpty(item?.canonical_source)) errors.push((item?.id||"unknown")+": canonical_source required");
    if(!nonEmpty(item?.completion_criterion)) errors.push((item?.id||"unknown")+": completion_criterion required");
    if(!nonEmpty(item?.safe_next_action)) errors.push((item?.id||"unknown")+": safe_next_action required");
  }

  if(decision===DECISION_HOLD){
    for(const item of ledger?.items||[]){
      if(item.blocking_stable_promotion!==true) errors.push(item.id+": HOLD requires blocking_stable_promotion=true");
      if(item.accepted_for_v0_4_scope===true) errors.push(item.id+": HOLD cannot mark item accepted_for_v0_4_scope=true");
    }
  }

  if(decision===DECISION_ACCEPTED){
    if(!nonEmpty(ledger?.owner_scope_accepted_on)) errors.push("owner_scope_accepted_on required for accepted-deferrals release");
    for(const item of ledger?.items||[]){
      if(item.accepted_for_v0_4_scope!==true) errors.push(item.id+": accepted release requires accepted_for_v0_4_scope=true");
      if(item.blocking_stable_promotion!==false) errors.push(item.id+": accepted release requires blocking_stable_promotion=false");
    }
  }

  const byId=new Map((ledger?.items||[]).map(x=>[x.id,x]));
  const required=[
    "cross-harness-live-parity",
    "cognee-live-provider",
    "browser-use-live-provider",
    "real-task-baseline",
    "department-real-workflow-coverage",
    "real-clean-machine-hermes-lifecycle",
  ];
  for(const id of required) if(!byId.has(id)) errors.push("missing deferred item "+id);

  const cross=byId.get("cross-harness-live-parity");
  if(cross&&crossHarness?.claim_state!==cross.status){
    errors.push("cross-harness ledger drift: ledger="+cross.status+" canonical="+String(crossHarness?.claim_state));
  }

  const cognee=memoryResults?.providers?.find(x=>x.provider_id==="cognee-hermes");
  const cogneeLedger=byId.get("cognee-live-provider");
  if(cogneeLedger){
    const expected=String(cognee?.status)+"_"+String(cognee?.claim_state);
    if(expected!=="NOT_RUN_UNPROVEN") errors.push("canonical Cognee state changed: "+expected);
    if(cogneeLedger.status!=="NOT_RUN_UNPROVEN") errors.push("Cognee ledger status drift");
  }

  const browser=browserResults?.providers?.find(x=>x.provider_id==="browser-use");
  const browserLedger=byId.get("browser-use-live-provider");
  if(browserLedger){
    const expected=String(browser?.status)+"_"+String(browser?.claim_state);
    if(expected!=="NOT_RUN_UNPROVEN") errors.push("canonical Browser Use state changed: "+expected);
    if(browserLedger.status!=="NOT_RUN_UNPROVEN") errors.push("Browser Use ledger status drift");
  }

  const real=byId.get("real-task-baseline");
  if(real){
    if(real.status!==realTaskStatus?.status) errors.push("real-task ledger status drift");
    const cv=real.current_value||{};
    for(const [key,canonicalKey] of [
      ["eligible_cases","eligible_cases"],
      ["minimum_cases_required","minimum_cases_required"],
      ["remaining_cases","remaining_cases"],
      ["false_successes","false_successes"],
    ]){
      if(Number(cv[key])!==Number(realTaskStatus?.[canonicalKey])){
        errors.push("real-task ledger "+key+" drift");
      }
    }
    if(realTaskStatus?.publication_gate_passed!==false){
      errors.push("real-task publication gate is no longer closed; release decision must be reviewed");
    }
  }

  const openItems=(ledger?.items||[]).filter(x=>x.blocking_stable_promotion===true);
  const acceptedItems=(ledger?.items||[]).filter(x=>x.accepted_for_v0_4_scope===true);
  const stablePromotionAllowed=
    decision===DECISION_ACCEPTED &&
    openItems.length===0 &&
    acceptedItems.length===(ledger?.items||[]).length;

  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    decision:decision||"UNKNOWN",
    open_blockers:openItems.length,
    accepted_deferred:acceptedItems.length,
    blocker_ids:Object.freeze(openItems.map(x=>x.id)),
    accepted_ids:Object.freeze(acceptedItems.map(x=>x.id)),
    stable_promotion_allowed:stablePromotionAllowed,
  });
}

export function buildDeferredEvidenceSnapshot({ledger,validation}){
  if(!validation?.ok) throw new Error("cannot build deferred evidence snapshot from invalid ledger");
  return Object.freeze({
    schema:1,
    candidate:ledger.candidate,
    decision:validation.decision,
    open_blockers:validation.open_blockers,
    accepted_deferred:validation.accepted_deferred,
    stable_promotion_allowed:validation.stable_promotion_allowed,
    owner_scope_accepted_on:ledger.owner_scope_accepted_on||null,
    items:Object.freeze(ledger.items.map(item=>Object.freeze({
      id:item.id,
      category:item.category,
      status:item.status,
      blocking_stable_promotion:item.blocking_stable_promotion,
      accepted_for_v0_4_scope:item.accepted_for_v0_4_scope===true,
    }))),
    truth_boundary:"release-scope acceptance != canonical evidence completion",
  });
}
