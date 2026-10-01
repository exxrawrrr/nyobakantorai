const STATUSES=new Set(["ACTIVE","RETIRED","REVOKED"]);
const HISTORICAL_POLICIES=new Set(["ALLOW_WITHIN_VALIDITY","REJECT_ALL","ALLOW_PRE_COMPROMISE"]);
const PRIVATE_KEY=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
const PUBLIC_KEY=/-----BEGIN PUBLIC KEY-----/;
const KEY_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const REGISTRY_FIELDS=new Set(["schema","registry_id","keys"]);
const ENTRY_FIELDS=new Set([
  "key_id","public_key_pem","status","signer_identity","key_owner",
  "generation_boundary","storage_expectation","valid_from","valid_until",
  "runtime_provider_scope","runtime_ref_prefixes","revoked_at",
  "compromise_cutoff","revocation_reason","historical_policy",
]);

const clean=(value,max=1000)=>String(value??"").trim().slice(0,max);
const uniq=(values)=>[...new Set(values)];

function instant(value){
  if(typeof value!=="string"||!value.trim()) return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?ms:null;
}

function nonEmptyStrings(value){
  return Array.isArray(value) && value.length>0 && value.every((item)=>typeof item==="string"&&item.trim());
}

function validateKey(entry,index){
  const errors=[];
  const p="keys["+index+"]";
  if(!entry||typeof entry!=="object"||Array.isArray(entry)) return [p+" must be an object"];
  const extra=Object.keys(entry).filter((key)=>!ENTRY_FIELDS.has(key));
  if(extra.length) errors.push(p+" has unexpected fields: "+extra.sort().join(","));
  if(!KEY_ID.test(entry.key_id||"")) errors.push(p+".key_id invalid");
  if(!STATUSES.has(entry.status)) errors.push(p+".status invalid");
  if(!clean(entry.signer_identity,160)) errors.push(p+".signer_identity required");
  if(!clean(entry.key_owner,160)) errors.push(p+".key_owner required");
  if(!clean(entry.generation_boundary,240)) errors.push(p+".generation_boundary required");
  if(!clean(entry.storage_expectation,240)) errors.push(p+".storage_expectation required");
  if(typeof entry.public_key_pem!=="string"||!PUBLIC_KEY.test(entry.public_key_pem)||PRIVATE_KEY.test(entry.public_key_pem)){
    errors.push(p+".public_key_pem must contain public key material only");
  }
  const from=instant(entry.valid_from);
  const until=entry.valid_until==null?null:instant(entry.valid_until);
  if(from===null) errors.push(p+".valid_from invalid");
  if(entry.valid_until!=null&&until===null) errors.push(p+".valid_until invalid");
  if(from!==null&&until!==null&&until<from) errors.push(p+".valid_until precedes valid_from");
  if(!nonEmptyStrings(entry.runtime_provider_scope)) errors.push(p+".runtime_provider_scope requires at least one provider");
  else if(uniq(entry.runtime_provider_scope).length!==entry.runtime_provider_scope.length) errors.push(p+".runtime_provider_scope must be unique");
  if(!nonEmptyStrings(entry.runtime_ref_prefixes)) errors.push(p+".runtime_ref_prefixes requires at least one prefix");
  else if(uniq(entry.runtime_ref_prefixes).length!==entry.runtime_ref_prefixes.length) errors.push(p+".runtime_ref_prefixes must be unique");
  if(!HISTORICAL_POLICIES.has(entry.historical_policy)) errors.push(p+".historical_policy invalid");

  if(entry.status==="ACTIVE"){
    if(entry.revoked_at!=null||entry.compromise_cutoff!=null||entry.revocation_reason!=null) errors.push(p+" ACTIVE key cannot carry revocation fields");
    if(entry.historical_policy!=="ALLOW_WITHIN_VALIDITY") errors.push(p+" ACTIVE key historical_policy must be ALLOW_WITHIN_VALIDITY");
  }
  if(entry.status==="RETIRED"){
    if(until===null) errors.push(p+" RETIRED key requires valid_until");
    if(entry.revoked_at!=null||entry.compromise_cutoff!=null||entry.revocation_reason!=null) errors.push(p+" RETIRED key cannot carry revocation fields");
    if(entry.historical_policy!=="ALLOW_WITHIN_VALIDITY") errors.push(p+" RETIRED key historical_policy must be ALLOW_WITHIN_VALIDITY");
  }
  if(entry.status==="REVOKED"){
    const revoked=instant(entry.revoked_at);
    if(revoked===null) errors.push(p+" REVOKED key requires revoked_at");
    if(revoked!==null&&from!==null&&revoked<from) errors.push(p+".revoked_at precedes valid_from");
    if(!clean(entry.revocation_reason,240)) errors.push(p+" REVOKED key requires revocation_reason");
    if(!["REJECT_ALL","ALLOW_PRE_COMPROMISE"].includes(entry.historical_policy)){
      errors.push(p+" REVOKED key historical_policy must be REJECT_ALL or ALLOW_PRE_COMPROMISE");
    }
    if(entry.historical_policy==="ALLOW_PRE_COMPROMISE"){
      const cutoff=instant(entry.compromise_cutoff);
      if(cutoff===null) errors.push(p+" ALLOW_PRE_COMPROMISE requires compromise_cutoff");
      if(cutoff!==null&&from!==null&&cutoff<from) errors.push(p+".compromise_cutoff precedes valid_from");
      if(revoked!==null&&cutoff!==null&&cutoff>revoked) errors.push(p+".compromise_cutoff cannot be after revoked_at");
    }else if(entry.compromise_cutoff!=null){
      errors.push(p+" REJECT_ALL must not carry compromise_cutoff");
    }
  }
  return errors;
}

export function validateReceiptTrustRegistry(registry){
  const errors=[];
  if(!registry||typeof registry!=="object"||Array.isArray(registry)) return ["registry must be an object"];
  const extra=Object.keys(registry).filter((key)=>!REGISTRY_FIELDS.has(key));
  if(extra.length) errors.push("registry has unexpected fields: "+extra.sort().join(","));
  if(registry.schema!==1) errors.push("registry.schema must be 1");
  if(!clean(registry.registry_id,160)) errors.push("registry.registry_id required");
  if(registry.private_key_pem!==undefined) errors.push("registry must never contain private_key_pem");
  if(!Array.isArray(registry.keys)) errors.push("registry.keys must be an array");
  else{
    const ids=[];
    registry.keys.forEach((entry,index)=>{
      errors.push(...validateKey(entry,index));
      if(entry?.key_id) ids.push(entry.key_id);
    });
    if(uniq(ids).length!==ids.length) errors.push("registry key_id values must be unique");
  }
  return errors;
}

export function receiptTrustPublicKeys(registry){
  const errors=validateReceiptTrustRegistry(registry);
  if(errors.length) throw new Error(errors.join("; "));
  return Object.freeze(Object.fromEntries(registry.keys.map((entry)=>[entry.key_id,entry.public_key_pem])));
}

export function resolveReceiptTrust(registry,{
  keyId,
  finishedAt,
  runtimeProvider,
  runtimeRef,
}={}){
  const errors=validateReceiptTrustRegistry(registry);
  if(errors.length) return Object.freeze({ok:false,reasons:Object.freeze(["TRUST_REGISTRY_INVALID"]),entry:null,public_key_pem:null,registry_errors:Object.freeze(errors)});

  const entry=registry.keys.find((item)=>item.key_id===keyId)||null;
  if(!entry) return Object.freeze({ok:false,reasons:Object.freeze(["UNTRUSTED_KEY_ID"]),entry:null,public_key_pem:null,registry_errors:Object.freeze([])});

  const reasons=[];
  const receiptTime=instant(finishedAt);
  const validFrom=instant(entry.valid_from);
  const validUntil=entry.valid_until==null?null:instant(entry.valid_until);
  if(receiptTime===null) reasons.push("KEY_RECEIPT_TIME_INVALID");
  else{
    if(validFrom!==null&&receiptTime<validFrom) reasons.push("KEY_NOT_YET_VALID");
    if(validUntil!==null&&receiptTime>validUntil) reasons.push("KEY_EXPIRED");
  }

  const provider=clean(runtimeProvider,120);
  const ref=clean(runtimeRef,512);
  if(!entry.runtime_provider_scope.map((item)=>clean(item,120)).includes(provider)) reasons.push("KEY_RUNTIME_PROVIDER_NOT_ALLOWED");
  if(!entry.runtime_ref_prefixes.map((item)=>clean(item,512)).some((prefix)=>ref.startsWith(prefix))) reasons.push("KEY_RUNTIME_REF_NOT_ALLOWED");

  if(entry.status==="REVOKED"){
    if(entry.historical_policy==="REJECT_ALL"){
      reasons.push("KEY_REVOKED");
    }else{
      const cutoff=instant(entry.compromise_cutoff);
      if(receiptTime===null||cutoff===null||receiptTime>=cutoff) reasons.push("KEY_COMPROMISED_AFTER_CUTOFF");
    }
  }

  return Object.freeze({
    ok:reasons.length===0,
    reasons:Object.freeze(uniq(reasons)),
    entry:Object.freeze({...entry}),
    public_key_pem:entry.public_key_pem,
    registry_errors:Object.freeze([]),
  });
}

export function analyzeRotationOverlap(registry,oldKeyId,newKeyId){
  const errors=validateReceiptTrustRegistry(registry);
  if(errors.length) return Object.freeze({ok:false,reasons:Object.freeze(["TRUST_REGISTRY_INVALID"]),overlap:null});
  const oldKey=registry.keys.find((item)=>item.key_id===oldKeyId);
  const newKey=registry.keys.find((item)=>item.key_id===newKeyId);
  if(!oldKey||!newKey) return Object.freeze({ok:false,reasons:Object.freeze(["ROTATION_KEY_MISSING"]),overlap:null});
  const start=Math.max(instant(oldKey.valid_from),instant(newKey.valid_from));
  const oldEnd=oldKey.valid_until==null?Infinity:instant(oldKey.valid_until);
  const newEnd=newKey.valid_until==null?Infinity:instant(newKey.valid_until);
  const end=Math.min(oldEnd,newEnd);
  if(end<start) return Object.freeze({ok:false,reasons:Object.freeze(["ROTATION_WINDOW_DOES_NOT_OVERLAP"]),overlap:null});
  return Object.freeze({
    ok:true,
    reasons:Object.freeze([]),
    overlap:Object.freeze({
      from:new Date(start).toISOString(),
      until:Number.isFinite(end)?new Date(end).toISOString():null,
    }),
  });
}
