import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "README.md", "SECURITY.md", "CONTRIBUTING.md", "LICENSE",
  ".gitignore", ".env.example", "package.json",
  "office/package.json", "office/server.mjs", "office/src/asset-manifest.json",
  "docs/THREAT-MODEL.md", "docs/PRIVACY.md", "docs/RUNTIME-ADAPTER-SPEC.md",
];
for (const file of required) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing required public project file: ${file}`);
}

const pkg = JSON.parse(readFileSync(resolve(root, "office/package.json"), "utf8"));
if (pkg.name !== "nyobakantorai") throw new Error("Office package name is not portable.");

const core = ["office/server.mjs", "office/stop.mjs", "office/package.json"];
const privateMarkers = [
  /D:\\RAFDI_DATA/i, /C:\\Users\\User/i, /03_AI_OFFICE/i, /Office-Next/i,
  /AI-OFFICE-OPERATIONS/i, /Office-Preview/i,
];
for (const file of core) {
  const content = readFileSync(resolve(root, file), "utf8");
  for (const marker of privateMarkers) {
    if (marker.test(content)) throw new Error(`Private/legacy marker leaked into product core: ${file}`);
  }
}

const manifest = JSON.parse(readFileSync(resolve(root, "office/src/asset-manifest.json"), "utf8"));
if (manifest.schema !== 2 || manifest.license !== "MIT") throw new Error("Asset manifest lacks public provenance/license.");
for (const asset of manifest.assets ?? []) {
  if (!asset.output?.endsWith(".svg") || asset.provenance !== "original_svg_generated_for_nyobakantorai") {
    throw new Error(`Asset provenance rejected: ${asset.output ?? "unknown"}`);
  }
  for (const forbidden of ["source_file", "source_sha256", "source_runtime_path", "crop"]) {
    if (forbidden in asset) throw new Error(`Private reference metadata leaked into asset: ${asset.output}`);
  }
}
console.log("Repository product-surface audit passed.");
