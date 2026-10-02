const escapeHtml=(value)=>String(value??"").replace(/[&<>'"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

export function buildMapMissionViewModel(mapMission,candidates=[]){
  if(!mapMission?.map_mission_ref) throw new Error("map mission view requires map mission");
  const byProfile=new Map(candidates.map(x=>[x.profile_ref,x]));
  const features=(mapMission.features||[]).map(feature=>{
    const lead=byProfile.get(feature.profile_ref);
    if(!lead) throw new Error("map mission feature candidate missing");
    return Object.freeze({
      feature_ref:feature.feature_ref,profile_ref:feature.profile_ref,name:lead.name||lead.place_id||lead.crm_lead_id,
      score:lead.score,qualification_tier:lead.qualification_tier,
      latitude:feature.latitude,longitude:feature.longitude,
      retention_class:feature.retention_class,persistable:feature.persistable,
      google_maps_attribution_required:feature.google_maps_attribution_required,
    });
  });
  return Object.freeze({
    mission_id:mapMission.mission_id,title:mapMission.title,map_mission_ref:mapMission.map_mission_ref,
    total_leads:candidates.length,feature_count:features.length,features:Object.freeze(features),
    tiers:mapMission.qualification?.tiers||[],
    google_maps_attribution_required:mapMission.google_maps_attribution_required===true,
    ephemeral_feature_count:mapMission.ephemeral_feature_count||0,
    completeness_claim:false,
    write_actions_available:false,
  });
}

export function renderMapMissionMarkup(model){
  const tiers=(model.tiers||[]).map(t=>`<article class="system-card"><p class="eyebrow">TIER ${escapeHtml(t.id)}</p><h2>${escapeHtml(t.label)}</h2><p>${t.count} verified lead(s)</p></article>`).join("");
  const leads=(model.features||[]).map(f=>`<article class="knowledge-card" data-map-feature="${escapeHtml(f.feature_ref)}"><p class="eyebrow">QUALIFICATION ${escapeHtml(f.qualification_tier)}</p><h2>${escapeHtml(f.name)}</h2><p>Score ${f.score}/100 · ${escapeHtml(f.retention_class)}</p><code>${Number(f.latitude).toFixed(5)}, ${Number(f.longitude).toFixed(5)}</code></article>`).join("");
  const attribution=model.google_maps_attribution_required?'<p class="public-boundary-note" data-map-attribution><strong>Google Maps attribution required</strong> for Google-provider presentation features.</p>':"";
  return `<div class="page-heading"><div><p class="eyebrow">BOUNDED GEO MISSION</p><h1>${escapeHtml(model.title)}</h1><p>${model.total_leads} verified lead(s) · ${model.feature_count} map feature(s). Presentation ≠ CRM write ≠ outreach.</p></div><div class="heading-badges"><span>WRITE ACTIONS: OFF</span><span>EXHAUSTIVE: NO</span></div></div>${attribution}<div class="systems-grid">${tiers}</div><div class="people-grid">${leads||'<article class="panel"><p>No map features loaded.</p></article>'}</div>`;
}

export function renderMapMissionEmptyMarkup(){
  return '<div class="page-heading"><div><p class="eyebrow">GEO INTELLIGENCE</p><h1>Map missions</h1><p>No verified map mission is loaded. Map presentation is read-only; CRM import and outreach require separate owner approval.</p></div><div class="heading-badges"><span>VERIFIED PROFILES ONLY</span><span>AUTO OUTREACH: OFF</span></div></div><article class="panel"><h2>Ready for bounded mission data</h2><p>Load a verified Map Mission view model through the application integration. Provider retention and attribution rules remain active.</p></article>';
}
