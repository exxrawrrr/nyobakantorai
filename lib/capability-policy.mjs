import { readFileSync } from "node:fs";

const source=JSON.parse(readFileSync(new URL("../config/capabilities.json",import.meta.url),"utf8"));
export const CAPABILITY_CONTRACT=Object.freeze(source);
export const CAPABILITY_BY_ID=Object.freeze(Object.fromEntries(source.capabilities.map((item)=>[item.id,Object.freeze(item)])));
const MUTATING=new Set(["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);

export function decideCapability({ capability, state="NOT_CONNECTED", autonomy="GUARDED", approved=false, delegatedPolicy=false } = {}) {
  const spec=CAPABILITY_BY_ID[capability];
  if(!spec) return {allowed:false,reason:"UNKNOWN_CAPABILITY"};
  if(!CAPABILITY_CONTRACT.states.includes(state)) return {allowed:false,reason:"INVALID_CONNECTION_STATE"};
  if(state!=="CONNECTED") return {allowed:false,reason:`CAPABILITY_${state}`};
  if(!CAPABILITY_CONTRACT.autonomy_modes.includes(autonomy)) return {allowed:false,reason:"INVALID_AUTONOMY_MODE"};
  if(!MUTATING.has(spec.risk_class)) return {allowed:true,reason:"READ_ONLY_CONNECTED"};
  if(autonomy==="OBSERVE") return {allowed:false,reason:"OBSERVE_MODE_BLOCKS_WRITES"};
  if(["ACCOUNT_CHANGE","DESTRUCTIVE"].includes(spec.risk_class)) {
    return approved?{allowed:true,reason:"EXPLICIT_APPROVAL"}:{allowed:false,reason:"EXPLICIT_APPROVAL_REQUIRED"};
  }
  if(approved) return {allowed:true,reason:"EXPLICIT_APPROVAL"};
  if(autonomy==="DELEGATED"&&delegatedPolicy) return {allowed:true,reason:"SCOPED_DELEGATED_POLICY"};
  return {allowed:false,reason:"HUMAN_APPROVAL_REQUIRED"};
}

export const PAID_MEDIA_LIFECYCLE=Object.freeze(["READ","ANALYZE","PREVIEW","VALIDATE","APPROVAL","EXECUTE","VERIFY","AUDIT"]);
export function validatePaidMediaLifecycle(stages){
  if(!Array.isArray(stages)) return false;
  let cursor=-1;
  for(const stage of stages){
    const next=PAID_MEDIA_LIFECYCLE.indexOf(stage);
    if(next<0||next<=cursor) return false;
    cursor=next;
  }
  return true;
}
