import { execFileSync } from "node:child_process";
import { basename, extname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const root = resolve(import.meta.dirname, "..");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(String.fromCharCode(10))
  .map((line) => line.replace(String.fromCharCode(13), ""))
  .filter(Boolean);

const slash = String.fromCharCode(92);
const binary = new Set([".png",".jpg",".jpeg",".gif",".webp",".ico",".pdf",".zip",".db",".sqlite",".sqlite3",".woff",".woff2"]);
const forbiddenPathFragments = [
  "ai-office-operations/", "office-next/", "office-preview/", "codex_hermes_prep/",
  "/packets/", "/receipts/", "/qa-packets/", "/owner-submissions/", "/evidence/screenshots/",
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
if (skillPaths.length !== 16) findings.push("expected 16 public skills, found " + skillPaths.length);
for (const relative of skillPaths) {
  const parts = relative.split(slash).join("/").split("/");
  const dir = parts[2];
  const text = readFileSync(resolve(root, relative), "utf8");
  const nameLine = text.split(String.fromCharCode(10)).find((line) => line.startsWith("name:"));
  const name = nameLine ? nameLine.slice(5).trim() : "";
  if (name !== dir) findings.push(relative + ": frontmatter name does not match directory");
  if (!text.toLowerCase().includes("platforms: [windows, linux, macos]")) findings.push(relative + ": public skill is not declared cross-platform");
}

const agentPaths = tracked.filter((p) => {
  const parts = p.split(slash).join("/").split("/");
  return parts.length === 3 && parts[0] === "agents" && parts[2] === "SOUL.md";
});
if (agentPaths.length !== 6) findings.push("expected 6 public agent SOUL files, found " + agentPaths.length);

if (findings.length) {
  console.error("Public-release audit failed:" + String.fromCharCode(10) + [...new Set(findings)].join(String.fromCharCode(10)));
  process.exit(1);
}
console.log("Public-release audit passed across " + tracked.length + " tracked files, " + skillPaths.length + " skills, and " + agentPaths.length + " agent profiles.");
