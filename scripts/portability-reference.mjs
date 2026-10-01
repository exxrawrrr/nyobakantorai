import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson } from "../packages/execution-receipt/index.mjs";
import { buildPortabilityReferenceCase } from "../packages/portability-reference/index.mjs";

const root = process.cwd();
const manifestPath = resolve(root, "benchmarks/portability/reference-case/manifest.json");
const reference = await buildPortabilityReferenceCase({ root });
const expected = JSON.stringify(reference.manifest, null, 2) + "\n";

if (process.argv.includes("--write")) {
  await writeFile(manifestPath, expected, "utf8");
  console.log(`Wrote portability reference manifest: ${reference.manifest.core_bundle_sha256}`);
  process.exit(0);
}

const actual = await readFile(manifestPath, "utf8").catch(() => "");
if (actual !== expected) {
  console.error("Portability reference manifest drift detected.");
  if (actual) {
    try {
      const parsed = JSON.parse(actual);
      console.error(`expected core: ${reference.manifest.core_bundle_sha256}`);
      console.error(`actual core:   ${parsed.core_bundle_sha256 || "missing"}`);
      if (canonicalJson(parsed.component_sha256 || {}) !== canonicalJson(reference.manifest.component_sha256)) {
        console.error("component hash set differs");
      }
    } catch {
      console.error("existing manifest is invalid JSON");
    }
  } else {
    console.error("manifest missing");
  }
  process.exit(1);
}

console.log(`Portability reference manifest PASS: ${reference.manifest.core_bundle_sha256}`);
