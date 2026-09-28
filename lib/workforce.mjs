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
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(employee.id || "")) throw new Error(`Invalid employee id: ${employee.id}`);
    if (ids.has(employee.id)) throw new Error(`Duplicate employee id: ${employee.id}`);
    ids.add(employee.id);
    for (const key of ["name","role","department","summary","aliases","personality","habits","work_style","expertise","skills","preferred_toolsets","routing","visual","approval_policy","verification_policy","profile"]) {
      if (employee[key] === undefined) throw new Error(`${employee.id} missing ${key}`);
    }
    if (!Array.isArray(employee.skills) || !employee.skills.length) throw new Error(`${employee.id} has no skills`);
    if (!Array.isArray(employee.routing?.keywords) || !employee.routing.keywords.length) throw new Error(`${employee.id} has no routing keywords`);
    if (employee.verification_policy?.self_verify !== false) throw new Error(`${employee.id} may not self-verify`);
  }
  return registry;
}

export const WORKFORCE_REGISTRY = Object.freeze(validateWorkforceRegistry(source));
export const WORKFORCE = Object.freeze(WORKFORCE_REGISTRY.employees.map((employee) => Object.freeze(employee)));
export const EMPLOYEE_IDS = Object.freeze(WORKFORCE.map(({ id }) => id));
export const EMPLOYEE_BY_ID = Object.freeze(Object.fromEntries(WORKFORCE.map((employee) => [employee.id, employee])));
export const REFERENCED_SKILLS = Object.freeze([...new Set(WORKFORCE.flatMap((employee) => employee.skills))].sort());
