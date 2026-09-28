import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);

const forbiddenNames = new Set([
  ".env", "auth.json", "nous_auth.json", "credentials.json",
  "secrets.json", ".v3-stop-token",
]);
const binaryExt = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".zip",
  ".pdf", ".sqlite", ".sqlite3", ".db", ".woff", ".woff2",
]);
const patterns = [
  ["OpenAI-style key", /sk-[A-Za-z0-9_-]{20,}/g],
  ["GitHub token", /(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/g],
  ["Google API key", /AIza[0-9A-Za-z_-]{25,}/g],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ["Telegram bot token", /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];

const findings = [];
for (const relative of tracked) {
  const name = basename(relative).toLowerCase();
  if (forbiddenNames.has(name) || (name.startsWith(".env.") && name !== ".env.example")) {
    findings.push(`${relative}: forbidden sensitive filename`);
    continue;
  }
  if (binaryExt.has(extname(relative).toLowerCase())) continue;
  let text;
  try { text = readFileSync(resolve(root, relative), "utf8"); } catch { continue; }
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(`${relative}: possible ${label}`);
  }
}
if (findings.length) {
  console.error("Security scan failed:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`Security scan passed across ${tracked.length} tracked files.`);
