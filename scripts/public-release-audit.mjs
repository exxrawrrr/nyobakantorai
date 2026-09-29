import { execFileSync } from "node:child_process";
import { basename, extname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const root = resolve(import.meta.dirname, "..");
const workforceRegistry = JSON.parse(readFileSync(resolve(root, "config/employees.json"), "utf8"));
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(String.fromCharCode(10))
  .map((line) => line.replace(String.fromCharCode(13), ""))
  .filter(Boolean);

const slash = String.fromCharCode(92);
const binary = new Set([".png",".jpg",".jpeg",".gif",".webp",".ico",".pdf",".zip",".db",".sqlite",".sqlite3",".woff",".woff2"]);
const forbiddenPathFragments = [
  "ai-office-operations/", "office-next/", "office-preview/", "codex_hermes_prep/",
  "/packets/", "/receipts/", "/qa-packets/", "/owner-submissions/", "/evidence/screenshots/", "/.nyobakantorai/",
];
const forbiddenFileNames = new Set([
  ".env","auth.json","nous_auth.json","credentials.json","secrets.json",
  ".nyobakantorai-stop-token",".v3-stop-token",
]);
const privateMarkers = [
  ["private workstation path", "d:" + slash + "rafdi_data"],
  ["private workstation path", "c:" + slash + "users" + slash + "user"],
  ["private workspace name", "03_ai_office"],
  ["internal company marker", "pro drive"],
  ["internal company marker", "pro media"],
  ["internal company marker", "@prodrive"],
  ["internal company marker", "promediainteraksi"],
  ["internal company marker", "prodrive.co.id"],
  ["legacy namespace", "rafdi_task"],
  ["legacy namespace", "rafdi_manual"],
  ["legacy namespace", "rafdi_owner"],
  ["legacy namespace", "rafdi_office"],
  ["legacy owner literal", "value=\"rafdi\""],
  ["legacy skill namespace", "rafdi-task"],
  ["legacy skill namespace", "rafdi-manual"],
  ["legacy skill namespace", "rafdi-approval"],
  ["legacy layout", "office-next"],
  ["legacy layout", "office-preview"],
  ["legacy layout", "ai-office-operations"],
];

const findings = [];
for (const relative of tracked) {
  const normalized = relative.split(slash).join("/").toLowerCase();
  const name = basename(relative).toLowerCase();
  if (normalized.startsWith("docs/_temp_")) {
    findings.push(relative + ": temporary planning document must not ship");
  }
  if (forbiddenFileNames.has(name) || (name.startsWith(".env.") && name !== ".env.example")) {
    findings.push(relative + ": forbidden sensitive filename");
  }
  for (const fragment of forbiddenPathFragments) {
    if (normalized.includes(fragment) || normalized.startsWith(fragment.slice(1))) {
      findings.push(relative + ": forbidden public-release artifact path (" + fragment + ")");
    }
  }
  if (binary.has(extname(relative).toLowerCase())) continue;
  let text = "";
  try { text = readFileSync(resolve(root, relative), "utf8"); } catch { continue; }
  const lower = text.toLowerCase();
  const markerAuditExempt = new Set([
    ".gitignore", // defensive deny-list intentionally names private/legacy paths
    "scripts/public-release-audit.mjs",
    "scripts/repo-audit.mjs",
    "office/tests/architecture-sync.test.mjs",
  ]);
  if (!markerAuditExempt.has(normalized)) {
    for (const [label, marker] of privateMarkers) {
      if (lower.includes(marker)) findings.push(relative + ": " + label + " (" + marker + ")");
    }
  }
  for (const token of text.split(/\s+/)) {
    if (token.includes("@") && token.includes(".") && !token.includes("@example.")) {
      const cleaned = token.replace(/[<>()"'\x60,;]+/g, "");
      if (/^[^@]+@[^@]+[.][a-z]{2,}$/i.test(cleaned)) {
        findings.push(relative + ": possible non-example email address");
        break;
      }
    }
  }
}

const skillPaths = tracked.filter((p) => {
  const parts = p.split(slash).join("/").split("/");
  return parts.length === 4 && parts[0] === "skills" && parts[1] === "hermes-custom" && parts[3] === "SKILL.md";
});
const canonicalSkillNames = new Set(skillPaths.map((p) => p.split(slash).join("/").split("/")[2]));
if (canonicalSkillNames.size < 16) findings.push("expected at least 16 canonical public skills, found " + canonicalSkillNames.size);
for (const relative of skillPaths) {
  const parts = relative.split(slash).join("/").split("/");
  const dir = parts[2];
  const text = readFileSync(resolve(root, relative), "utf8");
  const nameLine = text.split(String.fromCharCode(10)).find((line) => line.startsWith("name:"));
  const name = nameLine ? nameLine.slice(5).trim() : "";
  if (name !== dir) findings.push(relative + ": frontmatter name does not match directory");
  if (!/^compatibility:\s*["\']Hermes-first; follows the Agent Skills SKILL[.]md core format[.]["\']\s*$/m.test(text)) findings.push(relative + ": public skill is missing Agent Skills compatibility declaration");
  if (!/^\s*nyoba-platforms:\s*["\']windows,linux,macos["\']\s*$/m.test(text)) findings.push(relative + ": public skill is not declared cross-platform in namespaced metadata");
}

const agentPaths = tracked.filter((p) => {
  const parts = p.split(slash).join("/").split("/");
  return parts.length === 3 && parts[0] === "agents" && parts[2] === "SOUL.md";
});
const employeeIds = workforceRegistry.employees.map((employee) => employee.id);
if (workforceRegistry.employee_count !== workforceRegistry.employees.length) findings.push("employee_count does not match registry length");
if (new Set(employeeIds).size !== employeeIds.length) findings.push("employee IDs are not unique");
if (agentPaths.length !== employeeIds.length) findings.push("expected " + employeeIds.length + " public agent SOUL files, found " + agentPaths.length);

const distManifests = tracked.filter((p) => /^hermes-profiles\/[^/]+\/distribution[.]yaml$/.test(p.split(slash).join("/")));
if (distManifests.length !== employeeIds.length) findings.push("expected " + employeeIds.length + " Hermes distribution manifests, found " + distManifests.length);
for (const employee of workforceRegistry.employees) {
  const id = employee.id;
  const manifestPath = `hermes-profiles/${id}/distribution.yaml`;
  if (!tracked.includes(manifestPath)) findings.push(manifestPath + ": missing tracked Hermes distribution");
  const prefix = `hermes-profiles/${id}/skills/nyobakantorai/`;
  const packaged = tracked.filter((p) => p.split(slash).join("/").startsWith(prefix) && p.endsWith("/SKILL.md"));
  const expectedSkills = new Set(employee.skills);
  const packagedSkills = new Set(packaged.map((p) => p.split(slash).join("/").split("/")[4]));
  if (packagedSkills.size !== expectedSkills.size || [...expectedSkills].some((skill) => !packagedSkills.has(skill))) {
    findings.push(`hermes-profiles/${id}: packaged skills do not match registry`);
  }
  for (const skill of expectedSkills) {
    if (!canonicalSkillNames.has(skill)) findings.push(`${id}: registry references missing canonical skill ${skill}`);
    const packagedPath = `hermes-profiles/${id}/skills/nyobakantorai/${skill}/SKILL.md`;
    const canonical = `skills/hermes-custom/${skill}/SKILL.md`;
    if (!tracked.includes(packagedPath) || !tracked.includes(canonical)) continue;
    if (readFileSync(resolve(root, packagedPath), "utf8") !== readFileSync(resolve(root, canonical), "utf8")) {
      findings.push(packagedPath + ": packaged skill drifted from canonical source");
    }
  }
}
// Any docs/_TEMP_* file is rejected generically above.

if (findings.length) {
  console.error("Public-release audit failed:" + String.fromCharCode(10) + [...new Set(findings)].join(String.fromCharCode(10)));
  process.exit(1);
}
console.log("Public-release audit passed across " + tracked.length + " tracked files, " + skillPaths.length + " canonical skills, and " + agentPaths.length + " agent profiles.");
