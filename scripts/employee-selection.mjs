export const EMPLOYEE_PRESETS = Object.freeze({
  leadership: Object.freeze(["praroro","siti","fikri"]),
  engineering: Object.freeze(["subagjo","bimo","siti"]),
  growth: Object.freeze(["paijo","maya","gugun","ratri","nara"]),
  research: Object.freeze(["alex","fikri","siti"]),
  operations: Object.freeze(["dina","tari","bambang","praroro"]),
  "creative-community": Object.freeze(["sumiati","caca","alex"]),
});

export function resolveEmployeeSelection(value, allIds) {
  if (!Array.isArray(allIds) || allIds.length === 0) throw new Error("allIds must be a non-empty array");
  const canonical = [...new Set(allIds)];
  const raw = String(value ?? "all").trim().toLowerCase();
  if (!raw || raw === "all" || raw === "full") return canonical;

  const requested = [];
  for (const token of raw.split(",").map((item) => item.trim()).filter(Boolean)) {
    const expanded = EMPLOYEE_PRESETS[token] || [token];
    requested.push(...expanded);
  }

  const unknown = [...new Set(requested.filter((id) => !canonical.includes(id)))];
  if (unknown.length) {
    throw new Error(`Unknown employee/preset: ${unknown.join(", ")}. Employees: ${canonical.join(", ")}. Presets: ${Object.keys(EMPLOYEE_PRESETS).join(", ")}, full.`);
  }

  const wanted = new Set(requested);
  const selected = canonical.filter((id) => wanted.has(id));
  if (!selected.length) throw new Error("Employee selection resolved to an empty workforce.");
  return selected;
}

export function findEmployeeSelectionArg(argv = []) {
  const eq = argv.find((arg) => arg.startsWith("--employees="));
  if (eq) return eq.slice("--employees=".length);
  const index = argv.indexOf("--employees");
  if (index >= 0) {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error("--employees requires a comma-separated value, preset, or all.");
    return next;
  }
  return "all";
}
