import { WORKFORCE } from "../workforce.mjs";

export const EMPLOYEE_PLAYBOOK = Object.freeze(Object.fromEntries(WORKFORCE.map((employee) => [
  employee.id,
  Object.freeze({
    voice: employee.personality.communication_style,
    thinking: employee.work_style.decision_style,
    workflow: `${employee.habits.working_habit} ${employee.work_style.handoff}`,
    skillNames: Object.freeze([...employee.skills]),
    toolState: employee.external_capabilities.length
      ? `Preferred Hermes toolsets: ${employee.preferred_toolsets.join(", ")}. External capabilities default NOT_CONNECTED until a runtime/provider proves connection.`
      : `Preferred Hermes toolsets: ${employee.preferred_toolsets.join(", ")}. Toolset preference is not proof that a tool is enabled or executed.`,
  })
])));

export const PERSONA_SNAPSHOT = "v0.3 canonical workforce · skills are procedures · tools/capabilities are verified separately";
