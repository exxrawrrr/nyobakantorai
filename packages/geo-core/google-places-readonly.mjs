import { normalizeCredentialRef, validateConnectorRouteDecision } from "../connector-center/index.mjs";
import {
  normalizeGeoPolicy,
  normalizeGeoDiscoveryRequest,
  processGeoProviderResponse,
  buildDurableGeoEvidence,
  assertProductionFieldMask,
} from "./index.mjs";

const OP_CAPABILITY=Object.freeze({
  "text-search":"geo.places.search",
  "nearby-search":"geo.places.search",
  "place-details":"geo.places.details",
  "place-id-refresh":"geo.places.details",
});
const OP_KIND=Object.freeze({
  "text-search":"TEXT_SEARCH",
  "nearby-search":"NEARBY_SEARCH",
  "place-details":"PLACE_DETAILS",
  "place-id-refresh":"PLACE_DETAILS",
});
const clean=(v,max=1000)=>String(v??"").trim().slice(0,max);
function assert(c,m){if(!c)throw new Error(m);}

function providerRequest(normalized,credentialRef){
  if(normalized.operation==="TEXT_SEARCH"){
    return Object.freeze({
      method:"POST",
      endpoint:"https://places.googleapis.com/v1/places:searchText",
      headers:Object.freeze({
        "Content-Type":"application/json",
        "X-Goog-FieldMask":normalized.fields.join(","),
      }),
      credential_ref:credentialRef,
      body:Object.freeze({
        textQuery:normalized.query,
        pageSize:normalized.page_size,
        locationRestriction:Object.freeze({
          rectangle:Object.freeze({
            low:normalized.area.low,
            high:normalized.area.high,
          }),
        }),
      }),
    });
  }
  if(normalized.operation==="NEARBY_SEARCH"){
    return Object.freeze({
      method:"POST",
      endpoint:"https://places.googleapis.com/v1/places:searchNearby",
      headers:Object.freeze({
        "Content-Type":"application/json",
        "X-Goog-FieldMask":normalized.fields.join(","),
      }),
      credential_ref:credentialRef,
      body:Object.freeze({
        maxResultCount:normalized.max_result_count,
        locationRestriction:Object.freeze({
          circle:Object.freeze({
            center:normalized.area.center,
            radius:normalized.area.radius_m,
          }),
        }),
      }),
    });
  }
  return Object.freeze({
    method:"GET",
    endpoint:"https://places.googleapis.com/v1/places/"+encodeURIComponent(normalized.place_id),
    headers:Object.freeze({
      "X-Goog-FieldMask":normalized.fields.join(","),
    }),
    credential_ref:credentialRef,
    body:null,
  });
}

export function createGooglePlacesReadOnlyConnector({transport,policy:policyInput}={}){
  assert(typeof transport==="function","Google Places connector requires transport.");
  const policy=normalizeGeoPolicy(policyInput);
  return Object.freeze({
    id:"google-places-readonly",
    provider:"google-places-new",
    access_modes:Object.freeze(["READ"]),
    operations:Object.freeze(Object.keys(OP_CAPABILITY)),

    async execute({
      route,
      connection,
      operation,
      request,
      observedAt,
    }={}){
      validateConnectorRouteDecision(route);
      assert(route.connector_id==="google-places-readonly","Connector route is not for google-places-readonly.");
      assert(route.access_mode==="READ","Google Places connector is READ-only.");
      assert(route.resource?.resource_type==="geo_policy_scope","Google Places route resource must be geo_policy_scope.");
      assert(route.resource?.resource_id===policy.policy_id,"Google Places route resource must match exact policy scope.");

      const op=clean(operation,160).toLowerCase();
      assert(Object.hasOwn(OP_CAPABILITY,op),"Unsupported Google Places read operation.");
      assert(route.capability_id===OP_CAPABILITY[op],"Google Places operation capability does not match authorized route.");

      const credentialRef=normalizeCredentialRef(connection?.credential_ref,{
        required:true,
        allowedPrefixes:["connector-secret://","env://","secret://"],
      });
      assert(connection?.connection_ref===route.connection.connection_ref,"Google Places execution connection does not match authorized route.");
      assert(connection?.state==="CONNECTED","Google Places execution requires CONNECTED state.");

      const normalized=normalizeGeoDiscoveryRequest({
        ...request,
        schema:1,
        operation:OP_KIND[op],
      },{policy});
      assertProductionFieldMask(normalized.fields);

      if(op==="place-id-refresh"){
        assert(normalized.field_profile==="PLACE_DETAILS_ID_REFRESH","Place ID refresh requires PLACE_DETAILS_ID_REFRESH profile.");
      }

      const outbound=providerRequest(normalized,credentialRef);
      const response=await transport(Object.freeze({
        provider:"google-places-new",
        connector_id:"google-places-readonly",
        operation:op,
        capability_id:route.capability_id,
        request_ref:normalized.request_ref,
        connector_route_ref:route.connector_route_ref,
        request:outbound,
      }));
      assert(response&&typeof response==="object","Google Places transport must return an object.");
      assert(response.mutated!==true,"Google Places read transport reported a mutation.");
      assert(response.data&&typeof response.data==="object","Google Places transport data required.");

      const processed=processGeoProviderResponse(response.data,{
        request:normalized,
        policy,
        observedAt:observedAt||response.observed_at,
      });
      const durableEvidence=buildDurableGeoEvidence(processed,{policy});

      return Object.freeze({
        provider:"google-places-new",
        connector_id:"google-places-readonly",
        operation:op,
        capability_id:route.capability_id,
        resource:Object.freeze(structuredClone(route.resource)),
        connector_route_ref:route.connector_route_ref,
        evidence_ref:clean(response.evidence_ref,1000)||null,
        observed_at:processed.observed_at,
        pricing:Object.freeze({
          field_profile:normalized.field_profile,
          highest_sku:normalized.highest_sku,
          numeric_price_pinned:false,
        }),
        storage_policy:"EPHEMERAL_ONLY",
        ephemeral_provider_content:processed.ephemeral_provider_content,
        durable_evidence:durableEvidence,
        display_requirements:processed.display_requirements,
      });
    },
  });
}
