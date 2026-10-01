import test from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_SANDBOX_COST_STATES,
  LIVE_SANDBOX_MODEL_IDENTITY_STATES,
  defineLiveSandboxPolicy,
  admitLiveSandboxDispatch,
  validateSandboxAdmission,
} from "./index.mjs";

function policy(overrides={}) {
  return {
    schema:1,
    id:"v0-6-live-sandbox",
    allowed_risk_classes:["READ_ONLY"],
    max_duration_ms:45000,
    max_tool_calls:4,
    max_input_tokens:12000,
    max_output_tokens:4000,
    max_total_tokens:16000,
    max_cost_usd:null,
    allowed_tool_ids:[],
    allowed_network_hosts:[],
    allowed_runtime_providers:["codex","hermes","fixture-runtime"],
    allow_fallback:false,
    require_temporary_workspace:true,
    forbid_external_write:true,
    forbid_credentials_exposure:true,
    ...overrides,
  };
}

function declaration(overrides={}) {
  return {
    schema:1,
    mission_id:"mission-sandbox-001",
    task_id:"task-sandbox-001",
    risk_class:"READ_ONLY",
    provider_id:"codex",
    model_identity:{status:"UNKNOWN",model_id:null},
    model_route_ref:"model-route:sha256:"+"a".repeat(64),
    capability_route_refs:[],
    tool_ids:[],
    network_hosts:[],
    fallback_models:[],
    credentials_exposed_to_task:false,
    projected_usage:{
      duration_ms:15000,
      tool_calls:0,
      input_tokens:3000,
      output_tokens:1000,
      cost:{status:"UNKNOWN",amount_usd:null},
    },
    ...overrides,
  };
}

test("sandbox public enums are exact",()=>{
  assert.deepEqual(LIVE_SANDBOX_COST_STATES,["KNOWN","UNKNOWN"]);
  assert.deepEqual(LIVE_SANDBOX_MODEL_IDENTITY_STATES,["KNOWN","UNKNOWN"]);
});

test("safe read-only dispatch is admitted with content-addressed evidence",()=>{
  const result=admitLiveSandboxDispatch(policy(),declaration());
  assert.equal(result.allowed,true);
  assert.equal(result.decision,"ADMITTED");
  assert.deepEqual(result.reason_codes,[]);
  assert.match(result.sandbox_admission_ref,/^sandbox-admission:sha256:[a-f0-9]{64}$/);
  assert.equal(validateSandboxAdmission(result),true);
  assert.equal(result.provider_id,"codex");
  assert.equal(result.model_identity.status,"UNKNOWN");
});

test("KNOWN model identity requires an explicit model id while UNKNOWN forbids one",()=>{
  assert.throws(()=>admitLiveSandboxDispatch(policy(),declaration({
    model_identity:{status:"KNOWN",model_id:null},
  })),/model_id/i);
  assert.throws(()=>admitLiveSandboxDispatch(policy(),declaration({
    model_identity:{status:"UNKNOWN",model_id:"invented-model"},
  })),/UNKNOWN.*model_id|model_id.*UNKNOWN/i);
});

test("projected duration, tool, input, output and total token ceilings fail closed",()=>{
  const cases=[
    [{projected_usage:{...declaration().projected_usage,duration_ms:45001}},"DURATION_LIMIT_EXCEEDED"],
    [{projected_usage:{...declaration().projected_usage,tool_calls:5}},"TOOL_CALL_LIMIT_EXCEEDED"],
    [{projected_usage:{...declaration().projected_usage,input_tokens:12001}},"INPUT_TOKEN_LIMIT_EXCEEDED"],
    [{projected_usage:{...declaration().projected_usage,output_tokens:4001}},"OUTPUT_TOKEN_LIMIT_EXCEEDED"],
    [{projected_usage:{...declaration().projected_usage,input_tokens:12000,output_tokens:4001}},"TOTAL_TOKEN_LIMIT_EXCEEDED"],
  ];
  for(const [override,reason] of cases){
    const result=admitLiveSandboxDispatch(policy(),declaration(override));
    assert.equal(result.allowed,false);
    assert.ok(result.reason_codes.includes(reason),reason);
  }
});

test("UNKNOWN projected cost is never treated as zero under a hard cost ceiling",()=>{
  const blocked=admitLiveSandboxDispatch(policy({max_cost_usd:0.25}),declaration());
  assert.equal(blocked.allowed,false);
  assert.ok(blocked.reason_codes.includes("PROJECTED_COST_UNKNOWN"));

  const allowed=admitLiveSandboxDispatch(policy({max_cost_usd:0.25}),declaration({
    projected_usage:{
      ...declaration().projected_usage,
      cost:{status:"KNOWN",amount_usd:0.1},
    },
  }));
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.projected_usage.cost.amount_usd,0.1);
});

test("known projected cost over hard ceiling is blocked",()=>{
  const result=admitLiveSandboxDispatch(policy({max_cost_usd:0.25}),declaration({
    projected_usage:{
      ...declaration().projected_usage,
      cost:{status:"KNOWN",amount_usd:0.251},
    },
  }));
  assert.equal(result.allowed,false);
  assert.ok(result.reason_codes.includes("PROJECTED_COST_LIMIT_EXCEEDED"));
});

test("tool and task-network egress must be explicitly allowlisted",()=>{
  const result=admitLiveSandboxDispatch(policy(),declaration({
    tool_ids:["browser.structured"],
    network_hosts:["example.com"],
  }));
  assert.equal(result.allowed,false);
  assert.ok(result.reason_codes.includes("TOOL_NOT_ALLOWLISTED"));
  assert.ok(result.reason_codes.includes("NETWORK_HOST_NOT_ALLOWLISTED"));

  const allowed=admitLiveSandboxDispatch(policy({
    allowed_tool_ids:["browser.structured"],
    allowed_network_hosts:["example.com"],
  }),declaration({
    tool_ids:["browser.structured"],
    network_hosts:["example.com"],
  }));
  assert.equal(allowed.allowed,true);
});

test("runtime provider must be allowlisted",()=>{
  const result=admitLiveSandboxDispatch(policy(),declaration({provider_id:"other-provider"}));
  assert.equal(result.allowed,false);
  assert.ok(result.reason_codes.includes("RUNTIME_PROVIDER_NOT_ALLOWED"));
});

test("fallback models must be disclosed and policy-permitted",()=>{
  const fallback=[{
    provider_id:"hermes",
    model_identity:{status:"UNKNOWN",model_id:null},
  }];
  const blocked=admitLiveSandboxDispatch(policy(),declaration({fallback_models:fallback}));
  assert.equal(blocked.allowed,false);
  assert.ok(blocked.reason_codes.includes("FALLBACK_NOT_ALLOWED"));

  const allowed=admitLiveSandboxDispatch(policy({allow_fallback:true}),declaration({fallback_models:fallback}));
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.fallback_models.length,1);
});

test("credential exposure and non-read-only risk fail closed",()=>{
  const credentials=admitLiveSandboxDispatch(policy(),declaration({credentials_exposed_to_task:true}));
  assert.equal(credentials.allowed,false);
  assert.ok(credentials.reason_codes.includes("CREDENTIAL_EXPOSURE_FORBIDDEN"));

  const writeRisk=admitLiveSandboxDispatch(policy(),declaration({risk_class:"EXTERNAL_WRITE"}));
  assert.equal(writeRisk.allowed,false);
  assert.ok(writeRisk.reason_codes.includes("RISK_CLASS_NOT_ALLOWED"));
});

test("same semantic sets produce the same admission ref regardless input order",()=>{
  const p1=policy({
    allowed_tool_ids:["tool-b","tool-a"],
    allowed_network_hosts:["b.example","a.example"],
    allowed_runtime_providers:["hermes","codex"],
  });
  const p2=policy({
    allowed_tool_ids:["tool-a","tool-b"],
    allowed_network_hosts:["a.example","b.example"],
    allowed_runtime_providers:["codex","hermes"],
  });
  const d1=declaration({
    tool_ids:["tool-b","tool-a"],
    network_hosts:["b.example","a.example"],
    capability_route_refs:[
      "capability-route:sha256:"+"b".repeat(64),
      "capability-route:sha256:"+"c".repeat(64),
    ],
  });
  const d2=declaration({
    tool_ids:["tool-a","tool-b"],
    network_hosts:["a.example","b.example"],
    capability_route_refs:[
      "capability-route:sha256:"+"c".repeat(64),
      "capability-route:sha256:"+"b".repeat(64),
    ],
  });
  const a=admitLiveSandboxDispatch(p1,d1);
  const b=admitLiveSandboxDispatch(p2,d2);
  assert.equal(a.sandbox_admission_ref,b.sandbox_admission_ref);
});

test("admission digest detects tampering",()=>{
  const admission=admitLiveSandboxDispatch(policy(),declaration());
  assert.equal(validateSandboxAdmission(admission),true);
  assert.throws(()=>validateSandboxAdmission({
    ...admission,
    provider_id:"hermes",
  }),/admission ref.*content|digest|payload/i);
});

test("invalid cost representation is rejected instead of normalized",()=>{
  assert.throws(()=>admitLiveSandboxDispatch(policy(),declaration({
    projected_usage:{
      ...declaration().projected_usage,
      cost:{status:"UNKNOWN",amount_usd:0},
    },
  })),/UNKNOWN.*amount|amount.*UNKNOWN/i);

  assert.throws(()=>admitLiveSandboxDispatch(policy(),declaration({
    projected_usage:{
      ...declaration().projected_usage,
      cost:{status:"KNOWN",amount_usd:null},
    },
  })),/KNOWN.*amount|amount.*KNOWN/i);
});
