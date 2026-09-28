import { WORKFORCE } from "./workforce.mjs";

export const EMPLOYEE_PLAYBOOK = Object.freeze(Object.fromEntries(WORKFORCE.map((employee) => [
  employee.id,
  Object.freeze({
    voice: employee.personality.communication_style,
    thinking: employee.work_style.decision_style,
    workflow: employee.habits.working_habit + " " + employee.work_style.handoff,
    skillNames: Object.freeze([...employee.skills]),
    toolState: employee.external_capabilities.length
      ? `External capabilities default NOT_CONNECTED: ${employee.external_capabilities.join(", ")}.`
      : `Preferred Hermes toolsets: ${employee.preferred_toolsets.join(", ")}. Availability is runtime-verified separately.`,
  }),
])));

export const PERSONA_SNAPSHOT = "v0.3 canonical workforce registry · SOUL is identity, skills are procedures, tools/MCP require runtime evidence";
