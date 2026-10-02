import { createHash } from "node:crypto";

export const COST_GOVERNOR_API=1;
export const COST_ACTIONS=Object.freeze(["ALLOW","WARN","REROUTE","APPROVAL_REQUIRED","STOP"]);
export const COST_TYPES=Object.freeze(["MODEL","TOOL","PROVIDER","OTHER"]);

const ACTION_SET=new Set(COST_ACTIONS);
const TYPE_SET=new Set(COST_TYPES);
const clean=(value,max=4000)=>String(value??"").trim().slice(0,max);
const money=(value)=>Number(Number(value).toFixed(12));

function assert(condition,message){ if(!condition) throw new Error(message); }
function finite(value,label,{min=0}={}){
  const n=Number(value);
  assert(Number.isFinite(n)&&n>=min,label+" must be a finite number >= "+min+".");
  return n;
}
function nullableLimit(value,label){
  if(value==null) return null;
  return finite(value,label);
}
function unique(values,max=1000){
  return Object.freeze([...new Set((Array.isArray(values)?values:[]).map((v)=>clean(v,max)).filter(Boolean))]);
}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==="object") return Object.fromEntries(Object.keys(value).sort().map((k)=>[k,stable(value[k])]));
  return value;
}
function ref(kind,value){
  return kind+":sha256:"+createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function normalizeCostAmount(input={},label="cost"){
  assert(input&&typeof input==="object"&&!Array.isArray(input),label+" must be an object.");
  const status=clean(input.status||"UNKNOWN",20).toUpperCase();
  assert(["KNOWN","UNKNOWN"].includes(status),label+".status must be KNOWN or UNKNOWN.");
  if(status==="UNKNOWN"){
    assert(input.amount==null,label+" UNKNOWN must not claim amount.");
    assert(input.currency==null||!clean(input.currency,3),label+" UNKNOWN must not claim currency.");
    return Object.freeze({status:"UNKNOWN",amount:null,currency:null});
  }
  const amount=finite(input.amount,label+".amount");
  const currency=clean(input.currency,3).toUpperCase();
  assert(/^[A-Z]{3}$/.test(currency),label+" KNOWN requires 3-letter currency.");
  return Object.freeze({status:"KNOWN",amount:money(amount),currency});
}

function normalizeLimitMap(value,label){
  assert(value&&typeof value==="object"&&!Array.isArray(value),label+" must be an object.");
  const out={};
  for(const [rawId,rawLimit] of Object.entries(value)){
    const id=clean(rawId,160);
    assert(id,label+" id cannot be empty.");
    out[id]=nullableLimit(rawLimit,label+"."+id);
  }
  return Object.freeze(out);
}

export function normalizeCostPolicy(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Cost policy must be an object.");
  assert(input.schema===COST_GOVERNOR_API,"Cost policy schema must be 1.");
  const currency=clean(input.currency||"USD",3).toUpperCase();
  assert(/^[A-Z]{3}$/.test(currency),"Cost policy currency must be 3 letters.");

  const thresholds=input.thresholds||{};
  const warning=finite(thresholds.warning_ratio??0.70,"warning_ratio");
  const reroute=finite(thresholds.reroute_ratio??0.85,"reroute_ratio");
  const approval=finite(thresholds.approval_ratio??0.95,"approval_ratio");
  assert(warning>0&&warning<reroute&&reroute<approval&&approval<1,"Cost thresholds must satisfy 0 < warning < reroute < approval < 1.");

  const dailyLimit=nullableLimit(input.daily_limit_amount,"daily_limit_amount");
  return Object.freeze({
    schema:COST_GOVERNOR_API,
    currency,
    thresholds:Object.freeze({warning_ratio:warning,reroute_ratio:reroute,approval_ratio:approval,stop_ratio:1}),
    daily_limit_amount:dailyLimit,
    project_limits:normalizeLimitMap(input.project_limits||{},"project_limits"),
    mission_limits:normalizeLimitMap(input.mission_limits||{},"mission_limits"),
    employee_limits:normalizeLimitMap(input.employee_limits||{},"employee_limits"),
  });
}

export function normalizeCostLedgerEntry(input={}){
  assert(input&&typeof input==="object"&&!Array.isArray(input),"Cost ledger entry must be an object.");
  assert(input.schema===COST_GOVERNOR_API,"Cost ledger entry schema must be 1.");
  const costId=clean(input.cost_id,160);
  const occurredAt=clean(input.occurred_at,80);
  const costType=clean(input.cost_type||"OTHER",40).toUpperCase();
  assert(costId,"Cost ledger entry cost_id is required.");
  assert(!Number.isNaN(Date.parse(occurredAt)),"Cost ledger entry occurred_at must be valid.");
  assert(TYPE_SET.has(costType),"Cost ledger entry cost_type is invalid.");
  const cost=normalizeCostAmount(input.cost,"ledger cost");
  return Object.freeze({
    schema:COST_GOVERNOR_API,
    cost_id:costId,
    occurred_at:new Date(occurredAt).toISOString(),
    project_id:input.project_id==null?null:clean(input.project_id,160)||null,
    mission_id:input.mission_id==null?null:clean(input.mission_id,160)||null,
    task_id:input.task_id==null?null:clean(input.task_id,160)||null,
    employee_id:input.employee_id==null?null:clean(input.employee_id,40).toLowerCase()||null,
    cost_type:costType,
    provider_id:input.provider_id==null?null:clean(input.provider_id,120).toLowerCase()||null,
    model_id:input.model_id==null?null:clean(input.model_id,160)||null,
    tool_id:input.tool_id==null?null:clean(input.tool_id,160)||null,
    cost,
    evidence_refs:unique(input.evidence_refs),
  });
}

function applies(entry,scope){
  if(scope.kind==="DAY") return entry.occurred_at.slice(0,10)===scope.id;
  if(scope.kind==="PROJECT") return entry.project_id===scope.id;
  if(scope.kind==="MISSION") return entry.mission_id===scope.id;
  if(scope.kind==="EMPLOYEE") return entry.employee_id===scope.id;
  return false;
}

function scopeList(policy,context){
  const at=new Date(context.at);
  assert(!Number.isNaN(at.getTime()),"Cost admission at must be a valid timestamp.");
  const day=at.toISOString().slice(0,10);
  const list=[];
  if(policy.daily_limit_amount!=null) list.push({kind:"DAY",id:day,limit:policy.daily_limit_amount});
  const projectId=clean(context.project_id,160);
  const missionId=clean(context.mission_id,160);
  const employeeId=clean(context.employee_id,40).toLowerCase();
  if(projectId&&policy.project_limits[projectId]!=null) list.push({kind:"PROJECT",id:projectId,limit:policy.project_limits[projectId]});
  if(missionId&&policy.mission_limits[missionId]!=null) list.push({kind:"MISSION",id:missionId,limit:policy.mission_limits[missionId]});
  if(employeeId&&policy.employee_limits[employeeId]!=null) list.push({kind:"EMPLOYEE",id:employeeId,limit:policy.employee_limits[employeeId]});
  const missionBudget=context.mission_budget||null;
  if(missionId&&missionBudget?.hard_limit_amount!=null){
    const currency=clean(missionBudget.currency,3).toUpperCase();
    assert(currency===policy.currency,"Mission budget currency must match Cost Governor currency.");
    const existing=list.find((item)=>item.kind==="MISSION"&&item.id===missionId);
    const amount=finite(missionBudget.hard_limit_amount,"mission_budget.hard_limit_amount");
    if(existing) existing.limit=Math.min(existing.limit,amount);
    else list.push({kind:"MISSION",id:missionId,limit:amount});
  }
  return list;
}

function scopeSnapshot(scope,ledger,currency){
  const entries=ledger.filter((entry)=>applies(entry,scope));
  let spent=0;
  let unknown=0;
  for(const entry of entries){
    if(entry.cost.status==="UNKNOWN"){ unknown+=1; continue; }
    assert(entry.cost.currency===currency,"Ledger currency mismatch inside governed scope.");
    spent=money(spent+entry.cost.amount);
  }
  return Object.freeze({...scope,spent_amount:spent,unknown_entries:unknown});
}

function normalizeAlternative(input,index,currency){
  const id=clean(input?.id||("alternative-"+(index+1)),160);
  const cost=normalizeCostAmount(input?.cost||{},"alternative cost");
  if(cost.status==="KNOWN") assert(cost.currency===currency,"Alternative cost currency mismatch.");
  return Object.freeze({id,cost});
}

export function assessCostAdmission({policy:policyInput,ledger=[],context={},estimate={},alternatives=[],approval_ref=null}={}){
  const policy=normalizeCostPolicy(policyInput);
  const normalizedLedger=ledger.map(normalizeCostLedgerEntry);
  const cost=normalizeCostAmount(estimate,"estimated cost");
  if(cost.status==="KNOWN") assert(cost.currency===policy.currency,"Estimated cost currency mismatch.");
  const scopes=scopeList(policy,context).map((scope)=>scopeSnapshot(scope,normalizedLedger,policy.currency));
  const normalizedAlternatives=Object.freeze((Array.isArray(alternatives)?alternatives:[]).map((item,i)=>normalizeAlternative(item,i,policy.currency)));

  if(scopes.length===0){
    const payload={schema:1,action:"ALLOW",reason_codes:[],estimate:cost,scopes,approval_ref:null,recommended_alternative:null};
    return Object.freeze({...payload,decision_ref:ref("cost-decision",payload)});
  }

  const reasons=[];
  if(scopes.some((scope)=>scope.unknown_entries>0)) reasons.push("UNRECONCILED_UNKNOWN_COST");
  if(cost.status==="UNKNOWN") reasons.push("PROJECTED_COST_UNKNOWN");
  if(reasons.length){
    const payload={schema:1,action:"STOP",reason_codes:Object.freeze(reasons),estimate:cost,scopes:Object.freeze(scopes),approval_ref:null,recommended_alternative:null};
    return Object.freeze({...payload,decision_ref:ref("cost-decision",payload)});
  }

  const projected=scopes.map((scope)=>{ const projectedAmount=money(scope.spent_amount+cost.amount); return Object.freeze({...scope,projected_amount:projectedAmount,utilization:scope.limit===0?Infinity:projectedAmount/scope.limit}); });
  const maxUtil=Math.max(...projected.map((scope)=>scope.utilization));

  let action="ALLOW";
  if(maxUtil>=1) action="STOP";
  else if(maxUtil>=policy.thresholds.approval_ratio) action=clean(approval_ref,1000)?"WARN":"APPROVAL_REQUIRED";
  else if(maxUtil>=policy.thresholds.reroute_ratio) action="REROUTE";
  else if(maxUtil>=policy.thresholds.warning_ratio) action="WARN";

  if(action==="STOP") reasons.push("HARD_BUDGET_LIMIT_REACHED");
  else if(action==="APPROVAL_REQUIRED") reasons.push("COST_APPROVAL_THRESHOLD_REACHED");
  else if(action==="REROUTE") reasons.push("COST_REROUTE_THRESHOLD_REACHED");
  else if(action==="WARN") reasons.push(clean(approval_ref,1000)?"COST_OVERAGE_APPROVED_BELOW_HARD_LIMIT":"COST_WARNING_THRESHOLD_REACHED");

  let recommended=null;
  if(action==="REROUTE"&&normalizedAlternatives.length){
    const eligible=normalizedAlternatives
      .filter((item)=>item.cost.status==="KNOWN")
      .map((item)=>({...item,max_utilization:Math.max(...scopes.map((scope)=>(scope.spent_amount+item.cost.amount)/scope.limit))}))
      .filter((item)=>item.max_utilization<maxUtil)
      .sort((a,b)=>a.max_utilization-b.max_utilization||a.id.localeCompare(b.id));
    if(eligible.length) recommended=Object.freeze({id:eligible[0].id,cost:eligible[0].cost,max_utilization:eligible[0].max_utilization});
  }

  const payload={
    schema:1,
    action,
    reason_codes:Object.freeze(reasons),
    estimate:cost,
    scopes:Object.freeze(projected),
    approval_ref:clean(approval_ref,1000)||null,
    recommended_alternative:recommended,
  };
  assert(ACTION_SET.has(action),"Cost admission action invalid.");
  return Object.freeze({...payload,decision_ref:ref("cost-decision",payload)});
}

export function reconcileCostLedger({policy:policyInput,ledger=[]}={}){
  const policy=normalizeCostPolicy(policyInput);
  const normalized=ledger.map(normalizeCostLedgerEntry);
  const byProvider=new Map(),byModel=new Map(),byTool=new Map();
  const add=(map,key,entry)=>{
    if(!key) return;
    const current=map.get(key)||{known_amount:0,unknown_entries:0,currency:policy.currency};
    if(entry.cost.status==="KNOWN"){
      assert(entry.cost.currency===policy.currency,"Cost ledger currency mismatch.");
      current.known_amount=money(current.known_amount+entry.cost.amount);
    }else current.unknown_entries+=1;
    map.set(key,current);
  };
  for(const entry of normalized){
    add(byProvider,entry.provider_id,entry);
    add(byModel,entry.model_id,entry);
    add(byTool,entry.tool_id,entry);
  }
  const mapOut=(map)=>Object.freeze([...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([id,v])=>Object.freeze({id,...v})));
  return Object.freeze({
    schema:1,
    currency:policy.currency,
    entries:Object.freeze(normalized),
    totals:Object.freeze({
      known_amount:normalized.filter((e)=>e.cost.status==="KNOWN").reduce((sum,e)=>money(sum+e.cost.amount),0),
      unknown_entries:normalized.filter((e)=>e.cost.status==="UNKNOWN").length,
    }),
    by_provider:mapOut(byProvider),
    by_model:mapOut(byModel),
    by_tool:mapOut(byTool),
  });
}

export function createCostGovernor({policy:policyInput,ledger=[],clock=()=>new Date().toISOString()}={}){
  const policy=normalizeCostPolicy(policyInput);
  const entries=ledger.map(normalizeCostLedgerEntry);
  const decisions=[];
  const observedScopes=new Map();

  const rememberScopes=(scopes=[])=>{
    for(const scope of scopes){
      const key=scope.kind+":"+scope.id;
      const existing=observedScopes.get(key);
      if(!existing||scope.limit<existing.limit) observedScopes.set(key,Object.freeze({kind:scope.kind,id:scope.id,limit:scope.limit}));
    }
  };

  const budgetState=()=>Object.freeze([...observedScopes.values()]
    .map((scope)=>scopeSnapshot(scope,entries,policy.currency))
    .map((scope)=>Object.freeze({
      ...scope,
      hard_limit_breached:scope.spent_amount>scope.limit,
      reconciliation_required:scope.unknown_entries>0,
    }))
    .sort((a,b)=>(a.kind+":"+a.id).localeCompare(b.kind+":"+b.id)));

  return Object.freeze({
    policy,
    admit(input={}){
      const decision=assessCostAdmission({
        policy,
        ledger:entries,
        context:{...input.context,at:input.context?.at||clock()},
        estimate:input.estimate,
        alternatives:input.alternatives,
        approval_ref:input.approval_ref,
      });
      decisions.push(decision);
      rememberScopes(decision.scopes);
      return decision;
    },
    record(input={}){
      const costId=clean(input.cost_id,160)||("cost-"+(entries.length+1));
      const entry=normalizeCostLedgerEntry({
        schema:1,
        ...input,
        cost_id:costId,
        occurred_at:input.occurred_at||clock(),
      });
      entries.push(entry);
      return entry;
    },
    snapshot(){
      return Object.freeze({
        schema:1,
        policy,
        ledger:reconcileCostLedger({policy,ledger:entries}),
        budget_state:budgetState(),
        decisions:Object.freeze([...decisions]),
      });
    },
  });
}
