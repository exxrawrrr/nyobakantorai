import { validateCapabilityRouteDecision } from "./index.mjs";

const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values, max = 1000) {
  return Object.freeze(
    [...new Set((Array.isArray(values) ? values : []).map((value) => clean(value, max)).filter(Boolean))]
      .sort((a,b) => a.localeCompare(b)),
  );
}

export function bindCapabilityRoutesToRuntime(routeDecisions = [], {
  adapter,
  policy,
  required_capabilities = [],
  model_route_ref = null,
  timeout_ms = null,
  unknowns = [],
  residual_risks = [],
} = {}) {
  assert(Array.isArray(routeDecisions) && routeDecisions.length > 0, "Capability runtime binding requires at least one allowed route.");
  assert(adapter && typeof adapter === "object", "Capability runtime binding requires adapter.");
  assert(policy && typeof policy === "object", "Capability runtime binding requires policy.");

  const refs = [];
  for (const route of routeDecisions) {
    assert(route?.allowed === true, "Capability runtime binding requires an allowed route.");
    validateCapabilityRouteDecision(route);
    assert(route.connection?.state === "CONNECTED", "Capability runtime binding requires CONNECTED route evidence.");
    refs.push(route.capability_route_ref);
  }

  const runtimeCapabilities = unique(required_capabilities, 80);
  assert(runtimeCapabilities.length > 0, "Capability runtime binding requires at least one runtime capability.");

  const timeout = timeout_ms == null ? null : Number(timeout_ms);
  if (timeout != null) {
    assert(Number.isInteger(timeout) && timeout >= 1 && timeout <= 45_000, "Capability runtime timeout_ms must be null or 1..45000.");
  }

  return Object.freeze({
    adapter,
    policy,
    required_capabilities:runtimeCapabilities,
    model_route_ref:model_route_ref == null ? null : clean(model_route_ref, 1000) || null,
    capability_route_refs:unique(refs),
    ...(timeout == null ? {} : { timeout_ms:timeout }),
    unknowns:unique(unknowns),
    residual_risks:unique(residual_risks),
  });
}
