import { createHash, randomUUID } from "node:crypto";

const nonEmpty=(value)=>typeof value==="string"&&value.trim().length>0;
const SECRET_VALUE_RE=/\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{10,}\b/i;
const LOOPBACK_HOSTS=new Set(["127.0.0.1","localhost","::1"]);

function safeName(value){
  return String(value||"").replace(/[^A-Za-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,120);
}

function redactText(value,secrets=[]){
  let text=String(value??"");
  for(const secret of secrets.filter(nonEmpty)) text=text.split(secret).join("[REDACTED]");
  text=text.replace(/((?:api[_-]?key|token|secret|password|passwd|cookie|authorization)\s*[:=]\s*)[^\s,;]+/ig,"$1[REDACTED]");
  text=text.replace(SECRET_VALUE_RE,"[REDACTED]");
  return text.slice(0,1200);
}

function assertSafePayload(value,label="payload"){
  const text=typeof value==="string"?value:JSON.stringify(value);
  if(!nonEmpty(text)) throw new Error(label+" must be non-empty");
  if(SECRET_VALUE_RE.test(text)||/(?:api[_-]?key|token|secret|password|passwd|cookie|authorization)\s*[:=]\s*\S+/i.test(text)){
    throw new Error(label+" contains secret-like material");
  }
}

export function normalizeCogneeBaseUrl(value){
  let url;
  try{url=new URL(String(value||""));}catch{throw new Error("Cognee base URL must be a valid http/https URL");}
  if(!["http:","https:"].includes(url.protocol)) throw new Error("Cognee base URL must use http/https");
  if(url.username||url.password) throw new Error("Cognee base URL must not contain credentials");
  url.pathname=url.pathname.replace(/\/+$/,"");
  url.search="";
  url.hash="";
  return url.toString().replace(/\/$/,"");
}

export function isLoopbackCogneeUrl(value){
  const url=new URL(normalizeCogneeBaseUrl(value));
  return LOOPBACK_HOSTS.has(url.hostname);
}

export function validateCogneeSelfTestConfig(config){
  const errors=[];
  if(config?.schema!==1) errors.push("schema must be 1");
  if(config?.provider_id!=="cognee-hermes") errors.push("provider_id must be cognee-hermes");
  if(config?.integration_id!=="cognee-hermes-evaluation") errors.push("integration_id drift");
  if(config?.source_id!=="cognee-integrations") errors.push("source_id drift");
  if(!/^[0-9a-f]{40}$/.test(config?.source_commit||"")) errors.push("source_commit must be a 40-char git SHA");
  if(config?.transport!=="http") errors.push("transport must be http");
  if(!nonEmpty(config?.base_url_env)) errors.push("base_url_env required");
  if(!nonEmpty(config?.api_key_env)) errors.push("api_key_env required");
  if(!nonEmpty(config?.dataset_prefix)||!/^[A-Za-z0-9_-]+$/.test(config.dataset_prefix)) errors.push("dataset_prefix must be a safe identifier");
  if(!Number.isInteger(config?.request_timeout_ms)||config.request_timeout_ms<1000) errors.push("request_timeout_ms must be >=1000");
  const expected=[
    "profile-isolation","cross-profile-contamination-negative","write-read-roundtrip","provenance",
    "export","delete","secret-rejection","shared-promotion-boundary"
  ];
  if(!Array.isArray(config?.required_case_ids)||config.required_case_ids.length!==expected.length||expected.some((id)=>!config.required_case_ids.includes(id))){
    errors.push("required_case_ids must contain the canonical eight memory cases");
  }
  for(const key of [
    "auto_install_forbidden","auto_login_forbidden","auto_key_mint_forbidden","existing_dataset_reuse_forbidden",
    "delete_outside_run_datasets_forbidden","raw_credentials_in_evidence_forbidden","remote_requires_explicit_opt_in",
    "remote_requires_api_key","cleanup_attempt_required"
  ]){
    if(config?.safety?.[key]!==true) errors.push("safety."+key+" must be true");
  }
  if(!nonEmpty(config?.claim_limit)) errors.push("claim_limit required");
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});
}

export function buildCogneeSelfTestPlan({config,baseUrl,apiKeyPresent=false,allowRemote=false}){
  const check=validateCogneeSelfTestConfig(config);
  if(!check.ok) throw new Error("invalid Cognee self-test config: "+check.errors.join("; "));
  const configured=nonEmpty(baseUrl);
  const effective=configured?normalizeCogneeBaseUrl(baseUrl):config.default_local_url;
  const loopback=isLoopbackCogneeUrl(effective);
  const executable=loopback||(allowRemote&&apiKeyPresent);
  return Object.freeze({
    schema:1,
    provider_id:config.provider_id,
    source_commit:config.source_commit,
    integration_version:config.pinned_integration_version,
    cognee_version:config.pinned_cognee_version,
    configured_base_url:configured,
    effective_base_url:effective,
    target_scope:loopback?"LOOPBACK":"REMOTE",
    api_key_present:Boolean(apiKeyPresent),
    remote_opt_in:Boolean(allowRemote),
    configuration_ready:Boolean(executable),
    endpoint_reachability:"NOT_CHECKED",
    executable_now:Boolean(executable),
    provider_call_performed:false,
    writes_existing_dataset:false,
    auto_install:false,
    auto_login:false,
    auto_key_mint:false,
    next:executable
      ?"Run the isolated eight-case self-test. New random evaluation datasets will be created and cleanup will be attempted."
      :loopback
        ?"Start a compatible Cognee HTTP server at the configured local URL."
        :"Remote Cognee requires --allow-remote plus COGNEE_API_KEY in the environment.",
    claim_limit:config.claim_limit
  });
}

function requestHeaders(apiKey,json=false){
  const headers={accept:"application/json"};
  if(json) headers["content-type"]="application/json";
  if(nonEmpty(apiKey)) headers["x-api-key"]=apiKey;
  return headers;
}

function extractDatasetId(value,name){
  const candidates=[];
  if(value&&typeof value==="object"&&!Array.isArray(value)) candidates.push(value);
  if(Array.isArray(value)) candidates.push(...value);
  for(const item of candidates){
    if(!item||typeof item!=="object") continue;
    const itemName=String(item.name??item.dataset_name??item.datasetName??"");
    const id=String(item.id??item.dataset_id??item.datasetId??"");
    if((!name||itemName===name)&&/^[0-9a-f-]{30,}$/i.test(id)) return id;
  }
  return null;
}

function extractDataId(item){
  if(!item||typeof item!=="object") return null;
  const id=String(item.id??item.data_id??item.dataId??item.uuid??"");
  return /^[0-9a-f-]{30,}$/i.test(id)?id:null;
}

export function createCogneeHttpClient({baseUrl,apiKey="",timeoutMs=20000,fetchImpl=fetch}={}){
  const base=normalizeCogneeBaseUrl(baseUrl);
  const calls=[];
  const secrets=[apiKey].filter(nonEmpty);

  async function request(method,path,{jsonBody,formData,parseJson=true}={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const started=Date.now();
    let response;
    try{
      response=await fetchImpl(base+path,{
        method,
        headers:formData?requestHeaders(apiKey,false):requestHeaders(apiKey,jsonBody!==undefined),
        body:formData??(jsonBody!==undefined?JSON.stringify(jsonBody):undefined),
        signal:controller.signal
      });
      const text=await response.text();
      calls.push(Object.freeze({method,path,status:response.status,duration_ms:Date.now()-started}));
      if(!response.ok) throw new Error("Cognee HTTP "+response.status+" on "+path+": "+redactText(text,secrets));
      if(!parseJson) return text;
      if(!text.trim()) return null;
      try{return JSON.parse(text);}catch{throw new Error("Cognee returned non-JSON on "+path);}
    }catch(error){
      if(error?.name==="AbortError"){
        calls.push(Object.freeze({method,path,status:null,duration_ms:Date.now()-started,timeout:true}));
        throw new Error("Cognee request timed out on "+path);
      }
      if(!response) calls.push(Object.freeze({method,path,status:null,duration_ms:Date.now()-started,error:true}));
      throw new Error(redactText(error?.message||error,secrets));
    }finally{
      clearTimeout(timer);
    }
  }

  async function listDatasets(){
    const result=await request("GET","/api/v1/datasets");
    return Array.isArray(result)?result.filter((x)=>x&&typeof x==="object"):[];
  }

  async function resolveDataset(name){
    const rows=await listDatasets();
    const row=rows.find((x)=>String(x.name??x.dataset_name??x.datasetName??"")===name);
    if(!row) return null;
    return {...row,id:extractDatasetId(row,name)};
  }

  const client={
    base_url:base,
    request_log:()=>Object.freeze([...calls]),
    async health(){await request("GET","/health");return true;},
    async ensureDataset(name){
      assertSafePayload(name,"dataset name");
      const created=await request("POST","/api/v1/datasets",{jsonBody:{name}});
      let id=extractDatasetId(created,name);
      if(!id) id=(await resolveDataset(name))?.id||null;
      if(!id) throw new Error("Cognee did not expose an id for dataset "+name);
      return Object.freeze({name,id});
    },
    listDatasets,
    resolveDataset,
    async rememberPermanent(dataset,text){
      assertSafePayload(dataset,"dataset");
      assertSafePayload(text,"memory payload");
      const form=new FormData();
      form.set("datasetName",dataset);
      form.set("data",new Blob([String(text)],{type:"text/plain"}),"memory.txt");
      const result=await request("POST","/api/v1/remember",{formData:form});
      return result&&typeof result==="object"?result:{};
    },
    async recall(dataset,query){
      assertSafePayload(dataset,"dataset");
      assertSafePayload(query,"recall query");
      const result=await request("POST","/api/v1/recall",{jsonBody:{
        query:String(query),
        datasets:[dataset],
        top_k:10,
        scope:["graph"],
        only_context:true,
        search_type:"CHUNKS"
      }});
      return Array.isArray(result)?result:result?[result]:[];
    },
    async listDatasetData(datasetId){
      const result=await request("GET","/api/v1/datasets/"+encodeURIComponent(datasetId)+"/data");
      return Array.isArray(result)?result.filter((x)=>x&&typeof x==="object"):[];
    },
    async readRawData(datasetId,dataId){
      let raw=await request("GET","/api/v1/datasets/"+encodeURIComponent(datasetId)+"/data/"+encodeURIComponent(dataId)+"/raw",{parseJson:false});
      const text=String(raw??"");
      if(text.startsWith('"')&&text.endsWith('"')){
        try{
          const decoded=JSON.parse(text);
          if(typeof decoded==="string") raw=decoded;
        }catch{}
      }
      return String(raw??"");
    },
    async exportDataset(dataset){
      const meta=await resolveDataset(dataset);
      if(!meta?.id) return Object.freeze({dataset,dataset_id:null,items:[]});
      const rows=await client.listDatasetData(meta.id);
      const items=[];
      for(const row of rows){
        const dataId=extractDataId(row);
        if(!dataId) continue;
        const raw=await client.readRawData(meta.id,dataId);
        items.push(Object.freeze({data_id:dataId,raw}));
      }
      return Object.freeze({dataset,dataset_id:meta.id,items:Object.freeze(items)});
    },
    async forgetDataset(dataset){
      assertSafePayload(dataset,"dataset");
      const result=await request("POST","/api/v1/forget",{jsonBody:{everything:false,memory_only:false,dataset}});
      return result&&typeof result==="object"?result:{};
    }
  };
  return Object.freeze(client);
}

function exportContains(exported,needle){
  return exported.items.some((item)=>String(item.raw).includes(needle));
}

function exportText(exported){
  return exported.items.map((item)=>String(item.raw)).join("\n");
}

function memoryMetrics(values={}){
  return Object.freeze({
    success:Boolean(values.success),
    evidence_complete:Boolean(values.evidenceComplete),
    false_success:false,
    cross_profile_leak:Boolean(values.crossProfileLeak),
    delete_verified:Boolean(values.deleteVerified),
    export_verified:Boolean(values.exportVerified),
    provenance_verified:Boolean(values.provenanceVerified),
    secret_persistence:Boolean(values.secretPersistence)
  });
}

function caseRecord(caseId,started,values,note,observed={}){
  return Object.freeze({
    case_id:caseId,
    duration_ms:Date.now()-started,
    metrics:memoryMetrics(values),
    note,
    observed:Object.freeze(observed)
  });
}

function hashExport(exported){
  const canonical=exported.items.map((x)=>x.raw).sort().join("\n---\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildRunDatasetNames(config,runId=randomUUID()){
  const token=safeName(String(runId).replaceAll("-","").slice(0,12));
  const prefix=safeName(config.dataset_prefix);
  const make=(suffix)=>(prefix+"_"+token+"_"+suffix).slice(0,120);
  return Object.freeze({
    profile_a:make("profile_a"),
    profile_b:make("profile_b"),
    roundtrip:make("roundtrip"),
    provenance:make("provenance"),
    export:make("export"),
    deletion:make("delete"),
    secret:make("secret"),
    shared:make("shared")
  });
}

async function guardedRemember(client,dataset,text){
  assertSafePayload(text,"memory payload");
  return client.rememberPermanent(dataset,text);
}

async function safeCase(caseId,fn){
  const started=Date.now();
  try{return await fn(started);}
  catch(error){
    return caseRecord(caseId,started,{success:false,evidenceComplete:false},"Case failed closed.",{
      error:redactText(error?.message||error)
    });
  }
}

export async function executeCogneeSelfTest({config,client,runId=randomUUID()}={}){
  const check=validateCogneeSelfTestConfig(config);
  if(!check.ok) throw new Error("invalid Cognee self-test config: "+check.errors.join("; "));
  if(!client||typeof client.health!=="function") throw new Error("Cognee client required");

  const datasets=buildRunDatasetNames(config,runId);
  const owned=new Set(Object.values(datasets));
  const created=new Set();
  const cases=[];
  const markerBase="NYOBA_"+safeName(runId).toUpperCase();
  const markerA=markerBase+"_PROFILE_A";
  const markerB=markerBase+"_PROFILE_B";
  const markerRoundtrip=markerBase+"_ROUNDTRIP";
  const markerProvenance=markerBase+"_PROVENANCE";
  const markerExportA=markerBase+"_EXPORT_A";
  const markerExportB=markerBase+"_EXPORT_B";
  const markerDelete=markerBase+"_DELETE";
  const markerShared=markerBase+"_SHARED";
  const forbiddenSecret="api_key=NYOBA_SHOULD_NEVER_PERSIST_"+safeName(runId);

  async function ensure(name){
    if(!owned.has(name)) throw new Error("refusing to create non-owned dataset");
    const existing=await client.resolveDataset(name);
    if(existing) throw new Error("evaluation dataset already exists; refusing reuse");
    const result=await client.ensureDataset(name);
    created.add(name);
    return result;
  }

  await client.health();
  for(const name of owned) await ensure(name);

  cases.push(await safeCase("profile-isolation",async(started)=>{
    await guardedRemember(client,datasets.profile_a,markerA);
    await guardedRemember(client,datasets.profile_b,markerB);
    const [a,b]=await Promise.all([client.exportDataset(datasets.profile_a),client.exportDataset(datasets.profile_b)]);
    const leak=exportContains(a,markerB)||exportContains(b,markerA);
    const success=exportContains(a,markerA)&&exportContains(b,markerB)&&!leak;
    return caseRecord("profile-isolation",started,{
      success,evidenceComplete:true,crossProfileLeak:leak,exportVerified:true
    },success?"Profile datasets remained isolated.":"Profile isolation evidence contradicted.",{
      profile_a_items:a.items.length,profile_b_items:b.items.length
    });
  }));

  cases.push(await safeCase("cross-profile-contamination-negative",async(started)=>{
    const [a,b]=await Promise.all([client.exportDataset(datasets.profile_a),client.exportDataset(datasets.profile_b)]);
    const leak=exportContains(b,markerA)||exportContains(a,markerB);
    return caseRecord("cross-profile-contamination-negative",started,{
      success:!leak,evidenceComplete:true,crossProfileLeak:leak,exportVerified:true
    },!leak?"Negative contamination check found no cross-profile marker.":"Cross-profile marker detected.",{
      profile_a_sha256:hashExport(a),profile_b_sha256:hashExport(b)
    });
  }));

  cases.push(await safeCase("write-read-roundtrip",async(started)=>{
    await guardedRemember(client,datasets.roundtrip,markerRoundtrip);
    const exported=await client.exportDataset(datasets.roundtrip);
    let recallObserved=false;
    try{
      const recalled=await client.recall(datasets.roundtrip,markerRoundtrip);
      recallObserved=JSON.stringify(recalled).includes(markerRoundtrip);
    }catch{}
    const rawObserved=exportContains(exported,markerRoundtrip);
    return caseRecord("write-read-roundtrip",started,{
      success:rawObserved,evidenceComplete:true,exportVerified:rawObserved
    },rawObserved?"Exact marker persisted and was readable from the isolated dataset.":"Exact marker was not readable after write.",{
      raw_observed:rawObserved,recall_probe_observed:recallObserved,export_sha256:hashExport(exported)
    });
  }));

  cases.push(await safeCase("provenance",async(started)=>{
    const provenance=markerProvenance+"|source=owner_self_test|run="+safeName(runId)+"|scope=isolated";
    await guardedRemember(client,datasets.provenance,provenance);
    const exported=await client.exportDataset(datasets.provenance);
    const raw=exportText(exported);
    const verified=raw.includes(markerProvenance)&&raw.includes("source=owner_self_test")&&raw.includes("scope=isolated");
    return caseRecord("provenance",started,{
      success:verified,evidenceComplete:true,exportVerified:true,provenanceVerified:verified
    },verified?"Provenance envelope round-tripped intact.":"Provenance envelope was incomplete.",{
      export_sha256:hashExport(exported)
    });
  }));

  cases.push(await safeCase("export",async(started)=>{
    await guardedRemember(client,datasets.export,markerExportA);
    await guardedRemember(client,datasets.export,markerExportB);
    const exported=await client.exportDataset(datasets.export);
    const verified=exportContains(exported,markerExportA)&&exportContains(exported,markerExportB);
    return caseRecord("export",started,{
      success:verified,evidenceComplete:true,exportVerified:verified
    },verified?"Dataset export contained both expected records.":"Dataset export missed expected records.",{
      item_count:exported.items.length,export_sha256:hashExport(exported)
    });
  }));

  cases.push(await safeCase("delete",async(started)=>{
    await guardedRemember(client,datasets.deletion,markerDelete);
    const before=await client.exportDataset(datasets.deletion);
    const presentBefore=exportContains(before,markerDelete);
    await client.forgetDataset(datasets.deletion);
    const after=await client.exportDataset(datasets.deletion);
    const absentAfter=!exportContains(after,markerDelete);
    const verified=presentBefore&&absentAfter;
    return caseRecord("delete",started,{
      success:verified,evidenceComplete:true,deleteVerified:verified,exportVerified:true
    },verified?"Dataset-scoped delete removed the test marker.":"Delete verification failed.",{
      before_count:before.items.length,after_count:after.items.length
    });
  }));

  cases.push(await safeCase("secret-rejection",async(started)=>{
    let rejected=false;
    try{await guardedRemember(client,datasets.secret,forbiddenSecret);}
    catch(error){rejected=/secret-like/.test(String(error?.message||error));}
    const exported=await client.exportDataset(datasets.secret);
    const persisted=exportContains(exported,"NYOBA_SHOULD_NEVER_PERSIST");
    const success=rejected&&!persisted;
    return caseRecord("secret-rejection",started,{
      success,evidenceComplete:true,secretPersistence:persisted,exportVerified:true
    },success?"Secret-like payload was rejected before provider write and was not persisted.":"Secret guard failed or secret-like material persisted.",{
      rejected_before_write:rejected,item_count:exported.items.length
    });
  }));

  cases.push(await safeCase("shared-promotion-boundary",async(started)=>{
    await guardedRemember(client,datasets.profile_a,markerShared);
    const sharedBefore=await client.exportDataset(datasets.shared);
    const absentBefore=!exportContains(sharedBefore,markerShared);
    if(!absentBefore){
      return caseRecord("shared-promotion-boundary",started,{
        success:false,evidenceComplete:true,crossProfileLeak:true,exportVerified:true
      },"Marker appeared in shared dataset before explicit promotion.",{absent_before:false});
    }
    const source=await client.exportDataset(datasets.profile_a);
    const sourceItem=source.items.find((item)=>String(item.raw).includes(markerShared));
    if(!sourceItem) throw new Error("promotion source marker missing");
    const promoted="PROMOTED_EXPLICITLY|"+markerShared+"|source_dataset="+datasets.profile_a;
    await guardedRemember(client,datasets.shared,promoted);
    const sharedAfter=await client.exportDataset(datasets.shared);
    const profileB=await client.exportDataset(datasets.profile_b);
    const promotedAfter=exportContains(sharedAfter,markerShared);
    const leakedToB=exportContains(profileB,markerShared);
    const success=absentBefore&&promotedAfter&&!leakedToB;
    return caseRecord("shared-promotion-boundary",started,{
      success,evidenceComplete:true,crossProfileLeak:leakedToB,exportVerified:true,provenanceVerified:promotedAfter
    },success?"Shared memory changed only after explicit promotion and did not leak to the other profile.":"Shared promotion boundary failed.",{
      absent_before:absentBefore,promoted_after:promotedAfter,leaked_to_profile_b:leakedToB
    });
  }));

  const cleanup=[];
  for(const name of created){
    try{
      await client.forgetDataset(name);
      const after=await client.exportDataset(name);
      cleanup.push(Object.freeze({dataset:name,attempted:true,verified_empty:after.items.length===0}));
    }catch(error){
      cleanup.push(Object.freeze({dataset:name,attempted:true,verified_empty:false,error:redactText(error?.message||error)}));
    }
  }

  const cleanupComplete=cleanup.length===created.size&&cleanup.every((x)=>x.attempted&&x.verified_empty);
  const allCases=cases.length===config.required_case_ids.length&&cases.every((x)=>x.metrics.success&&x.metrics.evidence_complete&&!x.metrics.false_success);
  const passed=allCases&&cleanupComplete;

  return Object.freeze({
    schema:1,
    benchmark:"cognee-self-service-eight-case",
    provider_id:config.provider_id,
    integration_id:config.integration_id,
    source_id:config.source_id,
    source_commit:config.source_commit,
    pinned_integration_version:config.pinned_integration_version,
    pinned_cognee_version:config.pinned_cognee_version,
    transport:"http",
    run_id:safeName(runId),
    claim_state:passed?"SELF_TEST_PASSED":"SELF_TEST_FAILED",
    passed,
    cases:Object.freeze(cases),
    cleanup:Object.freeze(cleanup),
    cleanup_complete:cleanupComplete,
    provider_calls:typeof client.request_log==="function"?client.request_log():[],
    evidence_policy:Object.freeze({
      credential_values_recorded:false,
      existing_dataset_reused:false,
      deletes_scoped_to_run_datasets:true,
      canonical_benchmark_mutated:false
    }),
    claim_limit:config.claim_limit
  });
}
