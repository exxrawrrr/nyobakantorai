import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstallManifest,
  formatChecksumFile,
  isStableReleaseTag,
  verifyInstallArtifact,
} from "./index.mjs";

const TAG = "v0.5.0";
const COMMIT = "a".repeat(40);
const artifactName = "nyobakantorai-core-v0.5.0.zip";
const original = Buffer.from("immutable-core-archive-fixture\n");

const manifest = buildInstallManifest({
  releaseTag: TAG,
  sourceCommit: COMMIT,
  packageVersion: "0.5.0",
  artifacts: [{ name: artifactName, format: "zip", bytes: original }],
});
const sums = formatChecksumFile(manifest);

test("stable release tags are explicit immutable versions", () => {
  assert.equal(isStableReleaseTag("v0.5.0"), true);
  assert.equal(isStableReleaseTag("v0.5.0-rc.1"), true);
  assert.equal(isStableReleaseTag("main"), false);
  assert.equal(isStableReleaseTag("latest"), false);
});

test("valid artifact matches manifest and checksum file", () => {
  const result = verifyInstallArtifact({
    manifest,
    checksumText: sums,
    artifactName,
    artifactBytes: original,
    expectedReleaseTag: TAG,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.source_commit, COMMIT);
});

test("modified ZIP fails closed", () => {
  const modified = Buffer.concat([original, Buffer.from("tampered")]);
  const result = verifyInstallArtifact({
    manifest,
    checksumText: sums,
    artifactName,
    artifactBytes: modified,
    expectedReleaseTag: TAG,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("ARTIFACT_HASH_MISMATCH"));
  assert.ok(result.reasons.includes("CHECKSUM_ARTIFACT_MISMATCH"));
  assert.ok(result.reasons.includes("ARTIFACT_SIZE_MISMATCH"));
});

test("wrong checksum fails closed even when artifact matches manifest", () => {
  const wrong = "b".repeat(64) + "  " + artifactName + "\n";
  const result = verifyInstallArtifact({
    manifest,
    checksumText: wrong,
    artifactName,
    artifactBytes: original,
    expectedReleaseTag: TAG,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("CHECKSUM_MANIFEST_DISAGREEMENT"));
  assert.ok(result.reasons.includes("CHECKSUM_ARTIFACT_MISMATCH"));
});

test("missing checksum fails closed", () => {
  const result = verifyInstallArtifact({
    manifest,
    checksumText: "",
    artifactName,
    artifactBytes: original,
    expectedReleaseTag: TAG,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("CHECKSUM_MISSING"));
});

test("unknown mutable release identifier fails closed", () => {
  const result = verifyInstallArtifact({
    manifest,
    checksumText: sums,
    artifactName,
    artifactBytes: original,
    expectedReleaseTag: "main",
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("UNKNOWN_RELEASE"));
});

test("manifest/version disagreement fails closed", () => {
  const result = verifyInstallArtifact({
    manifest,
    checksumText: sums,
    artifactName,
    artifactBytes: original,
    expectedReleaseTag: "v0.5.1",
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("MANIFEST_RELEASE_TAG_MISMATCH"));
});

test("manifest is deterministic for the same bytes and metadata", () => {
  const again = buildInstallManifest({
    releaseTag: TAG,
    sourceCommit: COMMIT,
    packageVersion: "0.5.0",
    artifacts: [{ name: artifactName, format: "zip", bytes: original }],
  });
  assert.deepEqual(again, manifest);
  assert.equal(formatChecksumFile(again), sums);
});


test("package version mismatch is rejected before release assets are built", () => {
  assert.throws(
    () => buildInstallManifest({
      releaseTag: "v0.5.0",
      sourceCommit: COMMIT,
      packageVersion: "0.4.0",
      artifacts: [{ name: artifactName, format: "zip", bytes: original }],
    }),
    /packageVersion must exactly match releaseTag/
  );
});
