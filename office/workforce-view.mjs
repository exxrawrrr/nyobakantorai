import { WORKFORCE } from "./workforce.mjs";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function toPortableWorkforceView(employee) {
  const {
    preferred_toolsets: _runtimeToolsets,
    optional_integrations: _runtimeIntegrations,
    profile: _runtimeDistribution,
    ...portable
  } = structuredClone(employee);
  if (portable.learning_profile?.memory_mode) {
    portable.learning_profile.memory_mode = String(portable.learning_profile.memory_mode)
      .replace(/_HERMES_FIRST$/i, "");
  }
  return deepFreeze(portable);
}

export function runtimePreferencesForWorkforceView(employee) {
  return deepFreeze({
    preferred_toolsets: [...(employee.preferred_toolsets || [])],
    optional_integrations: [...(employee.optional_integrations || [])],
    distribution: structuredClone(employee.profile || {}),
    source_memory_mode: employee.learning_profile?.memory_mode || "",
  });
}

export const WORKFORCE_VIEW = Object.freeze(WORKFORCE.map(toPortableWorkforceView));
export const RUNTIME_WORKFORCE_PREFERENCES = Object.freeze(Object.fromEntries(
  WORKFORCE.map((employee) => [employee.id, runtimePreferencesForWorkforceView(employee)])
));
export const EMPLOYEE_BY_ID = Object.freeze(Object.fromEntries(
  WORKFORCE_VIEW.map((employee) => [employee.id, employee])
));

export function runtimePreferencesForEmployee(employeeId) {
  return RUNTIME_WORKFORCE_PREFERENCES[employeeId] || Object.freeze({
    preferred_toolsets: Object.freeze([]),
    optional_integrations: Object.freeze([]),
    distribution: Object.freeze({}),
    source_memory_mode: "",
  });
}
