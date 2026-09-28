import { WORKFORCE, EMPLOYEE_BY_ID } from "./workforce.mjs";

const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function routeWork(text, { assignedId = "" } = {}) {
  if (assignedId) {
    if (!EMPLOYEE_BY_ID[assignedId]) throw new Error("Unknown human-assigned employee.");
    return { employee: assignedId, source: "HUMAN_ASSIGNMENT", score: null, reasons: ["Human assignment wins."] };
  }
  const query = normalize(text);
  if (!query) return { employee: "praroro", source: "FALLBACK_COORDINATION", score: 0, reasons: ["No routing signal."] };

  const scored = WORKFORCE.map((employee) => {
    let score = 0;
    const reasons = [];
    const terms = [...(employee.routing?.keywords || []), ...(employee.aliases || []), ...(employee.expertise || [])];
    for (const raw of terms) {
      const term = normalize(raw);
      if (term && query.includes(term)) {
        score += term.includes(" ") ? 4 : 2;
        reasons.push(raw);
      }
    }
    return { employee: employee.id, score, reasons };
  }).sort((a, b) => b.score - a.score || a.employee.localeCompare(b.employee));

  const top = scored[0];
  if (!top || top.score === 0) return { employee: "praroro", source: "FALLBACK_COORDINATION", score: 0, reasons: ["No specialist keyword matched."] };
  return { ...top, source: "DETERMINISTIC_REGISTRY" };
}
