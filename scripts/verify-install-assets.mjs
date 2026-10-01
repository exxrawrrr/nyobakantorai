import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyInstallArtifact } from "../packages/install-integrity/index.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

export async function verifyInstallAssets({
  dir,
  releaseTag,
  expectedCommit = null,
} = {}) {
  const root = resolve(dir);
  const manifest = JSON.parse(
    await readFile(resolve(root, "install-manifest.json"), "utf8")
  );
  const checksumText = await readFile(
    resolve(root, "INSTALL-SHA256SUMS.txt"),
    "utf8"
  );

  const names = [
    "nyobakantorai-core-" + releaseTag + ".tar.gz",
    "nyobakantorai-core-" + releaseTag + ".zip",
  ];

  const results = [];
  for (const name of names) {
    const bytes = await readFile(resolve(root, name));
    const result = verifyInstallArtifact({
      manifest,
      checksumText,
      artifactName: name,
      artifactBytes: bytes,
      expectedReleaseTag: releaseTag,
    });
    if (!result.ok) {
      throw new Error(name + " failed install integrity: " + result.reasons.join(","));
    }
    results.push({ name, sha256: result.artifact_sha256 });
  }

  if (expectedCommit && manifest.source_commit !== expectedCommit) {
    throw new Error(
      "install manifest source commit mismatch: expected " +
        expectedCommit +
        " got " +
        manifest.source_commit
    );
  }

  return Object.freeze({
    ok: true,
    release_tag: releaseTag,
    source_commit: manifest.source_commit,
    artifacts: Object.freeze(results),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dir = arg("--dir");
  const releaseTag = arg("--tag");
  const expectedCommit = arg("--commit");

  if (!dir || !releaseTag) {
    throw new Error(
      "usage: verify-install-assets.mjs --dir <dir> --tag <vX.Y.Z> [--commit <sha>]"
    );
  }

  const result = await verifyInstallAssets({
    dir,
    releaseTag,
    expectedCommit,
  });
  console.log(
    "Immutable install assets verified: " +
      result.release_tag +
      " @ " +
      result.source_commit.slice(0, 12) +
      " · artifacts=" +
      result.artifacts.length
  );
}
