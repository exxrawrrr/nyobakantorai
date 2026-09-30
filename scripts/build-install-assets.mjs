import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildInstallManifest, formatChecksumFile } from "../packages/install-integrity/index.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

export async function buildInstallAssets({
  dir,
  releaseTag,
  sourceCommit,
  packageVersion = null,
} = {}) {
  const root = resolve(dir);
  const names = [
    "nyobakantorai-core-" + releaseTag + ".tar.gz",
    "nyobakantorai-core-" + releaseTag + ".zip",
  ];
  const artifacts = [];

  for (const name of names) {
    const bytes = await readFile(resolve(root, name));
    artifacts.push({
      name,
      format: name.endsWith(".zip") ? "zip" : "tar.gz",
      bytes,
    });
  }

  const manifest = buildInstallManifest({
    releaseTag,
    sourceCommit,
    artifacts,
    packageVersion,
  });

  await writeFile(
    resolve(root, "install-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  await writeFile(
    resolve(root, "INSTALL-SHA256SUMS.txt"),
    formatChecksumFile(manifest),
    "utf8"
  );
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dir = arg("--dir");
  const releaseTag = arg("--tag");
  const sourceCommit = arg("--commit");
  const packageVersion = arg("--package-version");

  if (!dir || !releaseTag || !sourceCommit) {
    throw new Error(
      "usage: build-install-assets.mjs --dir <dir> --tag <vX.Y.Z> --commit <sha> [--package-version <version>]"
    );
  }

  const manifest = await buildInstallAssets({
    dir,
    releaseTag,
    sourceCommit,
    packageVersion,
  });
  console.log(
    "Immutable install manifest written for " +
      manifest.release_tag +
      " @ " +
      manifest.source_commit.slice(0, 12)
  );
}
