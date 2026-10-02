import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildMapMissionViewModel,renderMapMissionMarkup,renderMapMissionEmptyMarkup } from "../src/map-mission-view.mjs";

test("Office exposes a dedicated read-only Geo Intel view",async()=>{
  const html=await readFile(new URL("../src/index.html",import.meta.url),"utf8");
  const app=await readFile(new URL("../src/app.mjs",import.meta.url),"utf8");
  assert.match(html,/data-view="geo"/);
  assert.match(html,/id="view-geo"/);
  assert.match(html,/id="geo-mission-root"/);
  assert.match(app,/renderGeoMission/);
  assert.match(app,/__NYOBA_LOAD_GEO_MISSION__/);
  assert.match(app,/"geo"/);
});

test("map mission markup keeps write actions off and shows provider attribution boundary",()=>{
  const candidate={profile_ref:"profile:1",name:"Lead One",place_id:"place-1",crm_lead_id:"crm-1",score:88,qualification_tier:"A"};
  const mission={
    map_mission_ref:"map-mission:sha256:"+"a".repeat(64),mission_id:"m1",title:"Surabaya map",
    qualification:{tiers:[{id:"A",label:"High priority",count:1,lead_refs:["crm-1"]}]},
    google_maps_attribution_required:true,ephemeral_feature_count:1,
    features:[{feature_ref:"map-feature:1",profile_ref:"profile:1",latitude:-7.25,longitude:112.74,retention_class:"EPHEMERAL_PROVIDER",persistable:false,google_maps_attribution_required:true}],
  };
  const model=buildMapMissionViewModel(mission,[candidate]);
  assert.equal(model.write_actions_available,false);
  assert.equal(model.completeness_claim,false);
  const markup=renderMapMissionMarkup(model);
  assert.match(markup,/WRITE ACTIONS: OFF/);
  assert.match(markup,/EXHAUSTIVE: NO/);
  assert.match(markup,/Google Maps attribution required/);
  assert.doesNotMatch(markup,/send now|auto send|write crm/i);
});

test("empty Geo Intel state states approval/write boundary plainly",()=>{
  const markup=renderMapMissionEmptyMarkup();
  assert.match(markup,/read-only/);
  assert.match(markup,/CRM import and outreach require separate owner approval/);
  assert.match(markup,/AUTO OUTREACH: OFF/);
});
