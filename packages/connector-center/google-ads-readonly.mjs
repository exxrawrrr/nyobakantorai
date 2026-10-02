import { validateConnectorRouteDecision, normalizeCredentialRef } from "./index.mjs";

const OPERATIONS=Object.freeze({
  "list-campaigns":"ads.google.read",
  "campaign-insights":"ads.google.insights",
  "search-terms":"ads.google.keywords",
  "inspect-creative":"ads.google.creative",
  "verify-state":"ads.google.verify",
});

function assert(condition,message){ if(!condition) throw new Error(message); }
const clean=(value,max=1000)=>String(value??"").trim().slice(0,max);

export function createGoogleAdsReadOnlyConnector({transport}={}){
  assert(typeof transport==="function","Google Ads read-only connector requires transport.");

  return Object.freeze({
    id:"google-ads-readonly",
    provider:"google-ads",
    access_modes:Object.freeze(["READ"]),
    operations:Object.freeze(Object.keys(OPERATIONS)),

    async execute({
      route,
      connection,
      operation,
      query={},
    }={}){
      validateConnectorRouteDecision(route);
      assert(route.connector_id==="google-ads-readonly","Connector route is not for google-ads-readonly.");
      assert(route.access_mode==="READ","Google Ads connector is READ-only.");
      const op=clean(operation,160).toLowerCase();
      assert(Object.hasOwn(OPERATIONS,op),"Unsupported Google Ads read operation.");
      assert(route.capability_id===OPERATIONS[op],"Google Ads operation capability does not match authorized route.");
      assert(route.resource?.resource_type==="google_ads_customer","Google Ads route resource must be google_ads_customer.");

      const credentialRef=normalizeCredentialRef(connection?.credential_ref,{
        required:true,
        allowedPrefixes:["connector-secret://","env://","secret://"],
      });
      assert(connection?.connection_ref===route.connection.connection_ref,"Google Ads execution connection does not match authorized route.");
      assert(connection?.state==="CONNECTED","Google Ads execution requires CONNECTED state.");

      const request=Object.freeze({
        provider:"google-ads",
        connector_id:"google-ads-readonly",
        operation:op,
        capability_id:route.capability_id,
        customer_id:route.resource.resource_id,
        query:structuredClone(query),
        credential_ref:credentialRef,
        connector_route_ref:route.connector_route_ref,
      });

      const response=await transport(request);
      assert(response&&typeof response==="object","Google Ads read transport must return an object.");
      assert(response.mutated!==true,"Google Ads read transport reported a mutation.");

      return Object.freeze({
        provider:"google-ads",
        connector_id:"google-ads-readonly",
        operation:op,
        capability_id:route.capability_id,
        resource:Object.freeze(structuredClone(route.resource)),
        connector_route_ref:route.connector_route_ref,
        evidence_ref:clean(response.evidence_ref,1000)||null,
        observed_at:clean(response.observed_at,80)||null,
        data:structuredClone(response.data??null),
      });
    },
  });
}
