import { readFileSync } from "node:fs";

const source = JSON.parse(readFileSync(new URL("../config/employees.json", import.meta.url), "utf8"));

export function validateWorkforceRegistry(registry = source) {
  if (registry?.schema !== 1 || registry?.version !== "0.3.0" || !Array.isArray(registry.employees)) {
    throw new Error("Invalid workforce registry header.");
  }
  if (registry.employee_count !== registry.employees.length || registry.employees.length < 16) {
    throw new Error("Workforce registry must contain at least the 16 baseline employees and employee_count must match.");
  }
  const ids = new Set();
  for (const employee of registry.employees) {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(employee.id || "")) throw new Error("Invalid employee id: " + employee.id);
    if (ids.has(employee.id)) throw new Error("Duplicate employee id: " + employee.id);
    ids.add(employee.id);
    for (const key of ["name","role","department","summary","aliases","personality","habits","work_style","expertise","skills","preferred_toolsets","routing","visual","approval_policy","verification_policy","profile"]) {
      if (employee[key] === undefined) throw new Error(employee.id + " missing " + key);
    }
    if (!Array.isArray(employee.skills) || !employee.skills.length) throw new Error(employee.id + " has no skills");
    if (!Array.isArray(employee.routing?.keywords) || !employee.routing.keywords.length) throw new Error(employee.id + " has no routing keywords");
    if (employee.verification_policy?.self_verify !== false) throw new Error(employee.id + " may not self-verify");
  }
  return registry;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
export function toPortableEmployeeContract(employee) {
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

export function runtimePreferencesFor(employee) {
  return deepFreeze({
    preferred_toolsets:[...(employee.preferred_toolsets || [])],
    optional_integrations:[...(employee.optional_integrations || [])],
    distribution:structuredClone(employee.profile || {}),
    source_memory_mode:employee.learning_profile?.memory_mode || "",
  });
}

export const WORKFORCE_REGISTRY = Object.freeze(validateWorkforceRegistry(source));
export const WORKFORCE = Object.freeze(WORKFORCE_REGISTRY.employees.map((employee) => deepFreeze(employee)));
export const PORTABLE_WORKFORCE = Object.freeze(WORKFORCE.map(toPortableEmployeeContract));
export const WORKFORCE_RUNTIME_PREFERENCES = Object.freeze(Object.fromEntries(
  WORKFORCE.map((employee) => [employee.id, runtimePreferencesFor(employee)])
));
export const EMPLOYEE_IDS = Object.freeze(WORKFORCE.map(({ id }) => id));
export const EMPLOYEE_BY_ID = Object.freeze(Object.fromEntries(WORKFORCE.map((employee) => [employee.id, employee])));
export const PORTABLE_EMPLOYEE_BY_ID = Object.freeze(Object.fromEntries(PORTABLE_WORKFORCE.map((employee) => [employee.id, employee])));
export const REFERENCED_SKILLS = Object.freeze([...new Set(WORKFORCE.flatMap((employee) => employee.skills))].sort());
