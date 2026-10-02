import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { assessV07ConnectedEvidence } from "../v0.7-connected-evidence/index.mjs";
import { readAndAssessV061ReleaseReadiness } from "../release-readiness/index.mjs";

const rootDefault=resolve(import.meta.dirname,"../..");

const clean=(v)=>String(v??"").trim();
const readJson=async(root,path)=>JSON.parse(await readFile(resolve(root,path),"utf8"));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export async function assessV07ReleaseReadiness(config,{root=rootDefault,connectedOverride=null,v061Override=null}={}){
  const errors=[];
  if(config?.schema!==1) errors.push("v0.7 readiness schema must be 1.");
  if(config?.candidate!=="v0.7.0") errors.push("v0.7 readiness candidate must be v0.7.0.");

  const connected=connectedOverride||await assessV07ConnectedEvidence({root});
  const v061=v061Override||await readAndAssessV061ReleaseReadiness({root});
  const pkg=await readJson(root,"package.json");

  const expectedConnectedDecision=connected.connected_office_decision;
  const expectedBlockers=[
    ...connected.blockers,
    ...(v061.assessment?.decision==="READY"?[]:["V0_6_1_PREREQUISITE"]),
  ];

  const configuredBlockers=(config.release_blockers||[]).map((item)=>item.id);
  const configuredObserved=config.connected_evidence?.observed||{};

  if(config.connected_office_decision!==expectedConnectedDecision){
    errors.push("connected_office_decision drift: configured="+config.connected_office_decision+" computed="+expectedConnectedDecision);
  }
  if(!same(configuredBlockers,expectedBlockers)){
    errors.push("release blocker drift: configured="+JSON.stringify(configuredBlockers)+" computed="+JSON.stringify(expectedBlockers));
  }
  if(!same(config.connected_evidence?.required_components||[],Object.keys(connected.components))){
    errors.push("connected evidence required component list drift.");
  }
  if(!same(configuredObserved,connected.components)){
    errors.push("connected evidence observed status drift.");
  }

  const expectedDecision=expectedBlockers.length?"BLOCKED":"READY";
  if(config.decision!==expectedDecision){
    errors.push("decision drift: configured="+config.decision+" computed="+expectedDecision);
  }

  if(config.package_version_hold?.current!==pkg.version){
    errors.push("package version hold current does not match package.json.");
  }
  if(config.package_version_hold?.candidate!=="0.7.0"){
    errors.push("package version hold candidate must be 0.7.0.");
  }
  if(expectedDecision==="BLOCKED"&&config.package_version_hold?.bump_authorized!==false){
    errors.push("package bump cannot be authorized while v0.7.0 is blocked.");
  }
  if(expectedDecision==="BLOCKED"&&config.promotion?.stable_tag_authorized!==false){
    errors.push("stable tag cannot be authorized while v0.7.0 is blocked.");
  }
  if(expectedDecision==="BLOCKED"&&config.promotion?.publication_authorized!==false){
    errors.push("publication cannot be authorized while v0.7.0 is blocked.");
  }
  if(expectedDecision==="READY"&&pkg.version!=="0.7.0"){
    errors.push("READY requires package.json version 0.7.0.");
  }

  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    decision:expectedDecision,
    connected_office_decision:expectedConnectedDecision,
    blockers:Object.freeze(expectedBlockers),
    canonical:Object.freeze({
      connected_components:connected.components,
      connected_blockers:connected.blockers,
      v0_6_1_prerequisite:v061.assessment?.decision||"UNKNOWN",
      v0_6_1_blockers:Object.freeze([...(v061.assessment?.blockers||[])]),
      package_version:pkg.version,
      read_connector_observations:connected.read_only.observed_count,
      scoped_write_status:connected.write.status,
      scheduled_mission_status:connected.scheduled.status,
      revocation_status:connected.revocation.status,
      live_browser_status:connected.browser.status,
    }),
    connected,
  });
}

export function buildV07ReadinessSnapshot({config,assessment}={}){
  if(!assessment?.ok) throw new Error("Cannot build v0.7 readiness snapshot from invalid assessment.");
  return Object.freeze({
    candidate:"v0.7.0",
    connected_office_decision:assessment.connected_office_decision,
    decision:assessment.decision,
    blocker_count:assessment.blockers.length,
    blockers:assessment.blockers,
    package_version:assessment.canonical.package_version,
    package_bump_authorized:config.package_version_hold.bump_authorized,
    stable_tag_authorized:config.promotion.stable_tag_authorized,
    publication_authorized:config.promotion.publication_authorized,
    provider_lifecycle_claim:assessment.connected.provider_lifecycle_claim,
    truth_boundary:"Partial connected-office evidence does not authorize v0.7.0 publication. READ_ONLY connector permissions, live browser evidence, prerequisite release readiness, package metadata, and release workflow gates remain independent requirements.",
  });
}

export async function readAndAssessV07ReleaseReadiness({root=rootDefault}={}){
  const config=await readJson(root,"config/v0.7-release-readiness.json");
  const assessment=await assessV07ReleaseReadiness(config,{root});
  return Object.freeze({config,assessment});
}
