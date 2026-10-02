import { createHash } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateCapabilityRouteDecision } from "../capability-router/index.mjs";
import { validateConnectorRouteDecision } from "../connector-center/index.mjs";
import { detectPromptInjection } from "../evidence-verifier/index.mjs";

export const BROWSER_AGENT_API=1;
export const BROWSER_ACTION_MODES=Object.freeze(["READ","MUTATION"]);
export const BROWSER_FLOWS=Object.freeze(["PUBLIC_RESEARCH","USER_OWNED_AUDIT","LOCALHOST_QA"]);
export const BROWSER_READ_ACTIONS=Object.freeze(["NAVIGATE","INSPECT_TEXT","EXTRACT_STRUCTURED","SCREENSHOT"]);
export const BROWSER_MUTATION_ACTIONS=Object.freeze(["CLICK","TYPE","SELECT","UPLOAD","SUBMIT","DOWNLOAD","DRAG_DROP","DELETE"]);
export const BROWSER_INSTRUCTION_SOURCES=Object.freeze(["USER","MISSION_PLAN","PAGE_CONTENT"]);

const READ_SET=new Set(BROWSER_READ_ACTIONS);
const MUTATION_SET=new Set(BROWSER_MUTATION_ACTIONS);
const FLOW_SET=new Set(BROWSER_FLOWS);
const SOURCE_SET=new Set(BROWSER_INSTRUCTION_SOURCES);
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

function sha256(value){
  return createHash("sha256").update(String(value)).digest("hex");
}

function contentRef(prefix,payload){
  return prefix+createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function sortedUnique(values,normalize=(value)=>value){
  return Object.freeze([...new Set((Array.isArray(values)?values:[]).map(normalize).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b))));
}

function validTime(value){ return nonEmpty(value)&&!Number.isNaN(Date.parse(value)); }

function normalizeOpaqueRef(value,label,{required=true}={}){
  const ref=value==null?null:clean(value,1000);
  if(!ref){
    if(required) throw new Error(label+" is required.");
    return null;
  }
  assert(/^[a-z][a-z0-9+.-]*:/i.test(ref),label+" must use a reference scheme.");
  assert(!/\s/.test(ref),label+" cannot contain whitespace.");
  return ref;
}

function normalizeUrl(value,label="Browser URL"){
  let url;
  try{ url=new URL(String(value??"")); }
  catch{ throw new Error(label+" must be a valid URL."); }
  assert(["http:","https:"].includes(url.protocol),label+" must use http/https.");
  assert(!url.username&&!url.password,label+" cannot embed credentials.");
  url.hash="";
  return url;
}

function normalizedOrigin(value){
  return normalizeUrl(value,"Browser origin").origin;
}

function isIpv4(host){
  const parts=host.split(".");
  return parts.length===4&&parts.every((part)=>{
    if(!/^\d{1,3}$/.test(part)) return false;
    const n=Number(part);
    return n>=0&&n<=255;
  });
}

function isLoopbackHost(hostname){
  const host=String(hostname||"").toLowerCase().replace(/^\[|\]$/g,"");
  if(host==="localhost"||host==="::1") return true;
  if(isIpv4(host)) return Number(host.split(".")[0])===127;
  return false;
}

function isNonPublicLiteralHost(hostname){
  const host=String(hostname||"").toLowerCase().replace(/^\[|\]$/g,"");
  if(isLoopbackHost(host)) return true;
  if(host==="0.0.0.0"||host==="::"||host.endsWith(".local")) return true;
  if(!isIpv4(host)) return false;
  const [a,b]=host.split(".").map(Number);
  if(a===10||a===0) return true;
  if(a===169&&b===254) return true;
  if(a===172&&b>=16&&b<=31) return true;
  if(a===192&&b===168) return true;
  if(a===100&&b>=64&&b<=127) return true;
  if(a===198&&(b===18||b===19)) return true;
  return false;
}

export function validateBrowserAgentPolicy(policy={}){
  const errors=[];
  if(policy?.schema!==1) errors.push("Browser Agent policy schema must be 1.");
  if(JSON.stringify(policy?.action_modes)!==JSON.stringify(BROWSER_ACTION_MODES)) errors.push("Browser Agent action_modes drift.");
  if(JSON.stringify(policy?.read_actions)!==JSON.stringify(BROWSER_READ_ACTIONS)) errors.push("Browser Agent read_actions drift.");
  if(JSON.stringify(policy?.mutation_actions)!==JSON.stringify(BROWSER_MUTATION_ACTIONS)) errors.push("Browser Agent mutation_actions drift.");
  if(JSON.stringify(policy?.instruction_sources)!==JSON.stringify(BROWSER_INSTRUCTION_SOURCES)) errors.push("Browser Agent instruction_sources drift.");
  for(const flow of BROWSER_FLOWS){
    const item=policy?.flows?.[flow];
    if(!item) { errors.push("Browser Agent flow missing: "+flow); continue; }
    if(!Array.isArray(item.allowed_protocols)||!item.allowed_protocols.length) errors.push(flow+": allowed_protocols required.");
    if(item.require_exact_origin_scope!==true) errors.push(flow+": exact origin scope required.");
  }
  if(policy?.flows?.PUBLIC_RESEARCH?.mutations_allowed!==false) errors.push("PUBLIC_RESEARCH mutations must be forbidden.");
  if(policy?.flows?.PUBLIC_RESEARCH?.public_network_only!==true) errors.push("PUBLIC_RESEARCH must be public-network-only.");
  if(policy?.flows?.USER_OWNED_AUDIT?.ownership_evidence_required!==true) errors.push("USER_OWNED_AUDIT ownership evidence required.");
  if(policy?.flows?.LOCALHOST_QA?.loopback_only!==true) errors.push("LOCALHOST_QA must be loopback-only.");
  for(const flow of BROWSER_FLOWS){
    if(policy?.flows?.[flow]?.authentication_allowed!==false) errors.push(flow+": authentication must remain disabled in Browser Agent v1.");
  }
  for(const field of ["page_content_is_untrusted","page_content_cannot_expand_scope","page_content_cannot_approve","page_content_cannot_request_mutation","detected_injection_blocks_mutation","detected_injection_is_recorded_on_read"]){
    if(policy?.injection_policy?.[field]!==true) errors.push("Browser Agent injection policy requires "+field+".");
  }
  for(const field of ["disposable_required","existing_user_profile_reuse_forbidden","profile_cleanup_required","profile_persistence_forbidden","inherited_cookies_forbidden","auto_login_forbidden"]){
    if(policy?.profile_policy?.[field]!==true) errors.push("Browser Agent profile policy requires "+field+".");
  }
  for(const field of ["route_refs_required","read_result_evidence_required","mutation_pre_state_required","mutation_execution_receipt_required","mutation_post_state_required","mutation_approval_ref_required","action_records_content_addressed"]){
    if(policy?.evidence_policy?.[field]!==true) errors.push("Browser Agent evidence policy requires "+field+".");
  }
  if(!nonEmpty(policy?.claim_limit)) errors.push("Browser Agent claim_limit required.");
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});
}

function scopePayload(input){
  return Object.freeze({
    schema:1,
    employee_id:input.employee_id,
    flow:input.flow,
    allowed_origins:input.allowed_origins,
    ownership_evidence_ref:input.ownership_evidence_ref,
    issued_at:input.issued_at,
    expires_at:input.expires_at,
  });
}

export function createBrowserScope({
  employeeId,
  flow,
  allowedOrigins,
  ownershipEvidenceRef=null,
  issuedAt,
  expiresAt=null,
  policy,
}={}){
  const policyCheck=validateBrowserAgentPolicy(policy);
  assert(policyCheck.ok,"Invalid Browser Agent policy: "+policyCheck.errors.join("; "));
  const employee=clean(employeeId,40).toLowerCase();
  const normalizedFlow=clean(flow,60).toUpperCase();
  assert(employee,"Browser scope employeeId is required.");
  assert(FLOW_SET.has(normalizedFlow),"Browser scope flow is invalid.");
  const flowPolicy=policy.flows[normalizedFlow];
  const origins=sortedUnique(allowedOrigins,(value)=>normalizedOrigin(value));
  assert(origins.length>0,"Browser scope requires exact allowed origins.");
  assert(origins.every((origin)=>origin!=="*"&&!origin.includes("*")),"Browser scope wildcards are forbidden.");
  for(const origin of origins){
    const url=new URL(origin);
    assert(flowPolicy.allowed_protocols.includes(url.protocol),normalizedFlow+" origin protocol is not allowed.");
    if(flowPolicy.loopback_only) assert(isLoopbackHost(url.hostname),normalizedFlow+" requires a loopback origin.");
    if(flowPolicy.public_network_only) assert(!isNonPublicLiteralHost(url.hostname),normalizedFlow+" requires a public-network origin.");
  }
  const ownershipRef=normalizeOpaqueRef(ownershipEvidenceRef,"Browser ownership_evidence_ref",{required:false});
  if(flowPolicy.ownership_evidence_required) assert(ownershipRef,"USER_OWNED_AUDIT requires ownership_evidence_ref.");
  assert(validTime(issuedAt),"Browser scope issuedAt must be a valid timestamp.");
  if(expiresAt!=null){
    assert(validTime(expiresAt),"Browser scope expiresAt must be a valid timestamp.");
    assert(Date.parse(expiresAt)>Date.parse(issuedAt),"Browser scope expiresAt must be after issuedAt.");
  }
  const payload={
    schema:1,
    employee_id:employee,
    flow:normalizedFlow,
    allowed_origins:origins,
    ownership_evidence_ref:ownershipRef,
    issued_at:new Date(issuedAt).toISOString(),
    expires_at:expiresAt==null?null:new Date(expiresAt).toISOString(),
  };
  return Object.freeze({...payload,scope_ref:contentRef("browser-scope:sha256:",scopePayload(payload))});
}

export function validateBrowserScope(scope,{policy,now=new Date().toISOString()}={}){
  assert(scope?.schema===1,"Browser scope schema must be 1.");
  const rebuilt=createBrowserScope({
    employeeId:scope.employee_id,
    flow:scope.flow,
    allowedOrigins:scope.allowed_origins,
    ownershipEvidenceRef:scope.ownership_evidence_ref,
    issuedAt:scope.issued_at,
    expiresAt:scope.expires_at,
    policy,
  });
  assert(rebuilt.scope_ref===clean(scope.scope_ref,200),"Browser scope_ref checksum mismatch.");
  assert(validTime(now),"Browser scope validation now is invalid.");
  assert(Date.parse(rebuilt.issued_at)<=Date.parse(now),"Browser scope is not yet valid.");
  if(rebuilt.expires_at!=null) assert(Date.parse(now)<Date.parse(rebuilt.expires_at),"Browser scope has expired.");
  return true;
}

export function classifyBrowserAction(actionType){
  const type=clean(actionType,80).toUpperCase();
  if(READ_SET.has(type)) return "READ";
  if(MUTATION_SET.has(type)) return "MUTATION";
  throw new Error("Unsupported browser action type: "+type);
}

function normalizePayloadRef(value,{required=false}={}){
  if(value==null||String(value).trim()===""){
    if(required) throw new Error("Browser mutation payload_ref is required.");
    return null;
  }
  return normalizeOpaqueRef(value,"Browser mutation payload_ref");
}

function normalizeBrowserAction(action={}){
  const type=clean(action.type,80).toUpperCase();
  const mode=classifyBrowserAction(type);
  const url=normalizeUrl(action.url).toString();
  const origin=new URL(url).origin;
  const instructionSource=clean(action.instruction_source||"MISSION_PLAN",40).toUpperCase();
  assert(SOURCE_SET.has(instructionSource),"Browser instruction_source is invalid.");
  const selector=action.selector==null?null:clean(action.selector,500)||null;
  for(const rawField of ["text","value","password","file_path","cookie","cookies","authorization","token"]){
    if(Object.hasOwn(action,rawField)&&action[rawField]!=null&&String(action[rawField]).trim()!==""){
      throw new Error("Browser action raw payload field is forbidden: "+rawField);
    }
  }
  const payloadRequired=["TYPE","SELECT","UPLOAD"].includes(type);
  const payloadRef=normalizePayloadRef(action.payload_ref,{required:payloadRequired});
  if(["CLICK","TYPE","SELECT","UPLOAD","SUBMIT","DRAG_DROP","DELETE"].includes(type)){
    assert(selector,"Browser action "+type+" requires selector.");
  }
  return Object.freeze({
    type,mode,url,origin,selector,payload_ref:payloadRef,instruction_source:instructionSource,
  });
}

function planPayload(input){
  return Object.freeze({
    schema:1,
    employee_id:input.employee_id,
    flow:input.flow,
    scope_ref:input.scope_ref,
    allowed_origin:input.allowed_origin,
    ownership_evidence_ref:input.ownership_evidence_ref,
    scope_expires_at:input.scope_expires_at,
    action:input.action,
    connector_route_ref:input.connector_route_ref,
    capability_route_ref:input.capability_route_ref,
    approval_ref:input.approval_ref,
    injection_signals:input.injection_signals,
    content_trust:input.content_trust,
    decision:input.decision,
    reason:input.reason,
    allowed:input.allowed,
  });
}

function routesMatchAction({connectorRoute,capabilityRoute,scope,action}){
  const expectedAccess=action.mode==="READ"?"READ":"WRITE";
  assert(connectorRoute.employee_id===scope.employee_id,"Browser Connector route employee mismatch.");
  assert(capabilityRoute.employee_id===scope.employee_id,"Browser Capability route employee mismatch.");
  assert(connectorRoute.connector_id==="playwright-mcp-browser","Browser Connector route must use playwright-mcp-browser.");
  assert(connectorRoute.capability_id==="browser.structured","Browser Connector route capability mismatch.");
  assert(capabilityRoute.capability?.id==="browser.structured","Browser Capability route capability mismatch.");
  assert(connectorRoute.access_mode===expectedAccess,"Browser Connector route access mode mismatch.");
  assert(capabilityRoute.access_mode===expectedAccess,"Browser Capability route access mode mismatch.");
  assert(connectorRoute.action===action.type.toLowerCase(),"Browser Connector route action mismatch.");
  assert(capabilityRoute.action===action.type.toLowerCase(),"Browser Capability route action mismatch.");
  assert(connectorRoute.resource?.resource_type==="browser_origin","Browser Connector route resource_type must be browser_origin.");
  assert(capabilityRoute.target?.resource_type==="browser_origin","Browser Capability route resource_type must be browser_origin.");
  assert(connectorRoute.resource.resource_id===action.origin,"Browser Connector route exact origin mismatch.");
  assert(capabilityRoute.target.resource_id===action.origin,"Browser Capability route exact origin mismatch.");
}

export function authorizeBrowserAction({
  scope,
  action,
  connectorRoute,
  capabilityRoute,
  policy,
  observedPageText="",
  now=new Date().toISOString(),
}={}){
  validateBrowserScope(scope,{policy,now});
  validateConnectorRouteDecision(connectorRoute);
  validateCapabilityRouteDecision(capabilityRoute);
  const normalizedAction=normalizeBrowserAction(action);
  const flowPolicy=policy.flows[scope.flow];
  const targetUrl=new URL(normalizedAction.url);
  assert(flowPolicy.allowed_protocols.includes(targetUrl.protocol),"Browser action protocol is not allowed for flow.");
  if(flowPolicy.loopback_only) assert(isLoopbackHost(targetUrl.hostname),"LOCALHOST_QA action must remain loopback-only.");
  if(flowPolicy.public_network_only) assert(!isNonPublicLiteralHost(targetUrl.hostname),"PUBLIC_RESEARCH action must remain on public-network targets.");
  assert(scope.allowed_origins.includes(normalizedAction.origin),"Browser action origin is outside exact scope.");
  routesMatchAction({connectorRoute,capabilityRoute,scope,action:normalizedAction});

  const injectionSignals=sortedUnique(detectPromptInjection(observedPageText),(value)=>clean(value,500));
  const contentTrust=injectionSignals.length?"UNTRUSTED_PAGE_DATA":"NO_INJECTION_SIGNAL";

  if(normalizedAction.mode==="MUTATION"){
    if(flowPolicy.mutations_allowed!==true){
      return Object.freeze({
        allowed:false,decision:"BLOCKED",reason:"FLOW_MUTATION_FORBIDDEN",
        employee_id:scope.employee_id,flow:scope.flow,scope_ref:scope.scope_ref,action:normalizedAction,
        injection_signals:injectionSignals,content_trust:contentTrust,
      });
    }
    if(normalizedAction.instruction_source==="PAGE_CONTENT"){
      return Object.freeze({
        allowed:false,decision:"BLOCKED",reason:"PAGE_CONTENT_CANNOT_REQUEST_MUTATION",
        employee_id:scope.employee_id,flow:scope.flow,scope_ref:scope.scope_ref,action:normalizedAction,
        injection_signals:injectionSignals,content_trust:"UNTRUSTED_PAGE_DATA",
      });
    }
    if(injectionSignals.length){
      return Object.freeze({
        allowed:false,decision:"BLOCKED",reason:"PAGE_INJECTION_BLOCKED_MUTATION",
        employee_id:scope.employee_id,flow:scope.flow,scope_ref:scope.scope_ref,action:normalizedAction,
        injection_signals:injectionSignals,content_trust:contentTrust,
      });
    }
    assert(capabilityRoute.approval_status==="APPROVED","Browser mutation requires APPROVED capability route.");
    assert(nonEmpty(capabilityRoute.approval_ref),"Browser mutation requires approval_ref.");
  }

  const payload={
    schema:1,
    employee_id:scope.employee_id,
    flow:scope.flow,
    scope_ref:scope.scope_ref,
    allowed_origin:normalizedAction.origin,
    ownership_evidence_ref:scope.ownership_evidence_ref,
    scope_expires_at:scope.expires_at,
    action:normalizedAction,
    connector_route_ref:connectorRoute.connector_route_ref,
    capability_route_ref:capabilityRoute.capability_route_ref,
    approval_ref:normalizedAction.mode==="MUTATION"?capabilityRoute.approval_ref:null,
    injection_signals:injectionSignals,
    content_trust:contentTrust,
    decision:normalizedAction.mode==="READ"?"AUTHORIZED_BROWSER_READ":"AUTHORIZED_BROWSER_MUTATION",
    reason:normalizedAction.mode==="READ"?"EXACT_SCOPE_AND_ROUTES":"EXACT_SCOPE_ROUTES_AND_APPROVAL",
    allowed:true,
  };
  return Object.freeze({...payload,plan_ref:contentRef("browser-action-plan:sha256:",planPayload(payload))});
}

export function validateBrowserActionPlan(plan={}){
  assert(plan?.schema===1,"Browser action plan schema must be 1.");
  assert(plan?.allowed===true,"Browser action plan must be authorized.");
  assert(/^browser-action-plan:sha256:[a-f0-9]{64}$/.test(clean(plan.plan_ref,200)),"Browser action plan_ref is invalid.");
  const expected=contentRef("browser-action-plan:sha256:",planPayload(plan));
  assert(expected===plan.plan_ref,"Browser action plan_ref checksum mismatch.");
  assert(plan.action?.mode==="READ"||plan.action?.mode==="MUTATION","Browser action plan mode is invalid.");
  assert(plan.action?.origin===plan.allowed_origin,"Browser action plan origin mismatch.");
  if(plan.flow==="USER_OWNED_AUDIT") assert(nonEmpty(plan.ownership_evidence_ref),"Browser user-owned audit plan requires ownership evidence.");
  if(plan.scope_expires_at!=null) assert(validTime(plan.scope_expires_at),"Browser action plan scope expiry is invalid.");
  if(plan.action.mode==="MUTATION") assert(nonEmpty(plan.approval_ref),"Browser mutation plan requires approval_ref.");
  return true;
}

export async function createDisposableBrowserProfile({root=tmpdir(),prefix="nyoba-browser-agent-"}={}){
  const createdAt=new Date().toISOString();
  const userDataDir=await mkdtemp(join(root,prefix));
  const profileRef=contentRef("browser-profile:sha256:",{
    disposable:true,
    created_at:createdAt,
    path_sha256:sha256(userDataDir),
  });
  let active=true;
  return Object.freeze({
    api:BROWSER_AGENT_API,
    profile_ref:profileRef,
    user_data_dir:userDataDir,
    disposable:true,
    inherited_cookies:false,
    reused_user_profile:false,
    created_at:createdAt,
    is_active:()=>active,
    async cleanup(){
      if(!active) return;
      active=false;
      await rm(userDataDir,{recursive:true,force:true});
    },
  });
}

export async function assertDisposableBrowserProfile(profile){
  assert(profile?.api===BROWSER_AGENT_API,"Unsupported Browser Agent profile.");
  assert(profile.disposable===true,"Browser Agent requires disposable profile.");
  assert(profile.inherited_cookies===false,"Browser Agent profile cannot inherit cookies.");
  assert(profile.reused_user_profile===false,"Browser Agent cannot reuse a user browser profile.");
  assert(typeof profile.is_active==="function"&&profile.is_active()===true,"Browser Agent profile is not active.");
  assert(nonEmpty(profile.user_data_dir),"Browser Agent profile user_data_dir required.");
  await access(profile.user_data_dir);
  return true;
}

function recordPayload(input){
  return Object.freeze({
    schema:1,
    employee_id:input.employee_id,
    flow:input.flow,
    plan_ref:input.plan_ref,
    profile_ref:input.profile_ref,
    connector_route_ref:input.connector_route_ref,
    capability_route_ref:input.capability_route_ref,
    action:input.action,
    approval_ref:input.approval_ref,
    injection_signals:input.injection_signals,
    content_trust:input.content_trust,
    started_at:input.started_at,
    completed_at:input.completed_at,
    status:input.status,
    before_url:input.before_url,
    after_url:input.after_url,
    provider_evidence_ref:input.provider_evidence_ref,
    screenshot_ref:input.screenshot_ref,
    artifact_refs:input.artifact_refs,
    observed_text_sha256:input.observed_text_sha256,
    external_mutation_observed:input.external_mutation_observed,
    pre_action_state_ref:input.pre_action_state_ref,
    execution_receipt_ref:input.execution_receipt_ref,
    post_action_state_ref:input.post_action_state_ref,
  });
}

function validateExecutionRoutes(plan,connectorRoute,capabilityRoute){
  validateBrowserActionPlan(plan);
  validateConnectorRouteDecision(connectorRoute);
  validateCapabilityRouteDecision(capabilityRoute);
  assert(connectorRoute.connector_route_ref===plan.connector_route_ref,"Browser execution Connector route ref mismatch.");
  assert(capabilityRoute.capability_route_ref===plan.capability_route_ref,"Browser execution Capability route ref mismatch.");
}

export function createBrowserAgent({transport}={}){
  assert(typeof transport==="function","Browser Agent requires a provider transport.");
  return Object.freeze({
    api:BROWSER_AGENT_API,
    async execute({plan,profile,connectorRoute,capabilityRoute}={}){
      validateExecutionRoutes(plan,connectorRoute,capabilityRoute);
      await assertDisposableBrowserProfile(profile);

      const startedAt=new Date().toISOString();
      const request=Object.freeze({
        api:BROWSER_AGENT_API,
        flow:plan.flow,
        action:Object.freeze(structuredClone(plan.action)),
        profile_ref:profile.profile_ref,
        user_data_dir:profile.user_data_dir,
        connector_route_ref:plan.connector_route_ref,
        capability_route_ref:plan.capability_route_ref,
        approval_ref:plan.approval_ref,
      });
      const response=await transport(request);
      assert(response&&typeof response==="object","Browser transport must return an object.");
      const status=clean(response.status||"EXECUTED",40).toUpperCase();
      assert(["EXECUTED","FAILED","PARTIAL"].includes(status),"Browser transport status is invalid.");
      const beforeUrl=normalizeUrl(response.before_url||plan.action.url,"Browser before_url").toString();
      const afterUrl=normalizeUrl(response.after_url||beforeUrl,"Browser after_url").toString();
      assert(new URL(beforeUrl).origin===plan.allowed_origin,"Browser before_url escaped authorized origin.");
      assert(new URL(afterUrl).origin===plan.allowed_origin,"Browser after_url escaped authorized origin.");

      const providerEvidenceRef=normalizeOpaqueRef(response.provider_evidence_ref,"Browser provider_evidence_ref");
      const screenshotRef=normalizeOpaqueRef(response.screenshot_ref,"Browser screenshot_ref",{required:false});
      const artifactRefs=sortedUnique(response.artifact_refs,(value)=>normalizeOpaqueRef(value,"Browser artifact_ref"));
      const observedText=String(response.observed_text??"");
      const externalMutation=response.external_mutation_observed===true;

      if(plan.action.mode==="READ"){
        assert(externalMutation===false,"Browser READ transport reported an external mutation.");
      }

      let preStateRef=null,executionReceiptRef=null,postStateRef=null;
      if(plan.action.mode==="MUTATION"){
        preStateRef=normalizeOpaqueRef(response.pre_action_state_ref,"Browser pre_action_state_ref");
        executionReceiptRef=normalizeOpaqueRef(response.execution_receipt_ref,"Browser execution_receipt_ref");
        postStateRef=normalizeOpaqueRef(response.post_action_state_ref,"Browser post_action_state_ref");
      }

      const completedAt=new Date().toISOString();
      const payload={
        schema:1,
        employee_id:plan.employee_id,
        flow:plan.flow,
        plan_ref:plan.plan_ref,
        profile_ref:profile.profile_ref,
        connector_route_ref:plan.connector_route_ref,
        capability_route_ref:plan.capability_route_ref,
        action:plan.action,
        approval_ref:plan.approval_ref,
        injection_signals:plan.injection_signals,
        content_trust:plan.content_trust,
        started_at:startedAt,
        completed_at:completedAt,
        status,
        before_url:beforeUrl,
        after_url:afterUrl,
        provider_evidence_ref:providerEvidenceRef,
        screenshot_ref:screenshotRef,
        artifact_refs:artifactRefs,
        observed_text_sha256:sha256(observedText),
        external_mutation_observed:externalMutation,
        pre_action_state_ref:preStateRef,
        execution_receipt_ref:executionReceiptRef,
        post_action_state_ref:postStateRef,
      };
      return Object.freeze({...payload,action_record_ref:contentRef("browser-action:sha256:",recordPayload(payload))});
    },
  });
}

export function verifyBrowserActionRecord(record,{plan}={}){
  const errors=[];
  try{ validateBrowserActionPlan(plan); }
  catch(error){ errors.push("PLAN_INVALID: "+error.message); }

  if(record?.schema!==1) errors.push("Browser action record schema must be 1.");
  if(!/^browser-action:sha256:[a-f0-9]{64}$/.test(clean(record?.action_record_ref,200))) errors.push("Browser action_record_ref is invalid.");
  else{
    const expected=contentRef("browser-action:sha256:",recordPayload(record));
    if(expected!==record.action_record_ref) errors.push("Browser action_record_ref checksum mismatch.");
  }
  if(plan?.plan_ref!==record?.plan_ref) errors.push("Browser record plan_ref mismatch.");
  if(plan?.connector_route_ref!==record?.connector_route_ref) errors.push("Browser record connector_route_ref mismatch.");
  if(plan?.capability_route_ref!==record?.capability_route_ref) errors.push("Browser record capability_route_ref mismatch.");
  if(plan?.flow!==record?.flow) errors.push("Browser record flow mismatch.");
  if(plan?.approval_ref!==record?.approval_ref) errors.push("Browser record approval_ref mismatch.");
  if(JSON.stringify(plan?.action)!==JSON.stringify(record?.action)) errors.push("Browser record action mismatch.");
  if(!/^browser-profile:sha256:[a-f0-9]{64}$/.test(clean(record?.profile_ref,200))) errors.push("Browser record profile_ref is invalid.");
  if(!/^[a-f0-9]{64}$/.test(clean(record?.observed_text_sha256,80))) errors.push("Browser record observed_text_sha256 is invalid.");
  if(!["EXECUTED","FAILED","PARTIAL"].includes(record?.status)) errors.push("Browser record status is invalid.");
  if(!validTime(record?.started_at)||!validTime(record?.completed_at)) errors.push("Browser record timestamps invalid.");
  else if(Date.parse(record.completed_at)<Date.parse(record.started_at)) errors.push("Browser record completed_at precedes started_at.");
  try{ normalizeOpaqueRef(record?.provider_evidence_ref,"Browser provider_evidence_ref"); }
  catch(error){ errors.push(error.message); }
  try{
    const before=normalizeUrl(record?.before_url,"Browser record before_url");
    const after=normalizeUrl(record?.after_url,"Browser record after_url");
    if(before.origin!==plan?.allowed_origin) errors.push("Browser record before_url escaped authorized origin.");
    if(after.origin!==plan?.allowed_origin) errors.push("Browser record after_url escaped authorized origin.");
  }catch(error){ errors.push(error.message); }

  if(record?.action?.mode==="READ"&&record?.external_mutation_observed===true) errors.push("Browser READ record cannot contain external mutation.");
  if(record?.action?.mode==="MUTATION"){
    if(!nonEmpty(record?.approval_ref)) errors.push("Browser mutation record requires approval_ref.");
    for(const [field,label] of [["pre_action_state_ref","pre-state"],["execution_receipt_ref","execution receipt"],["post_action_state_ref","post-state"]]){
      try{ normalizeOpaqueRef(record?.[field],"Browser mutation "+label); }
      catch(error){ errors.push(error.message); }
    }
  }
  if(record?.injection_signals?.length&&record?.action?.mode==="MUTATION") errors.push("Browser mutation record cannot carry page injection signals.");
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});
}
