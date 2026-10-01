import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_TASK_CLASSES,
  ModelRouteUnavailableError,
  normalizeModelCandidate,
  normalizeModelRouteRequest,
  routeModel,
} from "./index.mjs";

function candidate(overrides = {}) {
  return {
    schema:1,
    model_id:"model-fast-local",
    provider_id:"provider-local",
    runtime_id:"runtime-local",
    task_classes:["FAST","REASONING","CODING","LOCAL_SENSITIVE"],
    modalities:["text"],
    max_reasoning_depth:"HIGH",
    locality:"LOCAL",
    context_tokens:128000,
    p95_latency_ms:800,
    pricing_usd_per_million:{ input:1, output:2 },
    enabled:true,
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    schema:1,
    task_class:"FAST",
    modalities:["text"],
    reasoning_depth:"LOW",
    min_context_tokens:8000,
    latency_target_ms:2000,
    estimated_input_tokens:2000,
    estimated_output_tokens:1000,
    budget_usd:0.02,
    privacy:"STANDARD",
    allow_fallback:true,
    user_policy:{
      allowed_providers:[],
      denied_providers:[],
      allow_cloud:true,
    },
    provider_health:{
      "provider-local":"HEALTHY",
      "provider-cloud":"HEALTHY",
      "provider-alt":"DEGRADED",
    },
    ...overrides,
  };
}

test("task class catalog is exact and request normalization preserves v1 classes", () => {
  assert.deepEqual(MODEL_TASK_CLASSES, ["FAST","REASONING","VISION","CODING","LOCAL_SENSITIVE"]);
  for (const taskClass of MODEL_TASK_CLASSES) {
    const normalized = normalizeModelRouteRequest(request({ task_class:taskClass }));
    assert.equal(normalized.task_class, taskClass);
  }
});

test("candidate normalization rejects malformed capability facts", () => {
  assert.throws(
    () => normalizeModelCandidate(candidate({ context_tokens:0 })),
    /context_tokens/,
  );
  assert.throws(
    () => normalizeModelCandidate(candidate({ locality:"EDGE_MAGIC" })),
    /locality/,
  );
  assert.throws(
    () => normalizeModelCandidate(candidate({ max_reasoning_depth:"ULTRA" })),
    /reasoning/,
  );
});

test("FAST route selects healthy eligible candidate and exposes inspectable evidence", () => {
  const result = routeModel(request(), [
    candidate(),
    candidate({
      model_id:"model-cloud-fast",
      provider_id:"provider-cloud",
      runtime_id:"runtime-cloud",
      locality:"CLOUD",
      p95_latency_ms:500,
      pricing_usd_per_million:{ input:3, output:6 },
    }),
  ]);

  assert.equal(result.selected.model_id, "model-fast-local");
  assert.equal(result.selected.provider_health, "HEALTHY");
  assert.match(result.model_route_ref, /^model-route:sha256:[a-f0-9]{64}$/);
  assert.ok(Array.isArray(result.rejected));
  assert.ok(Array.isArray(result.fallbacks));
});

test("modality, reasoning and context requirements are hard filters", () => {
  const result = routeModel(request({
    task_class:"VISION",
    modalities:["text","image"],
    reasoning_depth:"HIGH",
    min_context_tokens:100000,
    latency_target_ms:null,
    budget_usd:null,
  }), [
    candidate({
      model_id:"bad-modality",
      task_classes:["VISION"],
      modalities:["text"],
      max_reasoning_depth:"HIGH",
    }),
    candidate({
      model_id:"bad-reasoning",
      task_classes:["VISION"],
      modalities:["text","image"],
      max_reasoning_depth:"MEDIUM",
    }),
    candidate({
      model_id:"bad-context",
      task_classes:["VISION"],
      modalities:["text","image"],
      max_reasoning_depth:"HIGH",
      context_tokens:64000,
    }),
    candidate({
      model_id:"good-vision",
      task_classes:["VISION"],
      modalities:["text","image"],
      max_reasoning_depth:"HIGH",
      context_tokens:128000,
    }),
  ]);

  assert.equal(result.selected.model_id, "good-vision");
  const reasons = Object.fromEntries(result.rejected.map((item) => [item.model_id,item.reason_codes]));
  assert.ok(reasons["bad-modality"].includes("MODALITY_UNSUPPORTED"));
  assert.ok(reasons["bad-reasoning"].includes("REASONING_INSUFFICIENT"));
  assert.ok(reasons["bad-context"].includes("CONTEXT_TOO_SMALL"));
});

test("DOWN and UNKNOWN health are ineligible while DEGRADED may remain eligible", () => {
  const result = routeModel(request({
    latency_target_ms:null,
    budget_usd:null,
    provider_health:{
      "provider-local":"DOWN",
      "provider-cloud":"UNKNOWN",
      "provider-alt":"DEGRADED",
    },
  }), [
    candidate(),
    candidate({
      model_id:"cloud-unknown",
      provider_id:"provider-cloud",
      runtime_id:"runtime-cloud",
      locality:"CLOUD",
    }),
    candidate({
      model_id:"alt-degraded",
      provider_id:"provider-alt",
      runtime_id:"runtime-alt",
      locality:"CLOUD",
    }),
  ]);

  assert.equal(result.selected.model_id, "alt-degraded");
  const rejected = Object.fromEntries(result.rejected.map((item) => [item.model_id,item.reason_codes]));
  assert.ok(rejected["model-fast-local"].includes("PROVIDER_DOWN"));
  assert.ok(rejected["cloud-unknown"].includes("PROVIDER_HEALTH_UNKNOWN"));
});

test("hard budget rejects unknown price and over-budget candidates", () => {
  const result = routeModel(request({ budget_usd:0.004, latency_target_ms:null }), [
    candidate({
      model_id:"unknown-cost",
      pricing_usd_per_million:{ input:null, output:null },
    }),
    candidate({
      model_id:"over-budget",
      provider_id:"provider-cloud",
      runtime_id:"runtime-cloud",
      locality:"CLOUD",
      pricing_usd_per_million:{ input:10, output:20 },
    }),
    candidate({
      model_id:"within-budget",
      provider_id:"provider-alt",
      runtime_id:"runtime-alt",
      locality:"CLOUD",
      pricing_usd_per_million:{ input:0.5, output:1 },
    }),
  ]);

  assert.equal(result.selected.model_id, "within-budget");
  const rejected = Object.fromEntries(result.rejected.map((item) => [item.model_id,item.reason_codes]));
  assert.ok(rejected["unknown-cost"].includes("COST_UNKNOWN"));
  assert.ok(rejected["over-budget"].includes("BUDGET_EXCEEDED"));
});

test("latency and provider allow/deny policies are hard filters", () => {
  const result = routeModel(request({
    latency_target_ms:900,
    budget_usd:null,
    user_policy:{
      allowed_providers:["provider-local","provider-alt"],
      denied_providers:["provider-cloud"],
      allow_cloud:true,
    },
  }), [
    candidate({ model_id:"too-slow", p95_latency_ms:1200 }),
    candidate({
      model_id:"denied-cloud",
      provider_id:"provider-cloud",
      runtime_id:"runtime-cloud",
      locality:"CLOUD",
      p95_latency_ms:400,
    }),
    candidate({
      model_id:"allowed-alt",
      provider_id:"provider-alt",
      runtime_id:"runtime-alt",
      locality:"CLOUD",
      p95_latency_ms:700,
    }),
  ]);

  assert.equal(result.selected.model_id, "allowed-alt");
  const rejected = Object.fromEntries(result.rejected.map((item) => [item.model_id,item.reason_codes]));
  assert.ok(rejected["too-slow"].includes("LATENCY_TARGET_EXCEEDED"));
  assert.ok(rejected["denied-cloud"].some((code) => /PROVIDER/.test(code)));
});

test("fallback list is deterministic and disabled when allow_fallback=false", () => {
  const candidates=[
    candidate({ model_id:"model-a", p95_latency_ms:900, pricing_usd_per_million:{input:1,output:1} }),
    candidate({ model_id:"model-b", provider_id:"provider-cloud", runtime_id:"runtime-b", locality:"CLOUD", p95_latency_ms:700, pricing_usd_per_million:{input:2,output:2} }),
    candidate({ model_id:"model-c", provider_id:"provider-alt", runtime_id:"runtime-c", locality:"CLOUD", p95_latency_ms:600, pricing_usd_per_million:{input:3,output:3} }),
  ];
  const enabled=routeModel(request({ budget_usd:null, latency_target_ms:null }), candidates);
  const disabled=routeModel(request({ budget_usd:null, latency_target_ms:null, allow_fallback:false }), candidates);

  assert.deepEqual(enabled.fallbacks.map((x) => x.model_id), ["model-b","model-c"]);
  assert.deepEqual(disabled.fallbacks, []);
});

test("LOCAL_SENSITIVE forcibly becomes LOCAL_ONLY and cannot select or fallback to cloud", () => {
  const result = routeModel(request({
    task_class:"LOCAL_SENSITIVE",
    privacy:"STANDARD",
    user_policy:{ allowed_providers:[], denied_providers:[], allow_cloud:true },
    latency_target_ms:null,
    budget_usd:null,
  }), [
    candidate({
      model_id:"cloud-cheap",
      provider_id:"provider-cloud",
      runtime_id:"runtime-cloud",
      locality:"CLOUD",
      p95_latency_ms:100,
      pricing_usd_per_million:{input:0.01,output:0.01},
      task_classes:["LOCAL_SENSITIVE"],
    }),
    candidate({
      model_id:"local-safe",
      provider_id:"provider-local",
      runtime_id:"runtime-local",
      locality:"LOCAL",
      p95_latency_ms:2000,
      pricing_usd_per_million:{input:5,output:5},
      task_classes:["LOCAL_SENSITIVE"],
    }),
  ]);

  assert.equal(result.request.privacy, "LOCAL_ONLY");
  assert.equal(result.request.user_policy.allow_cloud, false);
  assert.equal(result.selected.model_id, "local-safe");
  assert.ok(result.fallbacks.every((x) => x.locality === "LOCAL"));
  const cloudReject=result.rejected.find((x) => x.model_id === "cloud-cheap");
  assert.ok(cloudReject.reason_codes.includes("LOCALITY_REQUIRED"));
});

test("LOCAL_ONLY without an eligible local candidate fails closed with rejection evidence", () => {
  assert.throws(
    () => routeModel(request({
      task_class:"LOCAL_SENSITIVE",
      latency_target_ms:null,
      budget_usd:null,
    }), [
      candidate({
        model_id:"cloud-only",
        provider_id:"provider-cloud",
        runtime_id:"runtime-cloud",
        locality:"CLOUD",
        task_classes:["LOCAL_SENSITIVE"],
      }),
    ]),
    (error) => {
      assert.ok(error instanceof ModelRouteUnavailableError);
      assert.equal(error.code, "MODEL_ROUTE_UNAVAILABLE");
      assert.ok(error.rejected.some((item) => item.reason_codes.includes("LOCALITY_REQUIRED")));
      return true;
    },
  );
});

test("same normalized facts produce the same route ref regardless of candidate input order", () => {
  const candidates=[
    candidate({ model_id:"model-z", p95_latency_ms:900 }),
    candidate({ model_id:"model-y", provider_id:"provider-alt", runtime_id:"runtime-y", locality:"CLOUD", p95_latency_ms:1000 }),
  ];
  const a=routeModel(request({ budget_usd:null, latency_target_ms:null }), candidates);
  const b=routeModel(request({ budget_usd:null, latency_target_ms:null }), [...candidates].reverse());

  assert.equal(a.model_route_ref, b.model_route_ref);
  assert.deepEqual(a.selected, b.selected);
  assert.deepEqual(a.fallbacks, b.fallbacks);
});

test("REASONING and CODING class support are enforced independently", () => {
  const reasoning=routeModel(request({
    task_class:"REASONING",
    reasoning_depth:"HIGH",
    budget_usd:null,
    latency_target_ms:null,
  }), [
    candidate({ model_id:"reasoner", task_classes:["REASONING"], max_reasoning_depth:"HIGH" }),
    candidate({ model_id:"coder", provider_id:"provider-alt", runtime_id:"runtime-alt", locality:"CLOUD", task_classes:["CODING"] }),
  ]);
  assert.equal(reasoning.selected.model_id, "reasoner");

  const coding=routeModel(request({
    task_class:"CODING",
    reasoning_depth:"MEDIUM",
    budget_usd:null,
    latency_target_ms:null,
  }), [
    candidate({ model_id:"reasoner", task_classes:["REASONING"] }),
    candidate({ model_id:"coder", provider_id:"provider-alt", runtime_id:"runtime-alt", locality:"CLOUD", task_classes:["CODING"] }),
  ]);
  assert.equal(coding.selected.model_id, "coder");
});


test("semantic set ordering does not change route ref", () => {
  const candidatesA=[
    candidate({
      task_classes:["FAST","CODING","REASONING"],
      modalities:["text","image"],
    }),
  ];
  const candidatesB=[
    candidate({
      task_classes:["REASONING","FAST","CODING"],
      modalities:["image","text"],
    }),
  ];
  const reqA=request({
    modalities:["text"],
    budget_usd:null,
    latency_target_ms:null,
    user_policy:{
      allowed_providers:["provider-alt","provider-local"],
      denied_providers:["provider-cloud","provider-x"],
      allow_cloud:true,
    },
  });
  const reqB=request({
    modalities:["text"],
    budget_usd:null,
    latency_target_ms:null,
    user_policy:{
      allowed_providers:["provider-local","provider-alt"],
      denied_providers:["provider-x","provider-cloud"],
      allow_cloud:true,
    },
  });

  assert.equal(routeModel(reqA,candidatesA).model_route_ref, routeModel(reqB,candidatesB).model_route_ref);
});

test("equal model IDs across providers use provider/runtime deterministic tie-breaks", () => {
  const a=candidate({
    model_id:"shared-model",
    provider_id:"provider-local",
    runtime_id:"runtime-z",
    locality:"LOCAL",
    p95_latency_ms:800,
    pricing_usd_per_million:{input:1,output:2},
  });
  const b=candidate({
    model_id:"shared-model",
    provider_id:"provider-cloud",
    runtime_id:"runtime-a",
    locality:"CLOUD",
    p95_latency_ms:800,
    pricing_usd_per_million:{input:1,output:2},
  });
  const req=request({budget_usd:null,latency_target_ms:null});

  const first=routeModel(req,[a,b]);
  const second=routeModel(req,[b,a]);

  assert.equal(first.model_route_ref, second.model_route_ref);
  assert.deepEqual(first.selected, second.selected);
});
