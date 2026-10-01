import { createHash } from "node:crypto";

export const MODEL_ROUTER_API = 1;
export const MODEL_TASK_CLASSES = Object.freeze([
  "FAST",
  "REASONING",
  "VISION",
  "CODING",
  "LOCAL_SENSITIVE",
]);

export const MODEL_MODALITIES = Object.freeze(["text","image","audio","video"]);
export const MODEL_REASONING_DEPTHS = Object.freeze(["LOW","MEDIUM","HIGH"]);
export const MODEL_LOCALITIES = Object.freeze(["LOCAL","CLOUD"]);
export const PROVIDER_HEALTH_STATES = Object.freeze(["HEALTHY","DEGRADED","DOWN","UNKNOWN"]);

const CLASS_SET = new Set(MODEL_TASK_CLASSES);
const MODALITY_SET = new Set(MODEL_MODALITIES);
const DEPTH_SET = new Set(MODEL_REASONING_DEPTHS);
const LOCALITY_SET = new Set(MODEL_LOCALITIES);
const HEALTH_SET = new Set(PROVIDER_HEALTH_STATES);
const DEPTH_RANK = Object.freeze({ LOW:1, MEDIUM:2, HIGH:3 });
const HEALTH_RANK = Object.freeze({ HEALTHY:0, DEGRADED:1 });

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values, normalize = (x) => x) {
  return Object.freeze(
    [...new Set((Array.isArray(values) ? values : []).map(normalize).filter(Boolean))]
      .sort((a,b) => String(a).localeCompare(String(b))),
  );
}

function nullableFinite(value, name, { min = 0 } = {}) {
  if (value == null) return null;
  const n = Number(value);
  assert(Number.isFinite(n) && n >= min, `${name} must be null or a finite number >= ${min}.`);
  return n;
}

function normalizeProviderPolicy(value = {}) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Model route user_policy must be an object.");
  return Object.freeze({
    allowed_providers:unique(value.allowed_providers, (item) => clean(item, 120).toLowerCase()),
    denied_providers:unique(value.denied_providers, (item) => clean(item, 120).toLowerCase()),
    allow_cloud:value.allow_cloud !== false,
  });
}

function normalizeHealth(value = {}) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Model route provider_health must be an object.");
  const out = {};
  for (const [providerRaw, healthRaw] of Object.entries(value)) {
    const provider = clean(providerRaw, 120).toLowerCase();
    const health = clean(healthRaw, 40).toUpperCase();
    assert(provider, "Model route provider_health provider id cannot be empty.");
    assert(HEALTH_SET.has(health), `Model route provider health is invalid for ${provider}.`);
    out[provider] = health;
  }
  return Object.freeze(out);
}

export function normalizeModelRouteRequest(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Model route request must be an object.");
  assert(input.schema === MODEL_ROUTER_API, "Model route request schema must be 1.");

  const taskClass = clean(input.task_class, 40).toUpperCase();
  const reasoningDepth = clean(input.reasoning_depth || "LOW", 40).toUpperCase();
  let privacy = clean(input.privacy || "STANDARD", 40).toUpperCase();
  assert(CLASS_SET.has(taskClass), "Model route task_class is invalid.");
  assert(DEPTH_SET.has(reasoningDepth), "Model route reasoning_depth is invalid.");
  assert(["STANDARD","LOCAL_ONLY"].includes(privacy), "Model route privacy is invalid.");

  const modalities = unique(input.modalities?.length ? input.modalities : ["text"], (item) => clean(item, 40).toLowerCase());
  assert(modalities.length > 0, "Model route modalities must be non-empty.");
  for (const modality of modalities) assert(MODALITY_SET.has(modality), `Model route modality is invalid: ${modality}`);

  const minContext = Number(input.min_context_tokens ?? 1);
  const inputTokens = Number(input.estimated_input_tokens ?? 0);
  const outputTokens = Number(input.estimated_output_tokens ?? 0);
  assert(Number.isInteger(minContext) && minContext >= 1, "Model route min_context_tokens must be an integer >= 1.");
  assert(Number.isInteger(inputTokens) && inputTokens >= 0, "Model route estimated_input_tokens must be an integer >= 0.");
  assert(Number.isInteger(outputTokens) && outputTokens >= 0, "Model route estimated_output_tokens must be an integer >= 0.");

  const latency = input.latency_target_ms == null ? null : Number(input.latency_target_ms);
  if (latency != null) assert(Number.isInteger(latency) && latency >= 1, "Model route latency_target_ms must be null or an integer >= 1.");
  const budget = nullableFinite(input.budget_usd, "Model route budget_usd");

  let policy = normalizeProviderPolicy(input.user_policy || {});
  if (taskClass === "LOCAL_SENSITIVE") privacy = "LOCAL_ONLY";
  if (privacy === "LOCAL_ONLY") {
    policy = Object.freeze({ ...policy, allow_cloud:false });
  }

  return Object.freeze({
    schema:MODEL_ROUTER_API,
    task_class:taskClass,
    modalities,
    reasoning_depth:reasoningDepth,
    min_context_tokens:minContext,
    latency_target_ms:latency,
    estimated_input_tokens:inputTokens,
    estimated_output_tokens:outputTokens,
    budget_usd:budget,
    privacy,
    allow_fallback:input.allow_fallback !== false,
    user_policy:policy,
    provider_health:normalizeHealth(input.provider_health || {}),
  });
}

export function normalizeModelCandidate(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Model candidate must be an object.");
  assert(input.schema === MODEL_ROUTER_API, "Model candidate schema must be 1.");

  const modelId = clean(input.model_id, 160);
  const providerId = clean(input.provider_id, 120).toLowerCase();
  const runtimeId = clean(input.runtime_id, 160);
  const locality = clean(input.locality, 40).toUpperCase();
  const maxReasoning = clean(input.max_reasoning_depth || "LOW", 40).toUpperCase();
  const contextTokens = Number(input.context_tokens);
  const latency = Number(input.p95_latency_ms);

  assert(modelId, "Model candidate model_id is required.");
  assert(providerId, "Model candidate provider_id is required.");
  assert(runtimeId, "Model candidate runtime_id is required.");
  assert(LOCALITY_SET.has(locality), "Model candidate locality is invalid.");
  assert(DEPTH_SET.has(maxReasoning), "Model candidate max_reasoning_depth/reasoning is invalid.");
  assert(Number.isInteger(contextTokens) && contextTokens >= 1, "Model candidate context_tokens must be an integer >= 1.");
  assert(Number.isInteger(latency) && latency >= 1, "Model candidate p95_latency_ms must be an integer >= 1.");

  const classes = unique(input.task_classes, (item) => clean(item, 40).toUpperCase());
  assert(classes.length > 0, "Model candidate task_classes must be non-empty.");
  for (const cls of classes) assert(CLASS_SET.has(cls), `Model candidate task class is invalid: ${cls}`);

  const modalities = unique(input.modalities, (item) => clean(item, 40).toLowerCase());
  assert(modalities.length > 0, "Model candidate modalities must be non-empty.");
  for (const modality of modalities) assert(MODALITY_SET.has(modality), `Model candidate modality is invalid: ${modality}`);

  const pricing = input.pricing_usd_per_million || {};
  const inputPrice = nullableFinite(pricing.input, "Model candidate input price");
  const outputPrice = nullableFinite(pricing.output, "Model candidate output price");

  return Object.freeze({
    schema:MODEL_ROUTER_API,
    model_id:modelId,
    provider_id:providerId,
    runtime_id:runtimeId,
    task_classes:classes,
    modalities,
    max_reasoning_depth:maxReasoning,
    locality,
    context_tokens:contextTokens,
    p95_latency_ms:latency,
    pricing_usd_per_million:Object.freeze({ input:inputPrice, output:outputPrice }),
    enabled:input.enabled !== false,
  });
}

function estimateCost(request, candidate) {
  const pricing = candidate.pricing_usd_per_million;
  const inputUnknown = request.estimated_input_tokens > 0 && pricing.input == null;
  const outputUnknown = request.estimated_output_tokens > 0 && pricing.output == null;
  if (inputUnknown || outputUnknown) return null;
  return (
    request.estimated_input_tokens * (pricing.input ?? 0)
    + request.estimated_output_tokens * (pricing.output ?? 0)
  ) / 1_000_000;
}

function rejectionCodes(request, candidate) {
  const codes = [];
  const policy = request.user_policy;
  const health = request.provider_health[candidate.provider_id] || "UNKNOWN";

  if (!candidate.enabled) codes.push("CANDIDATE_DISABLED");
  if (!candidate.task_classes.includes(request.task_class)) codes.push("TASK_CLASS_UNSUPPORTED");
  if (request.modalities.some((item) => !candidate.modalities.includes(item))) codes.push("MODALITY_UNSUPPORTED");
  if (DEPTH_RANK[candidate.max_reasoning_depth] < DEPTH_RANK[request.reasoning_depth]) codes.push("REASONING_INSUFFICIENT");
  if (candidate.context_tokens < request.min_context_tokens) codes.push("CONTEXT_TOO_SMALL");

  if (policy.allowed_providers.length && !policy.allowed_providers.includes(candidate.provider_id)) {
    codes.push("PROVIDER_NOT_ALLOWED");
  }
  if (policy.denied_providers.includes(candidate.provider_id)) codes.push("PROVIDER_DENIED");

  if (request.privacy === "LOCAL_ONLY" && candidate.locality !== "LOCAL") {
    codes.push("LOCALITY_REQUIRED");
  } else if (!policy.allow_cloud && candidate.locality === "CLOUD") {
    codes.push("CLOUD_FORBIDDEN");
  }

  if (health === "DOWN") codes.push("PROVIDER_DOWN");
  if (health === "UNKNOWN") codes.push("PROVIDER_HEALTH_UNKNOWN");

  if (request.latency_target_ms != null && candidate.p95_latency_ms > request.latency_target_ms) {
    codes.push("LATENCY_TARGET_EXCEEDED");
  }

  const estimatedCost = estimateCost(request, candidate);
  if (request.budget_usd != null) {
    if (estimatedCost == null) codes.push("COST_UNKNOWN");
    else if (estimatedCost > request.budget_usd) codes.push("BUDGET_EXCEEDED");
  }

  return Object.freeze({ reason_codes:Object.freeze(codes), provider_health:health, estimated_cost_usd:estimatedCost });
}

function candidateDecision(candidate, request, extra = {}) {
  const estimated = extra.estimated_cost_usd ?? estimateCost(request, candidate);
  return Object.freeze({
    model_id:candidate.model_id,
    provider_id:candidate.provider_id,
    runtime_id:candidate.runtime_id,
    locality:candidate.locality,
    provider_health:extra.provider_health || request.provider_health[candidate.provider_id] || "UNKNOWN",
    estimated_cost_usd:estimated,
    p95_latency_ms:candidate.p95_latency_ms,
    context_tokens:candidate.context_tokens,
    max_reasoning_depth:candidate.max_reasoning_depth,
    modalities:candidate.modalities,
    task_classes:candidate.task_classes,
  });
}

function compareEligible(a, b) {
  const ah = HEALTH_RANK[a.provider_health] ?? 99;
  const bh = HEALTH_RANK[b.provider_health] ?? 99;
  if (ah !== bh) return ah - bh;

  const ac = a.estimated_cost_usd == null ? Number.POSITIVE_INFINITY : a.estimated_cost_usd;
  const bc = b.estimated_cost_usd == null ? Number.POSITIVE_INFINITY : b.estimated_cost_usd;
  if (ac !== bc) return ac - bc;

  if (a.p95_latency_ms !== b.p95_latency_ms) return a.p95_latency_ms - b.p95_latency_ms;
  return a.model_id.localeCompare(b.model_id)
    || a.provider_id.localeCompare(b.provider_id)
    || a.runtime_id.localeCompare(b.runtime_id);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function routeRef(payload) {
  const digest = createHash("sha256").update(canonicalJson(payload)).digest("hex");
  return `model-route:sha256:${digest}`;
}

export class ModelRouteUnavailableError extends Error {
  constructor({ request, rejected }) {
    super("No eligible model/runtime candidate satisfies the route request.");
    this.name = "ModelRouteUnavailableError";
    this.code = "MODEL_ROUTE_UNAVAILABLE";
    this.request = request;
    this.rejected = rejected;
  }
}

export function routeModel(requestInput, candidateInputs = []) {
  const request = normalizeModelRouteRequest(requestInput);
  assert(Array.isArray(candidateInputs) && candidateInputs.length > 0, "Model Router requires at least one candidate.");

  const candidates = candidateInputs.map(normalizeModelCandidate);
  const ids = candidates.map((item) => `${item.provider_id}/${item.model_id}/${item.runtime_id}`);
  assert(new Set(ids).size === ids.length, "Model Router candidate identities must be unique.");

  const eligible = [];
  const rejected = [];

  for (const candidate of candidates) {
    const evaluation = rejectionCodes(request, candidate);
    if (evaluation.reason_codes.length) {
      rejected.push(Object.freeze({
        model_id:candidate.model_id,
        provider_id:candidate.provider_id,
        runtime_id:candidate.runtime_id,
        locality:candidate.locality,
        provider_health:evaluation.provider_health,
        estimated_cost_usd:evaluation.estimated_cost_usd,
        reason_codes:evaluation.reason_codes,
      }));
      continue;
    }
    eligible.push(candidateDecision(candidate, request, evaluation));
  }

  eligible.sort(compareEligible);
  rejected.sort((a,b) =>
    a.model_id.localeCompare(b.model_id)
    || a.provider_id.localeCompare(b.provider_id)
    || a.runtime_id.localeCompare(b.runtime_id)
  );

  if (!eligible.length) {
    throw new ModelRouteUnavailableError({
      request,
      rejected:Object.freeze(rejected),
    });
  }

  const selected = eligible[0];
  const fallbacks = request.allow_fallback ? eligible.slice(1) : [];
  const decisionPayload = Object.freeze({
    schema:MODEL_ROUTER_API,
    request,
    selected,
    fallbacks:Object.freeze(fallbacks),
    rejected:Object.freeze(rejected),
  });

  return Object.freeze({
    ...decisionPayload,
    model_route_ref:routeRef(decisionPayload),
  });
}
