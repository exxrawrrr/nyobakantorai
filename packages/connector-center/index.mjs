import { createHash } from "node:crypto";

export const CONNECTOR_CENTER_API = 1;
export const CONNECTOR_STATES = Object.freeze([
  "NOT_CONNECTED",
  "CONNECTED",
  "DISCONNECTED",
  "REVOKED",
  "EXPIRED",
  "ERROR",
]);
export const CONNECTOR_ACCESS_MODES = Object.freeze(["READ","WRITE"]);

const STATE_SET=new Set(CONNECTOR_STATES);
const ACCESS_SET=new Set(CONNECTOR_ACCESS_MODES);
const clean=(value,max=1000)=>String(value??"").trim().slice(0,max);
const nonEmpty=(value)=>typeof value==="string"&&value.trim().length>0;

function assert(condition,message){ if(!condition) throw new Error(message); }

function canonicalize(value){
  if(Array.isArray(value)) return value.map(canonicalize);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonicalize(value[key])]));
  }
  if(typeof value==="number"&&Object.is(value,-0)) return 0;
  return value;
}

function sha256Ref(prefix,payload){
  return prefix+createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function sortedUnique(values,normalize=(value)=>value){
  return Object.freeze([...new Set((Array.isArray(values)?values:[]).map(normalize).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b))));
}

function validTime(value){ return nonEmpty(value)&&!Number.isNaN(Date.parse(value)); }

function assertNoRawSecrets(value,path="root"){
  if(!value||typeof value!=="object") return;
  for(const [key,item] of Object.entries(value)){
    const normalized=key.toLowerCase();
    const looksSecretField=/^(api_?key|access_?token|refresh_?token|client_?secret|password|credential|credentials|secret)$/.test(normalized);
    const isReference=/_ref$/.test(normalized)||normalized==="credential_ref";
    if(looksSecretField&&!isReference&&item!=null&&String(item).trim()!==""){
      throw new Error("Raw connector secret field is forbidden: "+path+"."+key);
    }
    if(item&&typeof item==="object") assertNoRawSecrets(item,path+"."+key);
  }
}

export function normalizeCredentialRef(value,{required=false,allowedPrefixes=["secret://","env://","connector-secret://"]}={}){
  const ref=value==null?null:clean(value,1000);
  if(ref==null||ref===""){
    if(required) throw new Error("Connector credential_ref is required.");
    return null;
  }
  assert(!/\s/.test(ref),"Connector credential_ref cannot contain whitespace.");
  assert(allowedPrefixes.some((prefix)=>ref.startsWith(prefix)),"Connector credential_ref must use an approved reference scheme.");
  assert(!/[?&=]/.test(ref),"Connector credential_ref must be an opaque reference, not an embedded credential/query string.");
  return ref;
}

export function normalizeConnectorDefinition(input={}){
  assertNoRawSecrets(input);
  assert(input?.schema===1,"Connector definition schema must be 1.");
  const id=clean(input.id,80).toLowerCase();
  const provider=clean(input.provider,120).toLowerCase();
  const label=clean(input.label||id,160);
  const defaultState=clean(input.default_state||"NOT_CONNECTED",40).toUpperCase();
  assert(/^[a-z][a-z0-9-]{1,79}$/.test(id),"Connector id must be a lowercase slug.");
  assert(provider,"Connector provider is required.");
  assert(STATE_SET.has(defaultState),"Connector default_state is invalid.");
  assert(defaultState==="NOT_CONNECTED","Repository connector definitions must default to NOT_CONNECTED.");

  const capabilities=sortedUnique(input.capabilities,(value)=>clean(value,160));
  assert(capabilities.length>0,"Connector definition capabilities are required.");
  const accessModes=sortedUnique(input.access_modes,(value)=>clean(value,40).toUpperCase());
  assert(accessModes.length>0,"Connector definition access_modes are required.");
  for(const mode of accessModes) assert(ACCESS_SET.has(mode),"Connector access mode is invalid: "+mode);

  const resourceTypes=sortedUnique(input.resource_types,(value)=>clean(value,120).toLowerCase());
  assert(resourceTypes.length>0,"Connector resource_types are required.");

  const authMode=clean(input.auth?.mode||"NONE",60).toUpperCase();
  assert(["NONE","SECRET_REF_REQUIRED","SECRET_REF_OPTIONAL"].includes(authMode),"Connector auth.mode is invalid.");
  const allowedPrefixes=sortedUnique(input.auth?.allowed_ref_prefixes?.length?input.auth.allowed_ref_prefixes:["secret://","env://","connector-secret://"],(value)=>clean(value,80));
  if(authMode!=="NONE") assert(allowedPrefixes.length>0,"Secret-reference auth requires allowed_ref_prefixes.");

  return Object.freeze({
    schema:1,
    id,
    provider,
    label,
    default_state:defaultState,
    capabilities,
    access_modes:accessModes,
    resource_types:resourceTypes,
    auth:Object.freeze({mode:authMode,allowed_ref_prefixes:allowedPrefixes}),
    verification_method:clean(input.verification_method,1000)||null,
  });
}

export function normalizeConnectorRegistry(input={}){
  assert(input?.schema===1,"Connector registry schema must be 1.");
  const connectors=Object.freeze((Array.isArray(input.connectors)?input.connectors:[]).map(normalizeConnectorDefinition));
  const ids=connectors.map((item)=>item.id);
  assert(new Set(ids).size===ids.length,"Connector registry ids must be unique.");
  return Object.freeze({schema:1,connectors});
}

function connectionPayload(input){
  return Object.freeze({
    schema:1,
    connection_id:input.connection_id,
    connector_id:input.connector_id,
    state:input.state,
    connected_at:input.connected_at,
    disconnected_at:input.disconnected_at,
    revoked_at:input.revoked_at,
    expires_at:input.expires_at,
    evidence_ref:input.evidence_ref,
    credential_ref_sha256:input.credential_ref_sha256,
    previous_connection_ref:input.previous_connection_ref,
    lifecycle_seq:input.lifecycle_seq,
  });
}

function definitionById(registry,id){
  const normalized=normalizeConnectorRegistry(registry);
  const item=normalized.connectors.find((connector)=>connector.id===id);
  assert(item,"Unknown connector: "+id);
  return item;
}

export function createConnectorConnection({
  registry,
  connectionId,
  connectorId,
}={}){
  const id=clean(connectionId,160);
  const connector=definitionById(registry,clean(connectorId,80).toLowerCase());
  assert(id,"Connector connectionId is required.");
  const payload={
    schema:1,
    connection_id:id,
    connector_id:connector.id,
    state:"NOT_CONNECTED",
    connected_at:null,
    disconnected_at:null,
    revoked_at:null,
    expires_at:null,
    evidence_ref:null,
    credential_ref_sha256:null,
    previous_connection_ref:null,
    lifecycle_seq:0,
  };
  return Object.freeze({
    ...payload,
    credential_ref:null,
    connection_ref:sha256Ref("connector-connection:sha256:",connectionPayload(payload)),
  });
}

export function normalizeConnectorConnection(input,{registry}={}){
  assertNoRawSecrets(input);
  assert(input?.schema===1,"Connector connection schema must be 1.");
  const connector=definitionById(registry,clean(input.connector_id,80).toLowerCase());
  const connectionId=clean(input.connection_id,160);
  const state=clean(input.state,40).toUpperCase();
  assert(connectionId,"Connector connection_id is required.");
  assert(STATE_SET.has(state),"Connector connection state is invalid.");
  const credentialRef=normalizeCredentialRef(input.credential_ref,{
    required:false,
    allowedPrefixes:connector.auth.allowed_ref_prefixes,
  });
  const payload={
    schema:1,
    connection_id:connectionId,
    connector_id:connector.id,
    state,
    connected_at:input.connected_at==null?null:new Date(input.connected_at).toISOString(),
    disconnected_at:input.disconnected_at==null?null:new Date(input.disconnected_at).toISOString(),
    revoked_at:input.revoked_at==null?null:new Date(input.revoked_at).toISOString(),
    expires_at:input.expires_at==null?null:new Date(input.expires_at).toISOString(),
    evidence_ref:input.evidence_ref==null?null:clean(input.evidence_ref,1000)||null,
    credential_ref_sha256:input.credential_ref_sha256==null?null:clean(input.credential_ref_sha256,64),
    previous_connection_ref:input.previous_connection_ref==null?null:clean(input.previous_connection_ref,1000)||null,
    lifecycle_seq:Number(input.lifecycle_seq),
  };
  for(const key of ["connected_at","disconnected_at","revoked_at","expires_at"]){
    if(payload[key]!=null) assert(validTime(payload[key]),"Connector "+key+" is invalid.");
  }
  assert(Number.isInteger(payload.lifecycle_seq)&&payload.lifecycle_seq>=0,"Connector lifecycle_seq must be a non-negative integer.");
  const credentialHash=credentialRef==null?null:createHash("sha256").update(credentialRef).digest("hex");
  assert(payload.credential_ref_sha256===credentialHash,"Connector credential_ref hash mismatch.");
  const expected=sha256Ref("connector-connection:sha256:",connectionPayload(payload));
  assert(clean(input.connection_ref,200)===expected,"Connector connection_ref checksum mismatch.");
  if(state==="CONNECTED"){
    assert(payload.evidence_ref,"CONNECTED connector requires evidence_ref.");
    if(connector.auth.mode==="SECRET_REF_REQUIRED") assert(credentialRef,"CONNECTED connector requires credential_ref reference.");
  }
  if(state==="REVOKED") assert(payload.revoked_at,"REVOKED connector requires revoked_at.");
  return Object.freeze({...payload,credential_ref:credentialRef,connection_ref:expected});
}

export function transitionConnectorConnection(connection,event,{registry,at,evidenceRef=null,credentialRef=null,expiresAt=null}={}){
  const current=normalizeConnectorConnection(connection,{registry});
  const connector=definitionById(registry,current.connector_id);
  const type=clean(event,40).toUpperCase();
  const when=clean(at,80);
  assert(validTime(when),"Connector transition requires valid at timestamp.");
  assert(["CONNECT","DISCONNECT","REVOKE","EXPIRE","ERROR"].includes(type),"Unsupported connector transition.");
  assert(current.state!=="REVOKED","REVOKED connector is terminal.");

  let nextState=current.state;
  let nextCredential=current.credential_ref;
  let connectedAt=current.connected_at;
  let disconnectedAt=current.disconnected_at;
  let revokedAt=current.revoked_at;
  let nextExpires=current.expires_at;
  let evidence=current.evidence_ref;

  if(type==="CONNECT"){
    assert(["NOT_CONNECTED","DISCONNECTED","ERROR","EXPIRED"].includes(current.state),"CONNECT transition is not valid from "+current.state);
    nextCredential=normalizeCredentialRef(credentialRef??current.credential_ref,{
      required:connector.auth.mode==="SECRET_REF_REQUIRED",
      allowedPrefixes:connector.auth.allowed_ref_prefixes,
    });
    if(connector.auth.mode==="NONE") nextCredential=null;
    const ref=clean(evidenceRef,1000);
    assert(ref,"CONNECT requires evidenceRef.");
    nextState="CONNECTED";
    connectedAt=new Date(when).toISOString();
    disconnectedAt=null;
    evidence=ref;
    if(expiresAt!=null){
      assert(validTime(expiresAt),"CONNECT expiresAt is invalid.");
      assert(Date.parse(expiresAt)>Date.parse(when),"CONNECT expiresAt must be after connect time.");
      nextExpires=new Date(expiresAt).toISOString();
    } else nextExpires=null;
  } else if(type==="DISCONNECT"){
    assert(current.state==="CONNECTED","DISCONNECT requires CONNECTED state.");
    nextState="DISCONNECTED";
    disconnectedAt=new Date(when).toISOString();
    evidence=clean(evidenceRef,1000)||current.evidence_ref;
  } else if(type==="REVOKE"){
    nextState="REVOKED";
    revokedAt=new Date(when).toISOString();
    disconnectedAt=current.state==="CONNECTED"?new Date(when).toISOString():current.disconnected_at;
    nextCredential=null;
    evidence=clean(evidenceRef,1000)||current.evidence_ref;
  } else if(type==="EXPIRE"){
    assert(current.expires_at&&Date.parse(when)>=Date.parse(current.expires_at),"EXPIRE requires reached expires_at.");
    nextState="EXPIRED";
    disconnectedAt=current.state==="CONNECTED"?new Date(when).toISOString():current.disconnected_at;
    nextCredential=null;
  } else {
    nextState="ERROR";
    disconnectedAt=current.state==="CONNECTED"?new Date(when).toISOString():current.disconnected_at;
    evidence=clean(evidenceRef,1000)||current.evidence_ref;
  }

  const payload={
    schema:1,
    connection_id:current.connection_id,
    connector_id:current.connector_id,
    state:nextState,
    connected_at:connectedAt,
    disconnected_at:disconnectedAt,
    revoked_at:revokedAt,
    expires_at:nextExpires,
    evidence_ref:evidence,
    credential_ref_sha256:nextCredential==null?null:createHash("sha256").update(nextCredential).digest("hex"),
    previous_connection_ref:current.connection_ref,
    lifecycle_seq:current.lifecycle_seq+1,
  };
  return Object.freeze({
    ...payload,
    credential_ref:nextCredential,
    connection_ref:sha256Ref("connector-connection:sha256:",connectionPayload(payload)),
  });
}

function grantPayload(input){
  return Object.freeze({
    schema:1,
    grant_id:input.grant_id,
    employee_id:input.employee_id,
    connector_id:input.connector_id,
    capability_id:input.capability_id,
    access_modes:input.access_modes,
    actions:input.actions,
    resources:input.resources,
    issued_at:input.issued_at,
    expires_at:input.expires_at,
    revoked_at:input.revoked_at,
    evidence_ref:input.evidence_ref,
    revocation_evidence_ref:input.revocation_evidence_ref,
  });
}

function normalizeResource(input={}){
  const resourceType=clean(input.resource_type,120).toLowerCase();
  const resourceId=clean(input.resource_id,240);
  assert(resourceType&&resourceId,"Connector grant resource_type and resource_id are required.");
  assert(resourceId!=="*"&&!resourceId.includes("*"),"Connector grants do not support wildcard resources.");
  return Object.freeze({resource_type:resourceType,resource_id:resourceId});
}

export function createConnectorGrant(input,{registry}={}){
  assertNoRawSecrets(input);
  assert(input?.schema===1,"Connector grant schema must be 1.");
  const connector=definitionById(registry,clean(input.connector_id,80).toLowerCase());
  const grantId=clean(input.grant_id,160);
  const employeeId=clean(input.employee_id,40).toLowerCase();
  const capabilityId=clean(input.capability_id,160);
  assert(grantId&&employeeId&&capabilityId,"Connector grant id, employee, and capability are required.");
  assert(connector.capabilities.includes(capabilityId),"Connector grant capability is not exposed by connector.");

  const accessModes=sortedUnique(input.access_modes,(value)=>clean(value,40).toUpperCase());
  assert(accessModes.length>0,"Connector grant access_modes are required.");
  for(const mode of accessModes){
    assert(ACCESS_SET.has(mode),"Connector grant access mode is invalid.");
    assert(connector.access_modes.includes(mode),"Connector grant access mode exceeds connector capability.");
  }
  const actions=sortedUnique(input.actions,(value)=>clean(value,160).toLowerCase());
  assert(actions.length>0,"Connector grant actions are required.");
  const resources=Object.freeze((Array.isArray(input.resources)?input.resources:[]).map(normalizeResource).sort((a,b)=>a.resource_type.localeCompare(b.resource_type)||a.resource_id.localeCompare(b.resource_id)));
  assert(resources.length>0,"Connector grant resources are required.");
  assert(resources.every((item)=>connector.resource_types.includes(item.resource_type)),"Connector grant resource type exceeds connector definition.");
  const resourceKeys=resources.map((item)=>item.resource_type+"\0"+item.resource_id);
  assert(new Set(resourceKeys).size===resourceKeys.length,"Connector grant resources must be unique.");

  const issuedAt=clean(input.issued_at,80);
  assert(validTime(issuedAt),"Connector grant issued_at is invalid.");
  const expiresAt=input.expires_at==null?null:clean(input.expires_at,80);
  if(expiresAt!=null){
    assert(validTime(expiresAt)&&Date.parse(expiresAt)>Date.parse(issuedAt),"Connector grant expires_at must be after issued_at.");
  }
  const evidenceRef=clean(input.evidence_ref,1000);
  assert(evidenceRef,"Connector grant evidence_ref is required.");

  const payload={
    schema:1,
    grant_id:grantId,
    employee_id:employeeId,
    connector_id:connector.id,
    capability_id:capabilityId,
    access_modes:accessModes,
    actions,
    resources,
    issued_at:new Date(issuedAt).toISOString(),
    expires_at:expiresAt==null?null:new Date(expiresAt).toISOString(),
    revoked_at:null,
    evidence_ref:evidenceRef,
    revocation_evidence_ref:null,
  };
  return Object.freeze({...payload,grant_ref:sha256Ref("connector-grant:sha256:",grantPayload(payload))});
}

export function normalizeConnectorGrant(input,{registry}={}){
  const base=createConnectorGrant({...input,revoked_at:undefined,revocation_evidence_ref:undefined},{registry});
  const revokedAt=input.revoked_at==null?null:clean(input.revoked_at,80);
  const revocationEvidence=input.revocation_evidence_ref==null?null:clean(input.revocation_evidence_ref,1000)||null;
  if(revokedAt!=null){
    assert(validTime(revokedAt)&&Date.parse(revokedAt)>=Date.parse(base.issued_at),"Connector grant revoked_at is invalid.");
    assert(revocationEvidence,"Revoked connector grant requires revocation_evidence_ref.");
  }
  const payload={
    ...grantPayload(base),
    revoked_at:revokedAt==null?null:new Date(revokedAt).toISOString(),
    revocation_evidence_ref:revocationEvidence,
  };
  const expected=sha256Ref("connector-grant:sha256:",payload);
  assert(clean(input.grant_ref,200)===expected,"Connector grant_ref checksum mismatch.");
  return Object.freeze({...payload,grant_ref:expected});
}

export function revokeConnectorGrant(grant,{registry,at,evidenceRef}={}){
  const current=normalizeConnectorGrant(grant,{registry});
  assert(current.revoked_at==null,"Connector grant is already revoked.");
  assert(validTime(at),"Connector grant revocation requires valid at timestamp.");
  assert(Date.parse(at)>=Date.parse(current.issued_at),"Connector grant cannot be revoked before issuance.");
  const revocationEvidence=clean(evidenceRef,1000);
  assert(revocationEvidence,"Connector grant revocation requires evidenceRef.");
  const payload={
    ...grantPayload(current),
    revoked_at:new Date(at).toISOString(),
    revocation_evidence_ref:revocationEvidence,
  };
  return Object.freeze({...payload,grant_ref:sha256Ref("connector-grant:sha256:",payload)});
}

function effectiveConnectionState(connection,now){
  if(connection.state==="REVOKED") return "REVOKED";
  if(connection.expires_at&&Date.parse(now)>=Date.parse(connection.expires_at)) return "EXPIRED";
  return connection.state;
}

function routePayload(input){
  return Object.freeze({
    schema:1,
    employee_id:input.employee_id,
    connector_id:input.connector_id,
    capability_id:input.capability_id,
    access_mode:input.access_mode,
    action:input.action,
    resource:input.resource,
    connection:input.connection,
    grant:input.grant,
    decision:input.decision,
    reason:input.reason,
    allowed:input.allowed,
  });
}

export function authorizeConnectorAction({
  registry,
  connections=[],
  grants=[],
  employeeId,
  connectorId,
  capabilityId,
  accessMode,
  action,
  resource,
  now=new Date().toISOString(),
}={}){
  const connector=definitionById(registry,clean(connectorId,80).toLowerCase());
  const employee=clean(employeeId,40).toLowerCase();
  const capability=clean(capabilityId,160);
  const mode=clean(accessMode,40).toUpperCase();
  const normalizedAction=clean(action,160).toLowerCase();
  const target=normalizeResource(resource);
  assert(employee&&capability&&normalizedAction,"Connector authorization employee/capability/action are required.");
  assert(validTime(now),"Connector authorization now is invalid.");
  assert(connector.capabilities.includes(capability),"Connector does not expose capability: "+capability);
  assert(ACCESS_SET.has(mode)&&connector.access_modes.includes(mode),"Connector access mode is not supported.");
  assert(connector.resource_types.includes(target.resource_type),"Connector resource type is not supported.");

  const normalizedConnections=(Array.isArray(connections)?connections:[]).map((item)=>normalizeConnectorConnection(item,{registry}))
    .filter((item)=>item.connector_id===connector.id)
    .sort((a,b)=>b.lifecycle_seq-a.lifecycle_seq||a.connection_id.localeCompare(b.connection_id));
  const connection=normalizedConnections.find((item)=>effectiveConnectionState(item,now)==="CONNECTED")||null;
  if(!connection){
    const observed=normalizedConnections[0]||null;
    return Object.freeze({
      allowed:false,decision:"BLOCKED",reason:observed?("CONNECTOR_"+effectiveConnectionState(observed,now)):"CONNECTOR_NOT_CONNECTED",
      employee_id:employee,connector_id:connector.id,capability_id:capability,access_mode:mode,action:normalizedAction,resource:target,
      connection:observed?Object.freeze({
        connection_id:observed.connection_id,state:effectiveConnectionState(observed,now),evidence_ref:observed.evidence_ref,
        connected_at:observed.connected_at,expires_at:observed.expires_at,connection_ref:observed.connection_ref,
      }):null,
      grant:null,
    });
  }

  const normalizedGrants=(Array.isArray(grants)?grants:[]).map((item)=>normalizeConnectorGrant(item,{registry}));
  const candidate=normalizedGrants.find((grant)=>
    grant.employee_id===employee&&grant.connector_id===connector.id&&grant.capability_id===capability
    &&grant.access_modes.includes(mode)&&grant.actions.includes(normalizedAction)
    &&grant.resources.some((item)=>item.resource_type===target.resource_type&&item.resource_id===target.resource_id)
  )||null;

  if(!candidate){
    return Object.freeze({
      allowed:false,decision:"BLOCKED",reason:"CONNECTOR_GRANT_MISSING",
      employee_id:employee,connector_id:connector.id,capability_id:capability,access_mode:mode,action:normalizedAction,resource:target,
      connection:Object.freeze({
        connection_id:connection.connection_id,state:"CONNECTED",evidence_ref:connection.evidence_ref,
        connected_at:connection.connected_at,expires_at:connection.expires_at,connection_ref:connection.connection_ref,
      }),
      grant:null,
    });
  }

  if(Date.parse(candidate.issued_at)>Date.parse(now)){
    return Object.freeze({...authorizeConnectorAction({
      registry,connections,grants:[],employeeId,connectorId,capabilityId,accessMode,action,resource,now,
    }),reason:"CONNECTOR_GRANT_NOT_YET_VALID",grant:candidate});
  }
  if(candidate.revoked_at!=null){
    return Object.freeze({...authorizeConnectorAction({
      registry,connections,grants:[],employeeId,connectorId,capabilityId,accessMode,action,resource,now,
    }),reason:"CONNECTOR_GRANT_REVOKED",grant:candidate});
  }
  if(candidate.expires_at&&Date.parse(now)>=Date.parse(candidate.expires_at)){
    return Object.freeze({...authorizeConnectorAction({
      registry,connections,grants:[],employeeId,connectorId,capabilityId,accessMode,action,resource,now,
    }),reason:"CONNECTOR_GRANT_EXPIRED",grant:candidate});
  }

  const connectionSummary=Object.freeze({
    connection_id:connection.connection_id,
    state:"CONNECTED",
    evidence_ref:connection.evidence_ref,
    connected_at:connection.connected_at,
    expires_at:connection.expires_at,
    connection_ref:connection.connection_ref,
  });
  const grantSummary=Object.freeze({
    grant_id:candidate.grant_id,
    grant_ref:candidate.grant_ref,
    evidence_ref:candidate.evidence_ref,
    issued_at:candidate.issued_at,
    expires_at:candidate.expires_at,
  });
  const payload={
    schema:1,
    employee_id:employee,
    connector_id:connector.id,
    capability_id:capability,
    access_mode:mode,
    action:normalizedAction,
    resource:target,
    connection:connectionSummary,
    grant:grantSummary,
    decision:mode==="READ"?"AUTHORIZED_CONNECTOR_READ":"AUTHORIZED_CONNECTOR_WRITE",
    reason:"CONNECTED_AND_EXACT_CONNECTOR_GRANT",
    allowed:true,
  };
  return Object.freeze({...payload,connector_route_ref:sha256Ref("connector-route:sha256:",routePayload(payload))});
}

export function validateConnectorRouteDecision(route={}){
  assert(route?.allowed===true,"Connector route must be allowed.");
  assert(/^connector-route:sha256:[a-f0-9]{64}$/.test(clean(route.connector_route_ref,200)),"Connector route ref is invalid.");
  assert(route.connection?.state==="CONNECTED","Connector route requires CONNECTED connection evidence.");
  assert(route.grant?.grant_ref,"Connector route requires grant_ref.");
  const expected=sha256Ref("connector-route:sha256:",routePayload(route));
  assert(expected===route.connector_route_ref,"Connector route ref does not match route content.");
  return true;
}

export function buildCapabilitySnapshotFromConnector(route,{checkedAt=new Date().toISOString()}={}){
  validateConnectorRouteDecision(route);
  assert(validTime(checkedAt),"Connector capability snapshot checkedAt is invalid.");
  return Object.freeze({
    provider_id:"connector:"+route.connector_id,
    checked_at:new Date(checkedAt).toISOString(),
    capabilities:Object.freeze({
      [route.capability_id]:Object.freeze({
        state:"CONNECTED",
        evidence_ref:route.connection.evidence_ref,
        detail:"Authorized connector route "+route.connector_route_ref,
      }),
    }),
  });
}
