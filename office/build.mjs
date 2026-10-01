import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL(".", import.meta.url);
const src = new URL("src/", root);
const dist = new URL("dist/", root);
const files = ["index.html", "styles.css", "app.mjs", "approval-summary.mjs", "persona-ops.mjs", "scene.mjs", "worker-bubbles.mjs", "favicon.svg", "asset-manifest.json", "workforce.generated.css"];
const rootFiles = ["registry.mjs", "reconcile.mjs", "workforce.mjs", "workforce-view.mjs"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const manifest = JSON.parse(await readFile(new URL("asset-manifest.json", src), "utf8"));
if (manifest.schema !== 3 || manifest.license !== "MIT") {
  throw new Error("Build rejected: public asset manifest is missing schema/license.");
}
if (!Array.isArray(manifest.assets) || manifest.assets.length !== 54) {
  throw new Error("Build rejected: expected 54 public character assets.");
}
for (const asset of manifest.assets) {
  if (!asset.output?.endsWith(".png")) throw new Error("Build rejected: character asset must be the canonical PNG sprite.");
  if (asset.provenance !== "owner_authored_character_sprite") throw new Error("Build rejected: asset provenance is not the owner-authored canonical set.");
  for (const forbidden of ["source_file","source_sha256","source_runtime_path","crop"]) {
    if (forbidden in asset) throw new Error("Build rejected: private reference metadata leaked into manifest.");
  }
}

for (const file of files) await cp(new URL(file, src), new URL(file, dist));
for (const file of rootFiles) await cp(new URL(file, root), new URL(file, dist));
await cp(new URL("assets/", src), new URL("assets/", dist), { recursive: true });

await writeFile(
  new URL("build-meta.json", dist),
  JSON.stringify({
    schema: 1,
    built_at: new Date().toISOString(),
    source_assets: manifest.assets.length,
    asset_provenance: manifest.provenance,
    license: manifest.license
  }, null, 2)
);
console.log(`Built ${files.length + rootFiles.length} files plus ${manifest.assets.length} owner-authored PNG character sprites.`);
