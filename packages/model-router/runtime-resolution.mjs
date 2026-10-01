const ROUTE_REF = /^model-route:sha256:[a-f0-9]{64}$/;

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values, max = 1000) {
  return Object.freeze([...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value, max))
    .filter(Boolean))]);
}

export function bindModelRouteToRuntime(routeDecision = {}, {
  adapter,
  policy,
  required_capabilities = [],
  capability_route_refs = [],
  timeout_ms = null,
  unknowns = [],
  residual_risks = [],
} = {}) {
  assert(routeDecision && typeof routeDecision === "object" && !Array.isArray(routeDecision), "Model route decision is required.");
  assert(ROUTE_REF.test(clean(routeDecision.model_route_ref, 1000)), "Model route decision has invalid model_route_ref.");
  assert(routeDecision.selected && typeof routeDecision.selected === "object", "Model route decision selected candidate is required.");
  assert(adapter && typeof adapter === "object", "Model route runtime adapter is required.");
  assert(policy && typeof policy === "object", "Model route runtime policy is required.");

  const selectedProvider = clean(routeDecision.selected.provider_id, 120).toLowerCase();
  const selectedRuntime = clean(routeDecision.selected.runtime_id, 512);
  const adapterProvider = clean(adapter.runtime?.provider, 120).toLowerCase();
  const adapterRuntime = clean(adapter.runtime?.runtime_ref, 512);

  assert(selectedProvider, "Model route selected provider_id is required.");
  assert(selectedRuntime, "Model route selected runtime_id is required.");
  assert(adapterProvider === selectedProvider, `Runtime adapter provider ${adapterProvider || "(empty)"} does not match selected provider ${selectedProvider}.`);
  assert(adapterRuntime === selectedRuntime, `Runtime adapter runtime ${adapterRuntime || "(empty)"} does not match selected runtime ${selectedRuntime}.`);

  const capabilities = unique(required_capabilities, 80);
  assert(capabilities.length > 0, "Model route runtime resolution requires at least one capability.");

  const timeout = timeout_ms == null ? null : Number(timeout_ms);
  if (timeout != null) {
    assert(Number.isInteger(timeout) && timeout >= 1 && timeout <= 45_000, "Model route runtime timeout_ms must be null or 1..45000.");
  }

  return Object.freeze({
    adapter,
    policy,
    required_capabilities:capabilities,
    model_route_ref:routeDecision.model_route_ref,
    capability_route_refs:unique(capability_route_refs),
    ...(timeout == null ? {} : { timeout_ms:timeout }),
    unknowns:unique(unknowns),
    residual_risks:unique(residual_risks),
  });
}
