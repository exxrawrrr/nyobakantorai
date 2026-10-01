import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildInstallAssets } from "./build-install-assets.mjs";
import { verifyInstallArtifact } from "../packages/install-integrity/index.mjs";

test("builder emits manifest and checksums for both immutable core archive formats", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyoba-install-assets-"));
  try {
    const tag = "v0.5.0";
    const zipName = "nyobakantorai-core-" + tag + ".zip";
    const tarName = "nyobakantorai-core-" + tag + ".tar.gz";
    await writeFile(resolve(dir, zipName), Buffer.from("zip-fixture"));
    await writeFile(resolve(dir, tarName), Buffer.from("tar-fixture"));

    const manifest = await buildInstallAssets({
      dir,
      releaseTag: tag,
      sourceCommit: "c".repeat(40),
      packageVersion: "0.5.0",
    });

    assert.equal(manifest.artifacts.length, 2);
    const sums = await readFile(resolve(dir, "INSTALL-SHA256SUMS.txt"), "utf8");
    const persisted = JSON.parse(
      await readFile(resolve(dir, "install-manifest.json"), "utf8")
    );
    const zip = await readFile(resolve(dir, zipName));

    const check = verifyInstallArtifact({
      manifest: persisted,
      checksumText: sums,
      artifactName: zipName,
      artifactBytes: zip,
      expectedReleaseTag: tag,
    });
    assert.equal(check.ok, true, check.reasons.join(","));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
