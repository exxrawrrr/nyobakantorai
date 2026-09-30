const rank = Object.freeze({ CONNECTED: 4, PARTIAL: 3, ERROR: 2, NOT_CONNECTED: 1 });

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

export function createCapabilityRouter({ catalog, states, autonomyModes, defaultAutonomy = "GUARDED" }) {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error("Capability catalog is required.");
  const allowedStates = new Set(states || []);
  const allowedModes = new Set(autonomyModes || []);
  if (!allowedStates.has("CONNECTED") || !allowedStates.has("NOT_CONNECTED")) throw new Error("Capability states must include CONNECTED and NOT_CONNECTED.");
  if (!allowedModes.has(defaultAutonomy)) throw new Error("Default autonomy mode is invalid.");

  const byId = new Map();
  for (const capability of catalog) {
    if (!capability?.id || byId.has(capability.id)) throw new Error("Capability IDs must be unique and non-empty.");
    byId.set(capability.id, Object.freeze({ ...capability }));
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || !nonEmpty(snapshot.provider_id)) throw new Error("Provider snapshot requires provider_id.");
    if (!nonEmpty(snapshot.checked_at) || Number.isNaN(Date.parse(snapshot.checked_at))) throw new Error("Provider snapshot requires a valid checked_at timestamp.");
    if (!snapshot.capabilities || typeof snapshot.capabilities !== "object" || Array.isArray(snapshot.capabilities)) throw new Error("Provider snapshot requires a capabilities object.");

    const normalized = {};
    for (const [id, raw] of Object.entries(snapshot.capabilities)) {
      if (!byId.has(id)) throw new Error(`Provider snapshot references unknown capability: ${id}`);
      const value = typeof raw === "string" ? { state: raw } : raw;
      const state = value?.state || "NOT_CONNECTED";
      if (!allowedStates.has(state)) throw new Error(`Invalid capability state for ${id}: ${state}`);
      if (state === "CONNECTED" && !nonEmpty(value?.evidence_ref)) throw new Error(`CONNECTED capability requires evidence_ref: ${id}`);
      normalized[id] = Object.freeze({
        state,
        evidence_ref: nonEmpty(value?.evidence_ref) ? value.evidence_ref.trim() : null,
        detail: nonEmpty(value?.detail) ? value.detail.trim().slice(0, 500) : null,
      });
    }
    return Object.freeze({
      provider_id: snapshot.provider_id.trim(),
      checked_at: new Date(snapshot.checked_at).toISOString(),
      capabilities: Object.freeze(normalized),
    });
  }

  function resolve(capabilityId, snapshots = []) {
    if (!byId.has(capabilityId)) throw new Error(`Unknown capability: ${capabilityId}`);
    const candidates = snapshots.map(validateSnapshot)
      .filter((snapshot) => snapshot.capabilities[capabilityId])
      .map((snapshot) => ({ provider_id: snapshot.provider_id, checked_at: snapshot.checked_at, ...snapshot.capabilities[capabilityId] }))
      .sort((a, b) => (rank[b.state] || 0) - (rank[a.state] || 0) || Date.parse(b.checked_at) - Date.parse(a.checked_at));

    if (!candidates.length) return Object.freeze({ capability_id: capabilityId, state: "NOT_CONNECTED", provider_id: null, evidence_ref: null, checked_at: null });
    return Object.freeze({ capability_id: capabilityId, ...candidates[0] });
  }

  function authorizeForEmployee({ employee, capabilityId, snapshots = [], autonomy = defaultAutonomy, approvalStatus = "NOT_REQUIRED", delegatedCapabilities = [] }) {
    const capability = byId.get(capabilityId);
    if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
    const employeeId = nonEmpty(employee?.id) ? employee.id.trim() : null;
    const scope = employee?.operational_contract?.capability_scope;
    if (!employeeId || !Array.isArray(scope)) {
      return Object.freeze({
        allowed: false,
        decision: "BLOCKED",
        reason: "WORKER_CONTRACT_INVALID",
        employee_id: employeeId,
        capability,
        connection: null,
        autonomy,
      });
    }
    if (!scope.includes(capabilityId)) {
      return Object.freeze({
        allowed: false,
        decision: "BLOCKED",
        reason: "WORKER_CAPABILITY_OUT_OF_SCOPE",
        employee_id: employeeId,
        capability,
        connection: null,
        autonomy,
      });
    }
    const decision = authorize({ capabilityId, snapshots, autonomy, approvalStatus, delegatedCapabilities });
    return Object.freeze({ ...decision, employee_id: employeeId });
  }

  function authorize({ capabilityId, snapshots = [], autonomy = defaultAutonomy, approvalStatus = "NOT_REQUIRED", delegatedCapabilities = [] }) {
    const capability = byId.get(capabilityId);
    if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
    if (!allowedModes.has(autonomy)) throw new Error(`Unknown autonomy mode: ${autonomy}`);

    const connection = resolve(capabilityId, snapshots);
    if (connection.state !== "CONNECTED") {
      return Object.freeze({ allowed: false, decision: "BLOCKED", reason: "CAPABILITY_NOT_CONNECTED", capability, connection, autonomy });
    }

    const highImpact = capability.requires_human_approval === true || capability.risk_class !== "READ_ONLY";
    if (!highImpact) {
      return Object.freeze({ allowed: true, decision: "ALLOWED_READ_ONLY", reason: "CONNECTED_READ_ONLY", capability, connection, autonomy });
    }

    if (autonomy === "OBSERVE") {
      return Object.freeze({ allowed: false, decision: "BLOCKED", reason: "OBSERVE_MODE_NO_WRITES", capability, connection, autonomy });
    }

    if (autonomy === "DELEGATED") {
      if (!delegatedCapabilities.includes(capabilityId)) {
        return Object.freeze({ allowed: false, decision: "BLOCKED", reason: "OUTSIDE_DELEGATED_SCOPE", capability, connection, autonomy });
      }
      return Object.freeze({ allowed: true, decision: "AUTHORIZED_DELEGATED", reason: "CONNECTED_AND_IN_POLICY_ENVELOPE", capability, connection, autonomy });
    }

    if (approvalStatus !== "APPROVED") {
      return Object.freeze({ allowed: false, decision: "WAITING_FOR_APPROVAL", reason: "OWNER_APPROVAL_REQUIRED", capability, connection, autonomy });
    }

    return Object.freeze({ allowed: true, decision: "AUTHORIZED_GUARDED", reason: "CONNECTED_AND_OWNER_APPROVED", capability, connection, autonomy });
  }

  return Object.freeze({
    catalog: Object.freeze([...byId.values()]),
    validateSnapshot,
    resolve,
    authorize,
    authorizeForEmployee,
  });
}
