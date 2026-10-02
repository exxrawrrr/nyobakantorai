import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONNECTOR_STATES,
  normalizeConnectorRegistry,
  createConnectorConnection,
  normalizeConnectorConnection,
  transitionConnectorConnection,
  createConnectorGrant,
  normalizeConnectorGrant,
  revokeConnectorGrant,
  authorizeConnectorAction,
  validateConnectorRouteDecision,
  buildCapabilitySnapshotFromConnector,
} from "./index.mjs";
import { createGoogleAdsReadOnlyConnector } from "./google-ads-readonly.mjs";
import { createCapabilityRouter } from "../capability-router/index.mjs";

const registry=JSON.parse(readFileSync(new URL("../../config/connector-registry.json",import.meta.url),"utf8"));
const capabilities=JSON.parse(readFileSync(new URL("../../config/capabilities.json",import.meta.url),"utf8"));
const employees=JSON.parse(readFileSync(new URL("../../config/employees.json",import.meta.url),"utf8"));
const employee=(id)=>employees.employees.find((item)=>item.id===id);

const at="2026-10-02T05:30:00.000Z";
const connectedAt="2026-10-02T05:31:00.000Z";
const customer={resource_type:"google_ads_customer",resource_id:"customers/1234567890"};

function connected(){
  const initial=createConnectorConnection({
    registry,
    connectionId:"conn-google-ads-001",
    connectorId:"google-ads-readonly",
  });
  return transitionConnectorConnection(initial,"CONNECT",{
    registry,
    at:connectedAt,
    evidenceRef:"connector-evidence:google-ads:connection-001",
    credentialRef:"connector-secret://google-ads/rafdi-main",
    expiresAt:"2026-10-03T05:31:00.000Z",
  });
}

function grant(overrides={}){
  return createConnectorGrant({
    schema:1,
    grant_id:"connector-grant-google-001",
    employee_id:"gugun",
    connector_id:"google-ads-readonly",
    capability_id:"ads.google.read",
    access_modes:["READ"],
    actions:["list-campaigns"],
    resources:[customer],
    issued_at:"2026-10-02T05:30:00.000Z",
    expires_at:"2026-10-03T05:30:00.000Z",
    evidence_ref:"connector-grant-evidence:google-001",
    ...overrides,
  },{registry});
}

test("connector registry defaults to NOT_CONNECTED and exposes only READ for Google Ads fixture",()=>{
  const normalized=normalizeConnectorRegistry(registry);
  assert.deepEqual(CONNECTOR_STATES,[
    "NOT_CONNECTED","CONNECTED","DISCONNECTED","REVOKED","EXPIRED","ERROR",
  ]);
  const google=normalized.connectors.find((item)=>item.id==="google-ads-readonly");
  assert.equal(google.default_state,"NOT_CONNECTED");
  assert.deepEqual(google.access_modes,["READ"]);
  assert.ok(google.capabilities.includes("ads.google.read"));
  assert.deepEqual(google.resource_types,["google_ads_customer"]);
  assert.equal(google.auth.mode,"SECRET_REF_REQUIRED");
});

test("raw connector credentials are rejected while approved secret references are accepted",()=>{
  assert.throws(()=>normalizeConnectorRegistry({
    ...registry,
    connectors:[{
      ...registry.connectors[0],
      api_key:"AIza-not-allowed",
    }],
  }),/Raw connector secret field/);

  const initial=createConnectorConnection({
    registry,connectionId:"conn-secret-test",connectorId:"google-ads-readonly",
  });
  assert.throws(()=>transitionConnectorConnection(initial,"CONNECT",{
    registry,at:connectedAt,evidenceRef:"connector-evidence:test",
    credentialRef:"AIza-raw-token",
  }),/approved reference scheme/);

  const ok=transitionConnectorConnection(initial,"CONNECT",{
    registry,at:connectedAt,evidenceRef:"connector-evidence:test",
    credentialRef:"secret://google-ads/account-a",
  });
  assert.equal(ok.state,"CONNECTED");
  assert.match(ok.credential_ref_sha256,/^[a-f0-9]{64}$/);
});

test("credential reference is integrity-bound but omitted from authorized route evidence",()=>{
  const connection=connected();
  assert.equal(normalizeConnectorConnection(connection,{registry}).connection_ref,connection.connection_ref);

  const tampered={...connection,credential_ref:"connector-secret://google-ads/other-account"};
  assert.throws(()=>normalizeConnectorConnection(tampered,{registry}),/credential_ref hash mismatch/);

  const route=authorizeConnectorAction({
    registry,connections:[connection],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(route.allowed,true);
  assert.equal("credential_ref" in route.connection,false);
  assert.equal(JSON.stringify(route).includes("connector-secret://"),false);
});

test("CONNECTED alone never grants universal or even single-resource access",()=>{
  const result=authorizeConnectorAction({
    registry,connections:[connected()],grants:[],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"CONNECTOR_GRANT_MISSING");
  assert.equal(result.connection.state,"CONNECTED");
});

test("exact employee capability action and resource grant authorizes only the intended read route",()=>{
  const route=authorizeConnectorAction({
    registry,connections:[connected()],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(route.allowed,true);
  assert.equal(route.decision,"AUTHORIZED_CONNECTOR_READ");
  assert.equal(route.employee_id,"gugun");
  assert.equal(route.resource.resource_id,customer.resource_id);
  assert.match(route.connector_route_ref,/^connector-route:sha256:[a-f0-9]{64}$/);
  assert.equal(validateConnectorRouteDecision(route),true);

  const otherEmployee=authorizeConnectorAction({
    registry,connections:[connected()],grants:[grant()],
    employeeId:"maya",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(otherEmployee.allowed,false);
  assert.equal(otherEmployee.reason,"CONNECTOR_GRANT_MISSING");

  const otherResource=authorizeConnectorAction({
    registry,connections:[connected()],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:{...customer,resource_id:"customers/9999999999"},now:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(otherResource.allowed,false);
  assert.equal(otherResource.reason,"CONNECTOR_GRANT_MISSING");
});

test("wildcard resources and WRITE grants are rejected by read-only connector policy",()=>{
  assert.throws(()=>createConnectorGrant({
    ...grant(),
    grant_id:"connector-grant-wildcard",
    resources:[{resource_type:"google_ads_customer",resource_id:"*"}],
  },{registry}),/wildcard/);

  assert.throws(()=>createConnectorGrant({
    ...grant(),
    grant_id:"connector-grant-write",
    access_modes:["WRITE"],
  },{registry}),/exceeds connector capability/);
});

test("disconnect immediately blocks future use without deleting the connector definition",()=>{
  const connection=connected();
  const disconnected=transitionConnectorConnection(connection,"DISCONNECT",{
    registry,at:"2026-10-02T06:01:00.000Z",evidenceRef:"connector-evidence:disconnect-001",
  });
  assert.equal(disconnected.state,"DISCONNECTED");
  assert.equal(disconnected.connector_id,"google-ads-readonly");

  const result=authorizeConnectorAction({
    registry,connections:[disconnected],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:02:00.000Z",
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"CONNECTOR_DISCONNECTED");
});

test("connector revocation is terminal and blocks all future use",()=>{
  const revoked=transitionConnectorConnection(connected(),"REVOKE",{
    registry,at:"2026-10-02T06:01:00.000Z",evidenceRef:"connector-evidence:revoke-001",
  });
  assert.equal(revoked.state,"REVOKED");
  assert.equal(revoked.credential_ref,null);
  assert.throws(()=>transitionConnectorConnection(revoked,"CONNECT",{
    registry,at:"2026-10-02T06:02:00.000Z",
    evidenceRef:"connector-evidence:illegal-reconnect",
    credentialRef:"secret://google-ads/account-a",
  }),/terminal/);

  const result=authorizeConnectorAction({
    registry,connections:[revoked],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:02:00.000Z",
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"CONNECTOR_REVOKED");
});

test("connection expiration blocks use even if no explicit EXPIRE event has been written yet",()=>{
  const initial=createConnectorConnection({registry,connectionId:"conn-expiring",connectorId:"google-ads-readonly"});
  const short=transitionConnectorConnection(initial,"CONNECT",{
    registry,at:"2026-10-02T05:31:00.000Z",
    evidenceRef:"connector-evidence:expiring",
    credentialRef:"env://GOOGLE_ADS_ACCOUNT_A",
    expiresAt:"2026-10-02T05:45:00.000Z",
  });
  const result=authorizeConnectorAction({
    registry,connections:[short],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"CONNECTOR_EXPIRED");

  const expired=transitionConnectorConnection(short,"EXPIRE",{
    registry,at:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(expired.state,"EXPIRED");
  assert.equal(expired.credential_ref,null);
});

test("grant expiration and explicit grant revocation both block future use",()=>{
  const expiring=grant({expires_at:"2026-10-02T05:45:00.000Z"});
  const expired=authorizeConnectorAction({
    registry,connections:[connected()],grants:[expiring],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(expired.allowed,false);
  assert.equal(expired.reason,"CONNECTOR_GRANT_EXPIRED");

  const revokedGrant=revokeConnectorGrant(grant(),{
    registry,at:"2026-10-02T05:50:00.000Z",evidenceRef:"connector-grant-revoke:001",
  });
  assert.equal(normalizeConnectorGrant(revokedGrant,{registry}).revoked_at,"2026-10-02T05:50:00.000Z");
  const revoked=authorizeConnectorAction({
    registry,connections:[connected()],grants:[revokedGrant],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  assert.equal(revoked.allowed,false);
  assert.equal(revoked.reason,"CONNECTOR_GRANT_REVOKED");
});

test("connector route digest detects resource or connection evidence tampering",()=>{
  const route=authorizeConnectorAction({
    registry,connections:[connected()],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  assert.throws(()=>validateConnectorRouteDecision({
    ...route,
    resource:{...route.resource,resource_id:"customers/other"},
  }),/does not match route content/);
  assert.throws(()=>validateConnectorRouteDecision({
    ...route,
    connection:{...route.connection,evidence_ref:"connector-evidence:forged"},
  }),/does not match route content/);
});

test("authorized connector route can supply connection evidence to existing Capability Router without bypassing its resource grant",()=>{
  const connectorRoute=authorizeConnectorAction({
    registry,connections:[connected()],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  const snapshot=buildCapabilitySnapshotFromConnector(connectorRoute,{checkedAt:"2026-10-02T06:00:01.000Z"});

  const capabilityGrant={
    schema:1,
    grant_id:"capability-grant-google-001",
    employee_id:"gugun",
    capability_id:"ads.google.read",
    access_modes:["READ"],
    actions:["list-campaigns"],
    targets:[customer],
    issued_at:"2026-10-02T05:30:00.000Z",
    expires_at:"2026-10-03T05:30:00.000Z",
    evidence_ref:"capability-grant-evidence:google-001",
  };
  const router=createCapabilityRouter({
    catalog:capabilities.capabilities,
    states:capabilities.states,
    autonomyModes:capabilities.autonomy_modes,
    defaultAutonomy:capabilities.default_mode,
    grants:[capabilityGrant],
  });
  const allowed=router.authorizeActionForEmployee({
    employee:employee("gugun"),
    capabilityId:"ads.google.read",
    action:"list-campaigns",
    accessMode:"READ",
    target:customer,
    snapshots:[snapshot],
    now:"2026-10-02T06:00:02.000Z",
  });
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.connection.provider_id,"connector:google-ads-readonly");

  const noCapabilityGrant=createCapabilityRouter({
    catalog:capabilities.capabilities,
    states:capabilities.states,
    autonomyModes:capabilities.autonomy_modes,
    defaultAutonomy:capabilities.default_mode,
    grants:[],
  }).authorizeActionForEmployee({
    employee:employee("gugun"),
    capabilityId:"ads.google.read",
    action:"list-campaigns",
    accessMode:"READ",
    target:customer,
    snapshots:[snapshot],
    now:"2026-10-02T06:00:02.000Z",
  });
  assert.equal(noCapabilityGrant.allowed,false);
  assert.equal(noCapabilityGrant.reason,"RESOURCE_GRANT_MISSING");
});

test("Google Ads practical read-only connector sends only authorized read operation plus a credential reference",async()=>{
  const route=authorizeConnectorAction({
    registry,connections:[connected()],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  const calls=[];
  const connector=createGoogleAdsReadOnlyConnector({
    transport:async(request)=>{
      calls.push(request);
      return {
        mutated:false,
        evidence_ref:"google-ads-read-evidence:001",
        observed_at:"2026-10-02T06:00:03.000Z",
        data:{campaigns:[{id:"100",name:"Search Brand"}]},
      };
    },
  });
  const output=await connector.execute({
    route,
    connection:connected(),
    operation:"list-campaigns",
    query:{status:"ENABLED"},
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].credential_ref,"connector-secret://google-ads/rafdi-main");
  assert.equal(calls[0].customer_id,"customers/1234567890");
  assert.equal(calls[0].operation,"list-campaigns");
  assert.equal(output.data.campaigns[0].name,"Search Brand");
  assert.equal(JSON.stringify(output).includes("connector-secret://"),false);
});

test("Google Ads connector rejects mutation-like or mismatched operations",async()=>{
  const route=authorizeConnectorAction({
    registry,connections:[connected()],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  const connector=createGoogleAdsReadOnlyConnector({transport:async()=>({mutated:false,data:{}})});
  await assert.rejects(()=>connector.execute({
    route,connection:connected(),operation:"update-budget",
  }),/Unsupported Google Ads read operation/);
  await assert.rejects(()=>connector.execute({
    route,connection:connected(),operation:"campaign-insights",
  }),/capability does not match/);
});

test("provider transport claiming mutation fails closed",async()=>{
  const route=authorizeConnectorAction({
    registry,connections:[connected()],grants:[grant()],
    employeeId:"gugun",connectorId:"google-ads-readonly",
    capabilityId:"ads.google.read",accessMode:"READ",action:"list-campaigns",
    resource:customer,now:"2026-10-02T06:00:00.000Z",
  });
  const connector=createGoogleAdsReadOnlyConnector({
    transport:async()=>({mutated:true,evidence_ref:"bad",data:null}),
  });
  await assert.rejects(()=>connector.execute({
    route,connection:connected(),operation:"list-campaigns",
  }),/reported a mutation/);
});
