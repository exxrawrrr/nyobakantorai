import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import {
  buildCogneeSelfTestPlan,
  buildRunDatasetNames,
  createCogneeHttpClient,
  executeCogneeSelfTest,
  isLoopbackCogneeUrl,
  normalizeCogneeBaseUrl,
  validateCogneeSelfTestConfig,
} from "./index.mjs";

const config=JSON.parse(await readFile(new URL("../../config/cognee-self-test.json",import.meta.url),"utf8"));

async function readBody(req){
  const chunks=[];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseJsonBody(buffer){
  return JSON.parse(buffer.toString("utf8")||"{}");
}

function parseMultipart(buffer,contentType){
  const match=/boundary=([^;]+)/i.exec(contentType||"");
  if(!match) throw new Error("missing multipart boundary");
  const boundary="--"+match[1].replace(/^"|"$/g,"");
  const text=buffer.toString("utf8");
  const parts=text.split(boundary).slice(1,-1);
  const out={};
  for(const part of parts){
    const split=part.indexOf("\r\n\r\n");
    if(split<0) continue;
    const headers=part.slice(0,split);
    let body=part.slice(split+4).replace(/\r\n$/,"");
    const name=/name="([^"]+)"/i.exec(headers)?.[1];
    if(name) out[name]=body;
  }
  return out;
}

async function startFakeCognee({deleteWorks=true,contaminateProfileB=false,failDatasetCreateAt=0}={}){
  const datasets=new Map();
  const requests=[];
  let secretLikeWriteCount=0;
  let datasetCreateCount=0;

  function datasetById(id){
    return [...datasets.values()].find((x)=>x.id===id)||null;
  }
  function ensure(name){
    if(!datasets.has(name)) datasets.set(name,{id:randomUUID(),name,docs:[]});
    return datasets.get(name);
  }
  function send(res,status,payload,contentType="application/json"){
    res.writeHead(status,{"content-type":contentType});
    res.end(contentType==="application/json"?JSON.stringify(payload):String(payload));
  }

  const server=createServer(async(req,res)=>{
    const body=await readBody(req);
    requests.push({
      method:req.method,
      path:req.url,
      has_api_key:Boolean(req.headers["x-api-key"]),
      body_preview:body.toString("utf8").slice(0,500)
    });
    if(/NYOBA_SHOULD_NEVER_PERSIST|api_key=/i.test(body.toString("utf8"))) secretLikeWriteCount+=1;

    if(req.method==="GET"&&req.url==="/health") return send(res,200,{status:"ok"});

    if(req.method==="GET"&&req.url==="/api/v1/datasets"){
      return send(res,200,[...datasets.values()].map((d)=>({id:d.id,name:d.name})));
    }

    if(req.method==="POST"&&(req.url==="/api/v1/datasets"||req.url==="/api/v1/datasets/")){
      datasetCreateCount+=1;
      if(failDatasetCreateAt&&datasetCreateCount===failDatasetCreateAt){
        return send(res,500,{detail:"intentional create failure"});
      }
      const data=parseJsonBody(body);
      const ds=ensure(String(data.name||""));
      return send(res,200,{id:ds.id,name:ds.name});
    }

    if(req.method==="POST"&&req.url==="/api/v1/remember"){
      const fields=parseMultipart(body,req.headers["content-type"]);
      const ds=ensure(String(fields.datasetName||""));
      ds.docs.push({id:randomUUID(),raw:String(fields.data||"")});
      return send(res,200,{status:"completed"});
    }

    if(req.method==="POST"&&req.url==="/api/v1/recall"){
      const data=parseJsonBody(body);
      const names=Array.isArray(data.datasets)?data.datasets:[];
      const docs=[];
      for(const name of names){
        const ds=datasets.get(name);
        if(ds) docs.push(...ds.docs);
      }
      const query=String(data.query||"");
      const hits=docs.filter((d)=>d.raw.includes(query)).map((d)=>({text:d.raw}));
      return send(res,200,hits);
    }

    const dataList=/^\/api\/v1\/datasets\/([^/]+)\/data$/.exec(req.url||"");
    if(req.method==="GET"&&dataList){
      const ds=datasetById(decodeURIComponent(dataList[1]));
      if(!ds) return send(res,200,[]);
      let docs=[...ds.docs];
      if(contaminateProfileB&&ds.name.endsWith("_profile_b")){
        for(const other of datasets.values()) if(other!==ds) docs=docs.concat(other.docs);
      }
      return send(res,200,docs.map((d)=>({id:d.id})));
    }

    const raw=/^\/api\/v1\/datasets\/([^/]+)\/data\/([^/]+)\/raw$/.exec(req.url||"");
    if(req.method==="GET"&&raw){
      const ds=datasetById(decodeURIComponent(raw[1]));
      let doc=ds?.docs.find((d)=>d.id===decodeURIComponent(raw[2]));
      if(!doc&&contaminateProfileB&&ds?.name.endsWith("_profile_b")){
        for(const other of datasets.values()){
          doc=other.docs.find((d)=>d.id===decodeURIComponent(raw[2]));
          if(doc) break;
        }
      }
      if(!doc) return send(res,404,{detail:"missing"});
      return send(res,200,doc.raw,"text/plain");
    }

    if(req.method==="POST"&&req.url==="/api/v1/forget"){
      const data=parseJsonBody(body);
      const ds=datasets.get(String(data.dataset||""));
      if(ds&&deleteWorks) ds.docs=[];
      return send(res,200,{deleted:Boolean(ds&&deleteWorks)});
    }

    return send(res,404,{detail:"not found"});
  });

  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  const addr=server.address();
  return {
    baseUrl:"http://127.0.0.1:"+addr.port,
    requests,
    secretLikeWriteCount:()=>secretLikeWriteCount,
    datasets,
    async stop(){await new Promise((resolve)=>server.close(resolve));}
  };
}

test("Cognee self-test config is pinned and safety defaults fail closed",()=>{
  const result=validateCogneeSelfTestConfig(config);
  assert.equal(result.ok,true,result.errors.join("\n"));
  assert.equal(config.pinned_integration_version,"1.3.1");
  assert.equal(config.pinned_cognee_version,"1.6.0");
  assert.equal(config.safety.auto_key_mint_forbidden,true);
  assert.equal(config.safety.existing_dataset_reuse_forbidden,true);
  const bad=structuredClone(config);
  bad.safety.auto_login_forbidden=false;
  bad.dataset_prefix="bad prefix";
  const failed=validateCogneeSelfTestConfig(bad);
  assert.equal(failed.ok,false);
  assert.ok(failed.errors.some((x)=>/auto_login_forbidden/.test(x)));
  assert.ok(failed.errors.some((x)=>/dataset_prefix/.test(x)));
});

test("base URL parser rejects embedded credentials and non-http schemes",()=>{
  assert.equal(normalizeCogneeBaseUrl("http://127.0.0.1:8011/"),"http://127.0.0.1:8011");
  assert.equal(isLoopbackCogneeUrl("http://localhost:8011"),true);
  assert.equal(isLoopbackCogneeUrl("https://memory.example.test"),false);
  assert.throws(()=>normalizeCogneeBaseUrl("https://user:pass@example.test"),/must not contain credentials/);
  assert.throws(()=>normalizeCogneeBaseUrl("file:///tmp/cognee"),/must use http\/https/);
});

test("plan is side-effect free and remote mode requires explicit opt-in plus key",()=>{
  const local=buildCogneeSelfTestPlan({config,baseUrl:"http://127.0.0.1:8011"});
  assert.equal(local.executable_now,true);
  assert.equal(local.provider_call_performed,false);
  const remoteBlocked=buildCogneeSelfTestPlan({config,baseUrl:"https://memory.example.test",apiKeyPresent:true,allowRemote:false});
  assert.equal(remoteBlocked.executable_now,false);
  const remoteNoKey=buildCogneeSelfTestPlan({config,baseUrl:"https://memory.example.test",apiKeyPresent:false,allowRemote:true});
  assert.equal(remoteNoKey.executable_now,false);
  const remoteReady=buildCogneeSelfTestPlan({config,baseUrl:"https://memory.example.test",apiKeyPresent:true,allowRemote:true});
  assert.equal(remoteReady.executable_now,true);
});

test("run dataset names are unique and constrained to evaluation prefix",()=>{
  const a=buildRunDatasetNames(config,"11111111-1111-4111-8111-111111111111");
  const b=buildRunDatasetNames(config,"22222222-2222-4222-8222-222222222222");
  assert.notEqual(a.profile_a,b.profile_a);
  assert.ok(Object.values(a).every((x)=>x.startsWith(config.dataset_prefix+"_")));
  assert.equal(new Set(Object.values(a)).size,Object.values(a).length);
});

test("HTTP client never records API key and follows pinned dataset/write/read wire contract",async()=>{
  const server=await startFakeCognee();
  const key="SUPER-SECRET-COGNEE-KEY-123";
  try{
    const client=createCogneeHttpClient({baseUrl:server.baseUrl,apiKey:key,timeoutMs:3000});
    await client.health();
    const ds=await client.ensureDataset("nyoba_eval_wire");
    assert.match(ds.id,/^[0-9a-f-]{30,}$/i);
    await client.rememberPermanent("nyoba_eval_wire","WIRE_MARKER");
    const exported=await client.exportDataset("nyoba_eval_wire");
    assert.equal(exported.items.length,1);
    assert.match(exported.items[0].raw,/WIRE_MARKER/);
    assert.ok(server.requests.some((r)=>r.path==="/api/v1/remember"&&r.has_api_key));
    assert.equal(JSON.stringify(client.request_log()).includes(key),false);
  }finally{
    await server.stop();
  }
});

test("full eight-case self-test passes against a disposable Cognee-compatible target",async()=>{
  const server=await startFakeCognee();
  try{
    const client=createCogneeHttpClient({baseUrl:server.baseUrl,apiKey:"test-key",timeoutMs:3000});
    const report=await executeCogneeSelfTest({
      config,client,runId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
    assert.equal(report.passed,true);
    assert.equal(report.claim_state,"SELF_TEST_PASSED");
    assert.equal(report.cases.length,8);
    assert.ok(report.cases.every((x)=>x.metrics.success&&x.metrics.evidence_complete&&!x.metrics.false_success));
    assert.equal(report.cases.find((x)=>x.case_id==="profile-isolation").metrics.cross_profile_leak,false);
    assert.equal(report.cases.find((x)=>x.case_id==="delete").metrics.delete_verified,true);
    assert.equal(report.cases.find((x)=>x.case_id==="export").metrics.export_verified,true);
    assert.equal(report.cases.find((x)=>x.case_id==="provenance").metrics.provenance_verified,true);
    assert.equal(report.cases.find((x)=>x.case_id==="secret-rejection").metrics.secret_persistence,false);
    assert.equal(report.cleanup_complete,true);
    assert.equal(report.evidence_policy.credential_values_recorded,false);
    assert.equal(server.secretLikeWriteCount(),0);
  }finally{
    await server.stop();
  }
});

test("secret-like payload is rejected before any provider write",async()=>{
  const server=await startFakeCognee();
  try{
    const client=createCogneeHttpClient({baseUrl:server.baseUrl,timeoutMs:3000});
    const report=await executeCogneeSelfTest({
      config,client,runId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    });
    const secretCase=report.cases.find((x)=>x.case_id==="secret-rejection");
    assert.equal(secretCase.metrics.success,true);
    assert.equal(secretCase.observed.rejected_before_write,true);
    assert.equal(server.secretLikeWriteCount(),0);
  }finally{
    await server.stop();
  }
});

test("cross-profile contamination forces a truthful failure",async()=>{
  const server=await startFakeCognee({contaminateProfileB:true});
  try{
    const client=createCogneeHttpClient({baseUrl:server.baseUrl,timeoutMs:3000});
    const report=await executeCogneeSelfTest({
      config,client,runId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    });
    assert.equal(report.passed,false);
    assert.equal(report.claim_state,"SELF_TEST_FAILED");
    const isolation=report.cases.find((x)=>x.case_id==="profile-isolation");
    assert.equal(isolation.metrics.cross_profile_leak,true);
    assert.equal(isolation.metrics.success,false);
  }finally{
    await server.stop();
  }
});

test("cleanup failure prevents a green self-test",async()=>{
  const server=await startFakeCognee({deleteWorks:false});
  try{
    const client=createCogneeHttpClient({baseUrl:server.baseUrl,timeoutMs:3000});
    const report=await executeCogneeSelfTest({
      config,client,runId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    });
    assert.equal(report.passed,false);
    assert.equal(report.cleanup_complete,false);
    assert.equal(report.claim_state,"SELF_TEST_FAILED");
    assert.equal(report.cases.find((x)=>x.case_id==="delete").metrics.delete_verified,false);
  }finally{
    await server.stop();
  }
});

test("pre-existing generated dataset name is never reused",async()=>{
  const server=await startFakeCognee();
  try{
    const client=createCogneeHttpClient({baseUrl:server.baseUrl,timeoutMs:3000});
    const runId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const names=buildRunDatasetNames(config,runId);
    await client.ensureDataset(names.profile_a);
    await assert.rejects(
      ()=>executeCogneeSelfTest({config,client,runId}),
      /already exists; refusing reuse/
    );
  }finally{
    await server.stop();
  }
});


test("partial dataset setup failure triggers best-effort cleanup",async()=>{
  const server=await startFakeCognee({failDatasetCreateAt:4});
  try{
    const client=createCogneeHttpClient({baseUrl:server.baseUrl,timeoutMs:3000});
    await assert.rejects(
      ()=>executeCogneeSelfTest({
        config,client,runId:"ffffffff-ffff-4fff-8fff-ffffffffffff"
      }),
      /setup failed; cleanup attempted/
    );
    for(const dataset of server.datasets.values()){
      assert.equal(dataset.docs.length,0);
    }
    assert.ok(server.requests.some((r)=>r.path==="/api/v1/forget"));
  }finally{
    await server.stop();
  }
});
