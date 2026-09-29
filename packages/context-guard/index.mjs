const MONTHS = "januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|january|february|march|april|may|june|july|august|september|october|november|december";
const CONSTRAINT_RE = /\b(harus|wajib|jangan|tidak boleh|dilarang|hanya|izin|approval|approve|must|must not|do not|don't|never|only|required|forbidden)\b/i;
const PATTERNS = Object.freeze({
  url: /https?:\/\/[^\s<>"')\]}]+/gi,
  windows_path: /\b[A-Za-z]:\\(?:[^\s\\/:*?"<>|\r\n]+\\)*[^\s\\/:*?"<>|\r\n]+/g,
  posix_path: /(?:^|\s)(\/(?:[^\s/"']+\/)*[^\s/"']+)/g,
  iso_date: /\b\d{4}-\d{2}-\d{2}\b/g,
  named_date: new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}\\b`, "gi"),
  time: /\b(?:[01]?\d|2[0-3])[:.]\d{2}(?:\s?(?:WIB|WITA|WIT|UTC))?\b/gi,
  rupiah: /\bRp\s?\d[\d.,]*/gi,
  percentage: /\b\d+(?:[.,]\d+)?\s?%/g,
  explicit_number: /\b\d+(?:[.,]\d+)+(?:\b|(?=\s))/g,
});

const uniq = (items) => [...new Set(items.filter(Boolean))];

export function normalizeContextText(value) {
  return String(value ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function estimateTokens(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function cleanTerminalPunctuation(value) {
  return String(value).replace(/[.,;:!?]+$/g, "");
}

function matches(text, regex, capture = 0, { trimTerminalPunctuation = false } = {}) {
  const values = [];
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let value = (match[capture] ?? match[0]).trim();
    if (trimTerminalPunctuation) value = cleanTerminalPunctuation(value);
    values.push(value);
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return values;
}

export function extractProtectedAtoms(value) {
  const text = normalizeContextText(value);
  const constraints = text.split("\n").map((line) => line.trim()).filter((line) => line && CONSTRAINT_RE.test(line));
  return Object.freeze({
    constraints: Object.freeze(uniq(constraints)),
    urls: Object.freeze(uniq(matches(text, PATTERNS.url, 0, { trimTerminalPunctuation: true }))),
    windows_paths: Object.freeze(uniq(matches(text, PATTERNS.windows_path, 0, { trimTerminalPunctuation: true }))),
    posix_paths: Object.freeze(uniq(matches(text, PATTERNS.posix_path, 1))),
    dates: Object.freeze(uniq([...matches(text, PATTERNS.iso_date), ...matches(text, PATTERNS.named_date)])),
    times: Object.freeze(uniq(matches(text, PATTERNS.time))),
    amounts: Object.freeze(uniq(matches(text, PATTERNS.rupiah))),
    percentages: Object.freeze(uniq(matches(text, PATTERNS.percentage))),
    explicit_numbers: Object.freeze(uniq(matches(text, PATTERNS.explicit_number))),
  });
}

export function flattenProtectedAtoms(atoms) {
  return uniq(Object.values(atoms || {}).flatMap((value) => Array.isArray(value) ? value : []));
}

export function verifyProtectedAtoms({ original, compiled }) {
  const atoms = extractProtectedAtoms(original);
  const expected = flattenProtectedAtoms(atoms);
  const haystack = normalizeContextText(compiled);
  const missing = expected.filter((atom) => !haystack.includes(atom));
  return Object.freeze({
    ok: missing.length === 0,
    total: expected.length,
    preserved: expected.length - missing.length,
    recall: expected.length ? (expected.length - missing.length) / expected.length : 1,
    missing: Object.freeze(missing),
    atoms,
  });
}

function compactProtectedValues(atoms) {
  const ordered = uniq([
    ...atoms.constraints,
    ...atoms.urls,
    ...atoms.windows_paths,
    ...atoms.posix_paths,
    ...atoms.dates,
    ...atoms.times,
    ...atoms.amounts,
    ...atoms.percentages,
    ...atoms.explicit_numbers,
  ]);
  const kept = [];
  for (const value of ordered) {
    if (kept.some((existing) => existing.includes(value))) continue;
    kept.push(value);
  }
  return kept;
}

function renderAtomSection(atoms) {
  const values = compactProtectedValues(atoms);
  return values.length
    ? values.map((value) => `- ${value}`).join("\n")
    : "- none detected; semantic constraints still require review";
}

export function compileGuardPacket({ sources, objective = "", targetTokens = null } = {}) {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("sources must be a non-empty array");
  const normalized = sources.map((source, index) => {
    const id = String(source?.id || `source-${index + 1}`).trim();
    const type = String(source?.type || "text").trim();
    const text = normalizeContextText(source?.text);
    if (!text) throw new Error(`source ${id} is empty`);
    return Object.freeze({ id, type, text, atoms: extractProtectedAtoms(text) });
  });
  const sourceIndex = normalized.map((source) => `${source.id} (${source.type})`).join("; ");
  const combinedAtoms = {
    constraints: uniq(normalized.flatMap((source) => source.atoms.constraints)),
    urls: uniq(normalized.flatMap((source) => source.atoms.urls)),
    windows_paths: uniq(normalized.flatMap((source) => source.atoms.windows_paths)),
    posix_paths: uniq(normalized.flatMap((source) => source.atoms.posix_paths)),
    dates: uniq(normalized.flatMap((source) => source.atoms.dates)),
    times: uniq(normalized.flatMap((source) => source.atoms.times)),
    amounts: uniq(normalized.flatMap((source) => source.atoms.amounts)),
    percentages: uniq(normalized.flatMap((source) => source.atoms.percentages)),
    explicit_numbers: uniq(normalized.flatMap((source) => source.atoms.explicit_numbers)),
  };
  const protectedSection = renderAtomSection(combinedAtoms);
  const l0 = `Objective: ${normalizeContextText(objective) || "(derive from source; do not invent)"}\nSource: ${sourceIndex}\nProtected atoms:\n${protectedSection}\n`;
  const l2 = `# L2 Canonical Source Packet\n\n${normalized.map((source) => `## Source: ${source.id}\nType: ${source.type}\n\n${source.text}`).join("\n\n---\n\n")}\n`;
  const originalText = normalized.map((source) => source.text).join("\n\n");
  return Object.freeze({
    schema: 1,
    objective: normalizeContextText(objective),
    sources: Object.freeze(normalized),
    protected_atoms: Object.freeze(combinedAtoms),
    l0,
    l2,
    token_budget: Object.freeze({
      original_estimate: estimateTokens(originalText),
      l0_estimate: estimateTokens(l0),
      l2_estimate: estimateTokens(l2),
      target: Number.isFinite(targetTokens) ? targetTokens : null,
    }),
  });
}
