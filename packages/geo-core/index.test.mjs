import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  normalizeGeoPolicy,
  normalizeGeoDiscoveryRequest,
  pricingMetadataForRequest,
  createDurablePlaceIdRecord,
  validateDurableGeoArtifact,
  processGeoProviderResponse,
  buildDurableGeoEvidence,
  assertProductionFieldMask,
} from "./index.mjs";
import { createGooglePlacesReadOnlyConnector } from "./google-places-readonly.mjs";
import {
  createConnectorConnection,
  transitionConnectorConnection,
  createConnectorGrant,
  authorizeConnectorAction,
} from "../connector-center/index.mjs";

const root=resolve(import.meta.dirname,"../..");
const policy=JSON.parse(await readFile(resolve(root,"config/google-places-policy.json"),"utf8"));
const registry=JSON.parse(await readFile(resolve(root,"config/connector-registry.json"),"utf8"));

function textRequest(overrides={}){
  return {
    schema:1,
    operation:"TEXT_SEARCH",
    environment:"production",
    field_profile:"TEXT_SEARCH_CORE",
    query:"fleet training center",
    area:{
      kind:"RECTANGLE",
      low:{latitude:-7.35,longitude:112.65},
      high:{latitude:-7.15,longitude:112.85},
    },
    page_size:10,
    page_number:1,
    mission_request_index:1,
    ...overrides,
  };
}

function nearbyRequest(overrides={}){
  return {
    schema:1,
    operation:"NEARBY_SEARCH",
    environment:"production",
    field_profile:"NEARBY_SEARCH_CORE",
    area:{
      kind:"CIRCLE",
      center:{latitude:-7.2575,longitude:112.7521},
      radius_m:5000,
    },
    max_result_count:10,
    mission_request_index:1,
    ...overrides,
  };
}

function detailsRequest(overrides={}){
  return {
    schema:1,
    operation:"PLACE_DETAILS",
    environment:"production",
    field_profile:"PLACE_DETAILS_CORE",
    place_id:"ChIJ-chat23-test",
    mission_request_index:1,
    ...overrides,
  };
}

test("Google Places policy is fail-closed for wildcard and durable provider content",()=>{
  const p=normalizeGeoPolicy(policy);
  assert.equal(p.production.wildcard_field_mask_allowed,false);
  assert.equal(p.production.explicit_field_mask_required,true);
  assert.equal(p.retention.provider_response,"EPHEMERAL_ONLY");
  assert.equal(p.retention.raw_response_persistence_allowed,false);
  assert.deepEqual(p.retention.durable_fields,["place_id"]);
  assert.equal(p.retention.place_id_refresh_after_days,365);
  for(const profile of Object.values(p.field_mask_profiles)){
    assert.equal(profile.fields.includes("*"),false);
    assert.ok(profile.highest_sku);
  }
});

test("production wildcard FieldMask is rejected explicitly",()=>{
  assert.throws(()=>assertProductionFieldMask(["*"]),/wildcard/);
  assert.throws(()=>assertProductionFieldMask([]),/required/);
  assert.throws(()=>assertProductionFieldMask(["places.id","places.displayName value"]),/no spaces/);

  const forged=structuredClone(policy);
  forged.field_mask_profiles.TEXT_SEARCH_CORE.fields=["*"];
  assert.throws(()=>normalizeGeoPolicy(forged),/wildcard FieldMask forbidden/);
});

test("Text Search normalizes to explicit bounded rectangle and SKU metadata",()=>{
  const req=normalizeGeoDiscoveryRequest(textRequest(),{policy});
  assert.equal(req.provider,"google-places-new");
  assert.equal(req.operation,"TEXT_SEARCH");
  assert.equal(req.area.kind,"RECTANGLE");
  assert.ok(req.area.diagonal_m>0);
  assert.ok(req.area.diagonal_m<=policy.query_bounds.internal_max_search_area_diagonal_m);
  assert.equal(req.page_size,10);
  assert.equal(req.page_number,1);
  assert.equal(req.highest_sku,"TEXT_SEARCH_PRO");
  assert.equal(req.fields.includes("*"),false);
  assert.match(req.request_ref,/^geo-request:sha256:[a-f0-9]{64}$/);

  const pricing=pricingMetadataForRequest(req,{policy});
  assert.equal(pricing.highest_sku,"TEXT_SEARCH_PRO");
  assert.equal(pricing.numeric_price_pinned,false);
  assert.match(pricing.billing_rule,/HIGHEST_SKU/);
});

test("Text Search is single-page bounded in CHAT 23 and rejects broad or implicit geography",()=>{
  assert.throws(()=>normalizeGeoDiscoveryRequest(textRequest({page_number:2}),{policy}),/page_number out of bounds/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(textRequest({page_size:21}),{policy}),/page_size out of bounds/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(textRequest({area:null}),{policy}),/explicit area/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(textRequest({
    area:{kind:"RECTANGLE",low:{latitude:-7.5,longitude:112.0},high:{latitude:-6.0,longitude:114.0}},
  }),{policy}),/area diagonal bound/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(textRequest({
    area:{kind:"RECTANGLE",low:{latitude:-7.1,longitude:113},high:{latitude:-7.2,longitude:112}},
  }),{policy}),/latitude range/);
});

test("Nearby Search enforces explicit circle, provider radius, count, and mission request bounds",()=>{
  const req=normalizeGeoDiscoveryRequest(nearbyRequest(),{policy});
  assert.equal(req.area.kind,"CIRCLE");
  assert.equal(req.area.radius_m,5000);
  assert.equal(req.max_result_count,10);
  assert.equal(req.highest_sku,"NEARBY_SEARCH_PRO");

  assert.throws(()=>normalizeGeoDiscoveryRequest(nearbyRequest({max_result_count:21}),{policy}),/max_result_count out of bounds/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(nearbyRequest({
    area:{kind:"CIRCLE",center:{latitude:-7.25,longitude:112.75},radius_m:50001},
  }),{policy}),/maximum/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(nearbyRequest({mission_request_index:26}),{policy}),/request index exceeds/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(nearbyRequest({
    area:{kind:"RECTANGLE",low:{latitude:-7.3,longitude:112.7},high:{latitude:-7.2,longitude:112.8}},
  }),{policy}),/requires CIRCLE/);
});

test("Place Details requires exact Place ID and profile-operation match",()=>{
  const req=normalizeGeoDiscoveryRequest(detailsRequest(),{policy});
  assert.equal(req.place_id,"ChIJ-chat23-test");
  assert.equal(req.query,null);
  assert.equal(req.area,null);
  assert.equal(req.highest_sku,"PLACE_DETAILS_PRO");

  assert.throws(()=>normalizeGeoDiscoveryRequest(detailsRequest({place_id:""}),{policy}),/exact place_id/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(detailsRequest({field_profile:"TEXT_SEARCH_CORE"}),{policy}),/operation mismatch/);
  assert.throws(()=>normalizeGeoDiscoveryRequest(detailsRequest({query:"should not exist"}),{policy}),/must not carry search/);
});

test("Place ID is the only provider content allowed in durable storage and receives a refresh due date",()=>{
  const record=createDurablePlaceIdRecord("ChIJ-retain-me",{policy,observedAt:"2026-10-02T08:30:00.000Z"});
  assert.equal(validateDurableGeoArtifact(record,{policy}),true);
  assert.equal(record.place_id,"ChIJ-retain-me");
  assert.equal(record.first_seen_at,"2026-10-02T08:30:00.000Z");
  assert.equal(record.refresh_due_at,"2027-10-02T08:30:00.000Z");
  assert.match(record.policy_ref,/^geo-policy:sha256:[a-f0-9]{64}$/);
  assert.match(record.record_ref,/^geo-place-id:sha256:[a-f0-9]{64}$/);

  assert.throws(()=>validateDurableGeoArtifact({...record,displayName:"Forbidden durable name"},{policy}),/not allowed in durable geo storage/);
  assert.throws(()=>validateDurableGeoArtifact({...record,formattedAddress:"Forbidden durable address"},{policy}),/not allowed in durable geo storage/);
});

test("provider response stays ephemeral while durable evidence retains only Place IDs and policy metadata",()=>{
  const req=normalizeGeoDiscoveryRequest(textRequest(),{policy});
  const response={
    places:[
      {
        id:"ChIJ-a",
        displayName:{text:"Alpha Training"},
        formattedAddress:"Example address",
        primaryType:"school",
        attributions:[{provider:"Third Party",providerUri:"https://provider.example/item"}],
      },
      {
        id:"ChIJ-b",
        displayName:{text:"Beta Training"},
        formattedAddress:"Another address",
      },
    ],
  };
  const processed=processGeoProviderResponse(response,{request:req,policy,observedAt:"2026-10-02T08:40:00.000Z"});
  assert.equal(processed.storage_policy,"EPHEMERAL_ONLY");
  assert.equal(processed.ephemeral_provider_content.places[0].displayName.text,"Alpha Training");
  assert.equal(processed.durable_place_ids.length,2);
  assert.equal(processed.display_requirements.google_maps_attribution_required,true);
  assert.equal(processed.display_requirements.third_party_attributions_required,true);
  assert.equal(processed.evidence_summary.raw_response_persisted,false);

  const durable=buildDurableGeoEvidence(processed,{policy});
  const serialized=JSON.stringify(durable);
  assert.equal(serialized.includes("Alpha Training"),false);
  assert.equal(serialized.includes("Example address"),false);
  assert.equal(serialized.includes("Third Party"),false);
  assert.equal(serialized.includes("ChIJ-a"),true);
  assert.equal(durable.raw_response_persisted,false);
  assert.equal(durable.attribution_required,true);
});

function connectorFixture(capability="geo.places.search",action="text-search"){
  const initial=createConnectorConnection({
    registry,
    connectionId:"chat23-google-places",
    connectorId:"google-places-readonly",
  });
  const connected=transitionConnectorConnection(initial,"CONNECT",{
    registry,
    at:"2026-10-02T08:00:00.000Z",
    evidenceRef:"chat23:google-places:connected-fixture",
    credentialRef:"connector-secret://chat23/google-places",
    expiresAt:"2026-10-03T08:00:00.000Z",
  });
  const grant=createConnectorGrant({
    schema:1,
    grant_id:"chat23-geo-grant",
    employee_id:"siti",
    connector_id:"google-places-readonly",
    capability_id:capability,
    access_modes:["READ"],
    actions:[action],
    resources:[{resource_type:"geo_policy_scope",resource_id:"google-places-policy-v1"}],
    issued_at:"2026-10-02T08:00:00.000Z",
    expires_at:"2026-10-03T08:00:00.000Z",
    evidence_ref:"chat23:geo-grant",
  },{registry});
  const route=authorizeConnectorAction({
    registry,
    connections:[connected],
    grants:[grant],
    employeeId:"siti",
    connectorId:"google-places-readonly",
    capabilityId:capability,
    accessMode:"READ",
    action,
    resource:{resource_type:"geo_policy_scope",resource_id:"google-places-policy-v1"},
    now:"2026-10-02T08:10:00.000Z",
  });
  assert.equal(route.allowed,true);
  return {connected,route};
}

test("Google Places connector sends explicit FieldMask and returns ephemeral response plus Place-ID-only durable evidence",async()=>{
  const {connected,route}=connectorFixture();
  let outbound=null;
  const connector=createGooglePlacesReadOnlyConnector({
    policy,
    transport:async(input)=>{
      outbound=input;
      return {
        evidence_ref:"fixture:chat23:text-search",
        observed_at:"2026-10-02T08:20:00.000Z",
        mutated:false,
        data:{places:[{id:"ChIJ-connector",displayName:{text:"Connector Example"},formattedAddress:"Provider-only address"}]},
      };
    },
  });
  const result=await connector.execute({
    route,
    connection:connected,
    operation:"text-search",
    request:textRequest(),
  });
  assert.equal(outbound.request.method,"POST");
  assert.equal(outbound.request.endpoint,"https://places.googleapis.com/v1/places:searchText");
  assert.equal(outbound.request.headers["X-Goog-FieldMask"],policy.field_mask_profiles.TEXT_SEARCH_CORE.fields.join(","));
  assert.equal(outbound.request.credential_ref,"connector-secret://chat23/google-places");
  assert.equal(result.storage_policy,"EPHEMERAL_ONLY");
  assert.equal(result.ephemeral_provider_content.places[0].displayName.text,"Connector Example");
  assert.equal(JSON.stringify(result.durable_evidence).includes("Connector Example"),false);
  assert.equal(result.durable_evidence.place_id_records[0].place_id,"ChIJ-connector");
  assert.equal(result.pricing.highest_sku,"TEXT_SEARCH_PRO");
  assert.equal(result.pricing.numeric_price_pinned,false);
});

test("Google Places connector fails closed on policy-scope mismatch, mutation reports, or wrong refresh profile",async()=>{
  const {connected,route}=connectorFixture();
  const mutating=createGooglePlacesReadOnlyConnector({
    policy,
    transport:async()=>({
      observed_at:"2026-10-02T08:20:00.000Z",
      mutated:true,
      data:{places:[]},
    }),
  });
  await assert.rejects(()=>mutating.execute({
    route,connection:connected,operation:"text-search",request:textRequest(),
  }),/reported a mutation/);

  const forgedRoute={...route,resource:{resource_type:"geo_policy_scope",resource_id:"another-policy"}};
  const normal=createGooglePlacesReadOnlyConnector({
    policy,
    transport:async()=>({observed_at:"2026-10-02T08:20:00.000Z",mutated:false,data:{places:[]}}),
  });
  await assert.rejects(()=>normal.execute({
    route:forgedRoute,connection:connected,operation:"text-search",request:textRequest(),
  }),/route ref does not match|exact policy scope/);

  const details=connectorFixture("geo.places.details","place-id-refresh");
  await assert.rejects(()=>normal.execute({
    route:details.route,
    connection:details.connected,
    operation:"place-id-refresh",
    request:detailsRequest({field_profile:"PLACE_DETAILS_CORE"}),
  }),/requires PLACE_DETAILS_ID_REFRESH/);
});

test("Place ID refresh connector uses ID-only detail request",async()=>{
  const {connected,route}=connectorFixture("geo.places.details","place-id-refresh");
  let outbound=null;
  const connector=createGooglePlacesReadOnlyConnector({
    policy,
    transport:async(input)=>{
      outbound=input;
      return {
        evidence_ref:"fixture:chat23:id-refresh",
        observed_at:"2026-10-02T08:25:00.000Z",
        mutated:false,
        data:{id:"ChIJ-refresh"},
      };
    },
  });
  const result=await connector.execute({
    route,connection:connected,operation:"place-id-refresh",
    request:detailsRequest({field_profile:"PLACE_DETAILS_ID_REFRESH",place_id:"ChIJ-refresh"}),
  });
  assert.equal(outbound.request.method,"GET");
  assert.equal(outbound.request.headers["X-Goog-FieldMask"],"id");
  assert.match(outbound.request.endpoint,/places\/ChIJ-refresh$/);
  assert.equal(result.pricing.highest_sku,"PLACE_DETAILS_ESSENTIALS_IDS_ONLY");
  assert.equal(result.durable_evidence.place_id_records[0].place_id,"ChIJ-refresh");
});
