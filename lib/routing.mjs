import { WORKFORCE, EMPLOYEE_BY_ID } from "./workforce.mjs";

const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const highImpact = new Set(["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);
const finiteNonNegative = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

function historySignal(raw = {}) {
  const successes = finiteNonNegative(raw.successes ?? raw.success ?? 0);
  const failures = finiteNonNegative(raw.failures ?? raw.failure ?? 0);
  return Math.min(successes, 8) * 0.25 - Math.min(failures, 8) * 0.5;
}

export function routeWork(text, {
  assignedId = "",
  requiredSkills = [],
  workload = {},
  riskClass = "READ_ONLY",
  history = {},
} = {}) {
  if (assignedId) {
    if (!EMPLOYEE_BY_ID[assignedId]) throw new Error("Unknown human-assigned employee.");
    return {
      employee: assignedId,
      source: "HUMAN_ASSIGNMENT",
      score: null,
      reasons: ["Human assignment wins."],
      factors: { role:0, skills:0, workload:0, history:0, risk:"HUMAN_OVERRIDE" },
    };
  }

  const query = normalize(text);
  const requestedSkills = [...new Set(requiredSkills.map(String).filter(Boolean))];
  const risk = String(riskClass || "READ_ONLY").toUpperCase();

  const scored = WORKFORCE.map((employee) => {
    let roleScore = 0;
    const reasons = [];
    const terms = [...(employee.routing?.keywords || []), ...(employee.aliases || []), ...(employee.expertise || [])];
    for (const raw of terms) {
      const term = normalize(raw);
      if (term && query.includes(term)) {
        const points = term.includes(" ") ? 4 : 2;
        roleScore += points;
        reasons.push(`match:${raw}`);
      }
    }

    let skillScore = 0;
    for (const skill of requestedSkills) {
      if (employee.skills.includes(skill)) {
        skillScore += 6;
        reasons.push(`skill:${skill}`);
      }
    }

    const active = finiteNonNegative(workload[employee.id]);
    const workloadScore = -Math.min(active, 12) * 0.5;
    if (active) reasons.push(`workload:${active}`);

    const prior = historySignal(history[employee.id]);
    if (prior) reasons.push(`history:${prior.toFixed(2)}`);

    const policyRisks = new Set(employee.approval_policy?.requires_approval || []);
    const riskCompatible = !highImpact.has(risk) || policyRisks.has(risk);
    const riskScore = riskCompatible ? 0 : -1000;
    if (!riskCompatible) reasons.push(`risk-policy-missing:${risk}`);
    else if (highImpact.has(risk)) reasons.push(`risk-gated:${risk}`);

    return {
      employee: employee.id,
      score: roleScore + skillScore + workloadScore + prior + riskScore,
      reasons,
      factors: {
        role: roleScore,
        skills: skillScore,
        workload: workloadScore,
        history: prior,
        risk: riskCompatible ? "COMPATIBLE" : "INCOMPATIBLE",
      },
    };
  }).sort((a, b) => b.score - a.score || a.employee.localeCompare(b.employee));

  const top = scored[0];
  const hasSignal = Boolean(query) || requestedSkills.length > 0;
  if (!top || !hasSignal || top.score <= 0) {
    return {
      employee: "praroro",
      source: "FALLBACK_COORDINATION",
      score: 0,
      reasons: ["No positive specialist routing signal."],
      factors: { role:0, skills:0, workload:0, history:0, risk:"COORDINATOR_FALLBACK" },
    };
  }
  return { ...top, source: "DETERMINISTIC_REGISTRY" };
}
