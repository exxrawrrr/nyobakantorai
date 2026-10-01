import { createHash } from "node:crypto";

const rank = Object.freeze({ CONNECTED: 4, PARTIAL: 3, ERROR: 2, NOT_CONNECTED: 1 });

export const CAPABILITY_ACCESS_MODES = Object.freeze(["READ","WRITE"]);

const ACCESS_MODE_SET = new Set(CAPABILITY_ACCESS_MODES);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);

function sortedUnique(values, normalize = (value) => value) {
  return Object.freeze(
    [...new Set((Array.isArray(values) ? values : []).map(normalize).filter(Boolean))]
      .sort((a,b) => String(a).localeCompare(String(b))),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function routeRef(payload) {
  return `capability-route:sha256:${createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex")}`;
}

function normalizeTarget(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Capability action target must be an object.");
  const resourceType = clean(input.resource_type, 120).toLowerCase();
  const resourceId = clean(input.resource_id, 240);
  assert(resourceType, "Capability action target resource_type is required.");
  assert(resourceId, "Capability action target resource_id is required.");
  return Object.freeze({ resource_type:resourceType, resource_id:resourceId });
}

function normalizeGrant(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Capability grant must be an object.");
  assert(input.schema === 1, "Capability grant schema must be 1.");
  const grantId = clean(input.grant_id, 160);
  const employeeId = clean(input.employee_id, 40).toLowerCase();
  const capabilityId = clean(input.capability_id, 160);
  const issuedAt = clean(input.issued_at, 80);
  const expiresAt = input.expires_at == null ? null : clean(input.expires_at, 80);
  const evidenceRef = clean(input.evidence_ref, 1000);
  assert(grantId, "Capability grant grant_id is required.");
  assert(employeeId, "Capability grant employee_id is required.");
  assert(capabilityId, "Capability grant capability_id is required.");
  assert(nonEmpty(issuedAt) && !Number.isNaN(Date.parse(issuedAt)), "Capability grant issued_at must be a valid timestamp.");
  if (expiresAt != null) {
    assert(!Number.isNaN(Date.parse(expiresAt)), "Capability grant expires_at must be null or a valid timestamp.");
    assert(Date.parse(expiresAt) >= Date.parse(issuedAt), "Capability grant expires_at cannot precede issued_at.");
  }
  assert(evidenceRef, "Capability grant evidence_ref is required.");

  const accessModes = sortedUnique(input.access_modes, (value) => clean(value, 40).toUpperCase());
  assert(accessModes.length > 0, "Capability grant access_modes must be non-empty.");
  for (const mode of accessModes) assert(ACCESS_MODE_SET.has(mode), `Capability grant access mode is invalid: ${mode}`);

  const actions = sortedUnique(input.actions, (value) => clean(value, 160).toLowerCase());
  assert(actions.length > 0, "Capability grant actions must be non-empty.");

  const targets = Object.freeze((Array.isArray(input.targets) ? input.targets : []).map(normalizeTarget)
    .sort((a,b) => a.resource_type.localeCompare(b.resource_type) || a.resource_id.localeCompare(b.resource_id)));
  assert(targets.length > 0, "Capability grant targets must be non-empty exact resources.");
  const targetKeys = targets.map((target) => `${target.resource_type}\0${target.resource_id}`);
  assert(new Set(targetKeys).size === targetKeys.length, "Capability grant targets must be unique.");

  return Object.freeze({
    schema:1,
    grant_id:grantId,
    employee_id:employeeId,
    capability_id:capabilityId,
    access_modes:accessModes,
    actions,
    targets,
    issued_at:new Date(issuedAt).toISOString(),
    expires_at:expiresAt == null ? null : new Date(expiresAt).toISOString(),
    evidence_ref:evidenceRef,
  });
}

function routePayload(input) {
  return Object.freeze({
    schema:1,
    employee_id:input.employee_id,
    capability:Object.freeze(structuredClone(input.capability)),
    action:input.action,
    access_mode:input.access_mode,
    target:input.target,
    connection:Object.freeze(structuredClone(input.connection)),
    grant:Object.freeze(structuredClone(input.grant)),
    autonomy:input.autonomy,
    approval_status:input.approval_status,
    approval_ref:input.approval_ref,
    required_evidence:input.required_evidence,
    decision:input.decision,
    reason:input.reason,
    allowed:input.allowed,
  });
}

export function validateCapabilityRouteDecision(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Capability route decision must be an object.");
  const ref = clean(input.capability_route_ref, 1000);
  assert(/^capability-route:sha256:[a-f0-9]{64}$/.test(ref), "Capability route decision has invalid capability_route_ref.");
  assert(input.capability && typeof input.capability === "object", "Capability route decision capability is required.");
  assert(input.connection && typeof input.connection === "object", "Capability route decision connection is required.");
  assert(input.grant && typeof input.grant === "object", "Capability route decision grant is required.");
  assert(input.target && typeof input.target === "object", "Capability route decision target is required.");
  assert(Array.isArray(input.required_evidence), "Capability route decision required_evidence must be an array.");
  const expected = routeRef(routePayload(input));
  assert(expected === ref, "Capability route ref does not match decision payload content.");
  return true;
}

export function createCapabilityRouter({ catalog, states, autonomyModes, defaultAutonomy = "GUARDED", grants = [] }) {
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

  const normalizedGrants = Object.freeze((Array.isArray(grants) ? grants : []).map(normalizeGrant));
  const grantIds = normalizedGrants.map((grant) => grant.grant_id);
  if (new Set(grantIds).size !== grantIds.length) throw new Error("Capability grant IDs must be unique.");
  for (const grant of normalizedGrants) {
    if (!byId.has(grant.capability_id)) throw new Error(`Capability grant references unknown capability: ${grant.capability_id}`);
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
      .sort((a, b) => (rank[b.state] || 0) - (rank[a.state] || 0) || Date.parse(b.checked_at) - Date.parse(a.checked_at) || a.provider_id.localeCompare(b.provider_id));

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

  function authorizeActionForEmployee({
    employee,
    capabilityId,
    action,
    accessMode,
    target,
    snapshots = [],
    autonomy = defaultAutonomy,
    approvalStatus = "NOT_REQUIRED",
    approvalRef = null,
    delegatedCapabilities = [],
    now = new Date().toISOString(),
  }) {
    const capability = byId.get(capabilityId);
    if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
    if (!allowedModes.has(autonomy)) throw new Error(`Unknown autonomy mode: ${autonomy}`);

    const employeeId = nonEmpty(employee?.id) ? employee.id.trim().toLowerCase() : null;
    const scope = employee?.operational_contract?.capability_scope;
    if (!employeeId || !Array.isArray(scope)) {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"WORKER_CONTRACT_INVALID",
        employee_id:employeeId, capability, connection:null, grant:null, autonomy,
      });
    }
    if (!scope.includes(capabilityId)) {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"WORKER_CAPABILITY_OUT_OF_SCOPE",
        employee_id:employeeId, capability, connection:null, grant:null, autonomy,
      });
    }

    const normalizedAction = clean(action, 160).toLowerCase();
    const normalizedAccessMode = clean(accessMode, 40).toUpperCase();
    const normalizedTarget = normalizeTarget(target);
    assert(normalizedAction, "Capability action is required.");
    assert(ACCESS_MODE_SET.has(normalizedAccessMode), "Capability action accessMode must be READ or WRITE.");
    assert(nonEmpty(now) && !Number.isNaN(Date.parse(now)), "Capability action now must be a valid timestamp.");

    const actionGrants = normalizedGrants.filter((grant) =>
      grant.employee_id === employeeId
      && grant.capability_id === capabilityId
      && grant.access_modes.includes(normalizedAccessMode)
      && grant.actions.includes(normalizedAction)
    );

    if (!actionGrants.length) {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"RESOURCE_GRANT_MISSING",
        employee_id:employeeId, capability, connection:null, grant:null,
        action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
      });
    }

    const candidateGrants = actionGrants.filter((grant) =>
      grant.targets.some((item) =>
        item.resource_type === normalizedTarget.resource_type
        && item.resource_id === normalizedTarget.resource_id
      )
    );

    if (!candidateGrants.length) {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"TARGET_RESOURCE_OUT_OF_SCOPE",
        employee_id:employeeId, capability, connection:null, grant:null,
        action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
      });
    }

    const grant = [...candidateGrants].sort((a,b) => a.grant_id.localeCompare(b.grant_id))[0];
    const nowMs = Date.parse(now);
    if (Date.parse(grant.issued_at) > nowMs) {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"RESOURCE_GRANT_NOT_YET_VALID",
        employee_id:employeeId, capability, connection:null, grant,
        action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
      });
    }
    if (grant.expires_at != null && Date.parse(grant.expires_at) <= nowMs) {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"RESOURCE_GRANT_EXPIRED",
        employee_id:employeeId, capability, connection:null, grant,
        action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
      });
    }

    const connection = resolve(capabilityId, snapshots);
    if (connection.state !== "CONNECTED") {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"CAPABILITY_NOT_CONNECTED",
        employee_id:employeeId, capability, connection, grant,
        action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
      });
    }

    if (capability.risk_class === "READ_ONLY" && normalizedAccessMode === "WRITE") {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"ACCESS_MODE_INCOMPATIBLE_WITH_CAPABILITY",
        employee_id:employeeId, capability, connection, grant,
        action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
      });
    }

    const highImpact = capability.requires_human_approval === true || capability.risk_class !== "READ_ONLY" || normalizedAccessMode === "WRITE";
    const approvalStatusNormalized = clean(approvalStatus, 40).toUpperCase();
    const approvalRefNormalized = approvalRef == null ? null : clean(approvalRef, 1000) || null;

    if (highImpact && autonomy === "OBSERVE") {
      return Object.freeze({
        allowed:false, decision:"BLOCKED", reason:"OBSERVE_MODE_NO_WRITES",
        employee_id:employeeId, capability, connection, grant,
        action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
      });
    }

    let decision = "AUTHORIZED_READ";
    let reason = "CONNECTED_GRANTED_READ";
    if (highImpact && autonomy === "DELEGATED") {
      if (!delegatedCapabilities.includes(capabilityId)) {
        return Object.freeze({
          allowed:false, decision:"BLOCKED", reason:"OUTSIDE_DELEGATED_SCOPE",
          employee_id:employeeId, capability, connection, grant,
          action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
        });
      }
      decision = normalizedAccessMode === "WRITE" ? "AUTHORIZED_DELEGATED_WRITE" : "AUTHORIZED_DELEGATED";
      reason = "CONNECTED_GRANTED_AND_IN_POLICY_ENVELOPE";
    } else if (highImpact) {
      if (approvalStatusNormalized !== "APPROVED") {
        return Object.freeze({
          allowed:false, decision:"WAITING_FOR_APPROVAL", reason:"OWNER_APPROVAL_REQUIRED",
          employee_id:employeeId, capability, connection, grant,
          action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
        });
      }
      if (!approvalRefNormalized) {
        return Object.freeze({
          allowed:false, decision:"BLOCKED", reason:"APPROVAL_EVIDENCE_REQUIRED",
          employee_id:employeeId, capability, connection, grant,
          action:normalizedAction, access_mode:normalizedAccessMode, target:normalizedTarget, autonomy,
        });
      }
      decision = normalizedAccessMode === "WRITE" ? "AUTHORIZED_GUARDED_WRITE" : "AUTHORIZED_GUARDED";
      reason = "CONNECTED_GRANTED_AND_OWNER_APPROVED";
    }

    const requiredEvidence = Object.freeze(normalizedAccessMode === "WRITE"
      ? ["CONNECTION_EVIDENCE","RESOURCE_GRANT_EVIDENCE","APPROVAL_EVIDENCE","PRE_ACTION_STATE","EXECUTION_RECEIPT","POST_ACTION_STATE"]
      : ["CONNECTION_EVIDENCE","RESOURCE_GRANT_EVIDENCE","RESULT_EVIDENCE"]);

    const payloadInput = {
      employee_id:employeeId,
      capability,
      action:normalizedAction,
      access_mode:normalizedAccessMode,
      target:normalizedTarget,
      connection,
      grant,
      autonomy,
      approval_status:approvalStatusNormalized,
      approval_ref:approvalRefNormalized,
      required_evidence:requiredEvidence,
      decision,
      reason,
      allowed:true,
    };
    const payload = routePayload(payloadInput);

    return Object.freeze({
      schema:1,
      ...payloadInput,
      capability_route_ref:routeRef(payload),
    });
  }

  return Object.freeze({
    catalog: Object.freeze([...byId.values()]),
    grants: normalizedGrants,
    validateSnapshot,
    resolve,
    authorize,
    authorizeForEmployee,
    authorizeActionForEmployee,
  });
}
