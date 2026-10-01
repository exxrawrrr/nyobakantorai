import test from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_SANDBOX_COST_STATES,
  LIVE_SANDBOX_MODEL_IDENTITY_STATES,
  defineLiveSandboxPolicy,
  admitLiveSandboxDispatch,
  validateSandboxAdmission,
  settleLiveSandbox,
  validateSandboxRecord,
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


function successfulOutcome(overrides={}) {
  return {
    schema:1,
    ok:true,
    state:"SUCCEEDED",
    error_category:null,
    runtime:{provider:"codex",runtime_ref:"codex:ephemeral:read-only",provider_version:"fixture"},
    evidence:{
      workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},
      prohibited_action_check:{passed:true,observed:[]},
      runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},
      evidence_refs:["evidence:runtime"],
      artifact_refs:["artifact:runtime"],
    },
    cleanup:{attempted:true,ok:true},
    started_at:"2026-10-01T09:00:00.000Z",
    finished_at:"2026-10-01T09:00:01.000Z",
    ...overrides,
  };
}

function actualUsage(overrides={}) {
  return {
    duration_ms:1000,
    tool_calls:0,
    input_tokens:3000,
    output_tokens:1000,
    cost:{status:"UNKNOWN",amount_usd:null},
    ...overrides,
  };
}

test("fully measured successful execution settles PASS with verified teardown",()=>{
  const admission=admitLiveSandboxDispatch(policy(),declaration());
  const record=settleLiveSandbox(admission,successfulOutcome(),actualUsage());
  assert.equal(record.status,"PASS");
  assert.equal(record.execution_state,"SUCCEEDED");
  assert.equal(record.teardown_verified,true);
  assert.equal(record.quota_status,"PASS");
  assert.deepEqual(record.reason_codes,[]);
  assert.match(record.sandbox_record_ref,/^sandbox-record:sha256:[a-f0-9]{64}$/);
  assert.equal(validateSandboxRecord(record),true);
});

test("known actual quota overage fails settlement",()=>{
  const admission=admitLiveSandboxDispatch(policy(),declaration());
  const record=settleLiveSandbox(admission,successfulOutcome(),actualUsage({
    input_tokens:12001,
    output_tokens:4000,
  }));
  assert.equal(record.status,"FAIL");
  assert.equal(record.quota_status,"FAIL");
  assert.ok(record.reason_codes.includes("ACTUAL_INPUT_TOKEN_LIMIT_EXCEEDED"));
  assert.ok(record.reason_codes.includes("ACTUAL_TOTAL_TOKEN_LIMIT_EXCEEDED"));
});

test("unknown actual token/tool counters produce PARTIAL quota verification, never zero",()=>{
  const admission=admitLiveSandboxDispatch(policy(),declaration());
  const record=settleLiveSandbox(admission,successfulOutcome(),actualUsage({
    tool_calls:null,
    input_tokens:null,
    output_tokens:null,
  }));
  assert.equal(record.status,"PARTIAL");
  assert.equal(record.quota_status,"PARTIAL");
  assert.ok(record.unverified_dimensions.includes("TOOL_CALLS"));
  assert.ok(record.unverified_dimensions.includes("INPUT_TOKENS"));
  assert.ok(record.unverified_dimensions.includes("OUTPUT_TOKENS"));
  assert.equal(record.actual_usage.input_tokens,null);
});

test("hard cost ceiling with unknown actual cost is PARTIAL rather than falsely within budget",()=>{
  const p=policy({max_cost_usd:0.25});
  const admission=admitLiveSandboxDispatch(p,declaration({
    projected_usage:{
      ...declaration().projected_usage,
      cost:{status:"KNOWN",amount_usd:0.1},
    },
  }));
  const record=settleLiveSandbox(admission,successfulOutcome(),actualUsage());
  assert.equal(record.status,"PARTIAL");
  assert.equal(record.quota_status,"PARTIAL");
  assert.ok(record.unverified_dimensions.includes("COST"));
  assert.equal(record.actual_usage.cost.status,"UNKNOWN");
});

test("known actual cost over hard ceiling fails settlement",()=>{
  const p=policy({max_cost_usd:0.25});
  const admission=admitLiveSandboxDispatch(p,declaration({
    projected_usage:{
      ...declaration().projected_usage,
      cost:{status:"KNOWN",amount_usd:0.1},
    },
  }));
  const record=settleLiveSandbox(admission,successfulOutcome(),actualUsage({
    cost:{status:"KNOWN",amount_usd:0.3},
  }));
  assert.equal(record.status,"FAIL");
  assert.ok(record.reason_codes.includes("ACTUAL_COST_LIMIT_EXCEEDED"));
});

test("cleanup or temporary-workspace evidence failure makes settlement FAIL",()=>{
  const admission=admitLiveSandboxDispatch(policy(),declaration());
  const cleanup=settleLiveSandbox(admission,successfulOutcome({
    cleanup:{attempted:true,ok:false},
  }),actualUsage());
  assert.equal(cleanup.status,"FAIL");
  assert.ok(cleanup.reason_codes.includes("CLEANUP_NOT_VERIFIED"));

  const workspace=settleLiveSandbox(admission,successfulOutcome({
    evidence:{
      ...successfulOutcome().evidence,
      workspace_mutation_check:{temporary_workspace_only:false,production_repo_changed:false},
    },
  }),actualUsage());
  assert.equal(workspace.status,"FAIL");
  assert.ok(workspace.reason_codes.includes("TEMPORARY_WORKSPACE_NOT_PROVEN"));
});

test("production repo mutation or external write evidence makes settlement FAIL",()=>{
  const admission=admitLiveSandboxDispatch(policy(),declaration());
  const mutation=settleLiveSandbox(admission,successfulOutcome({
    evidence:{
      ...successfulOutcome().evidence,
      workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:true},
    },
  }),actualUsage());
  assert.equal(mutation.status,"FAIL");
  assert.ok(mutation.reason_codes.includes("PRODUCTION_REPO_MUTATION"));

  const external=settleLiveSandbox(admission,successfulOutcome({
    evidence:{
      ...successfulOutcome().evidence,
      runtime_actions:{install:false,login:false,account_mutation:false,external_write:true},
    },
  }),actualUsage());
  assert.equal(external.status,"FAIL");
  assert.ok(external.reason_codes.includes("EXTERNAL_WRITE_OBSERVED"));
});

test("runtime provider drift and unsuccessful runtime outcome are explicit failures",()=>{
  const admission=admitLiveSandboxDispatch(policy(),declaration());
  const provider=settleLiveSandbox(admission,successfulOutcome({
    runtime:{provider:"hermes",runtime_ref:"hermes:fixture",provider_version:"fixture"},
  }),actualUsage());
  assert.equal(provider.status,"FAIL");
  assert.ok(provider.reason_codes.includes("RUNTIME_PROVIDER_MISMATCH"));

  const failed=settleLiveSandbox(admission,successfulOutcome({
    ok:false,
    state:"FAILED",
    error_category:"TIMEOUT",
  }),actualUsage());
  assert.equal(failed.status,"FAIL");
  assert.ok(failed.reason_codes.includes("RUNTIME_EXECUTION_NOT_SUCCESSFUL"));
});

test("sandbox record digest detects tampering",()=>{
  const admission=admitLiveSandboxDispatch(policy(),declaration());
  const record=settleLiveSandbox(admission,successfulOutcome(),actualUsage());
  assert.equal(validateSandboxRecord(record),true);
  assert.throws(()=>validateSandboxRecord({
    ...record,
    status:"FAIL",
  }),/record ref.*content|digest|payload/i);
});


test("fallback provider must also be inside the runtime provider allowlist",()=>{
  const result=admitLiveSandboxDispatch(policy({
    allow_fallback:true,
    allowed_runtime_providers:["codex"],
  }),declaration({
    fallback_models:[{
      provider_id:"hermes",
      model_identity:{status:"UNKNOWN",model_id:null},
    }],
  }));
  assert.equal(result.allowed,false);
  assert.ok(result.reason_codes.includes("FALLBACK_PROVIDER_NOT_ALLOWED"));
});

test("total token ceiling may be stricter than individual input/output ceilings",()=>{
  const result=admitLiveSandboxDispatch(policy({
    max_input_tokens:12000,
    max_output_tokens:4000,
    max_total_tokens:1000,
  }),declaration({
    projected_usage:{
      ...declaration().projected_usage,
      input_tokens:600,
      output_tokens:500,
    },
  }));
  assert.equal(result.allowed,false);
  assert.ok(result.reason_codes.includes("TOTAL_TOKEN_LIMIT_EXCEEDED"));
});
