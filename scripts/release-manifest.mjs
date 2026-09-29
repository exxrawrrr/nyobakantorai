import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inspectEvaluationReadiness } from "./evaluation-doctor.mjs";
import { buildReleaseClaimSnapshot } from "../packages/release-claims/index.mjs";

const root = resolve(import.meta.dirname, "..");
const outPath = resolve(root, "release", "manifest.json");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean)
  .filter((file) => file !== "release/manifest.json")
  .sort();

const files = tracked.map((file) => {
  const bytes = readFileSync(resolve(root, file));
  return {
    path: file.replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});

let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch {}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const evaluationReport = await inspectEvaluationReadiness();
const claims = buildReleaseClaimSnapshot(evaluationReport);
const manifest = {
  schema: 1,
  project: pkg.name,
  version: pkg.version,
  commit,
  claims,
  tracked_files: files.length,
  files,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Release manifest written: ${files.length} files @ ${commit.slice(0, 12)}`);
