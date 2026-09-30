import { createHash } from "node:crypto";

export const INSTALL_MANIFEST_SCHEMA = 1;
export const INSTALL_CHANNEL = "stable";
export const INSTALL_INTEGRITY = "sha256";

const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const unique = (values) => [...new Set(values)];

export function isStableReleaseTag(tag) {
  return RELEASE_TAG.test(clean(tag, 120));
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseChecksumFile(text) {
  const entries = new Map();
  const errors = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) {
      errors.push("CHECKSUM_LINE_INVALID:" + line);
      continue;
    }
    const name = match[2].trim();
    if (entries.has(name)) errors.push("CHECKSUM_DUPLICATE:" + name);
    entries.set(name, match[1].toLowerCase());
  }
  return Object.freeze({ entries, errors: Object.freeze(errors) });
}

export function buildInstallManifest({
  releaseTag,
  sourceCommit,
  artifacts,
  packageVersion = null,
} = {}) {
  if (!isStableReleaseTag(releaseTag)) {
    throw new Error("releaseTag must be an immutable vX.Y.Z release tag");
  }
  if (!COMMIT.test(clean(sourceCommit, 40))) {
    throw new Error("sourceCommit must be an exact 40-hex Git commit");
  }
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error("artifacts must be non-empty");
  }

  const rows = artifacts.map((artifact) => {
    const name = clean(artifact?.name, 240);
    if (!name || name.includes("/") || name.includes("\\")) {
      throw new Error("artifact name must be a basename");
    }
    const bytes = Buffer.isBuffer(artifact?.bytes)
      ? artifact.bytes
      : Buffer.from(artifact?.bytes ?? "");
    if (bytes.length === 0) {
      throw new Error("artifact bytes must be non-empty: " + name);
    }
    const format = clean(artifact?.format, 40);
    if (!["zip", "tar.gz"].includes(format)) {
      throw new Error("artifact format unsupported: " + format);
    }
    return Object.freeze({
      name,
      format,
      bytes: bytes.length,
      sha256: sha256Bytes(bytes),
    });
  }).sort((a, b) => a.name.localeCompare(b.name));

  if (unique(rows.map((row) => row.name)).length !== rows.length) {
    throw new Error("artifact names must be unique");
  }

  return Object.freeze({
    schema: INSTALL_MANIFEST_SCHEMA,
    project: "nyobakantorai",
    channel: INSTALL_CHANNEL,
    integrity: INSTALL_INTEGRITY,
    release_tag: releaseTag,
    source_commit: sourceCommit,
    package_version: packageVersion == null ? null : clean(packageVersion, 80),
    artifacts: Object.freeze(rows),
  });
}

export function formatChecksumFile(manifest) {
  return manifest.artifacts
    .map((artifact) => artifact.sha256 + "  " + artifact.name)
    .join("\n") + "\n";
}

export function verifyInstallArtifact({
  manifest,
  checksumText,
  artifactName,
  artifactBytes,
  expectedReleaseTag,
} = {}) {
  const reasons = [];
  const tag = clean(expectedReleaseTag, 120);

  if (!isStableReleaseTag(tag)) reasons.push("UNKNOWN_RELEASE");

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    reasons.push("MANIFEST_INVALID");
    return Object.freeze({
      ok: false,
      reasons: Object.freeze(reasons),
      artifact_sha256: null,
      source_commit: null,
    });
  }

  if (manifest.schema !== INSTALL_MANIFEST_SCHEMA) reasons.push("MANIFEST_SCHEMA_INVALID");
  if (manifest.project !== "nyobakantorai") reasons.push("MANIFEST_PROJECT_INVALID");
  if (manifest.channel !== INSTALL_CHANNEL) reasons.push("MANIFEST_CHANNEL_INVALID");
  if (manifest.integrity !== INSTALL_INTEGRITY) reasons.push("MANIFEST_INTEGRITY_INVALID");
  if (!isStableReleaseTag(manifest.release_tag)) reasons.push("MANIFEST_RELEASE_TAG_INVALID");
  if (tag && manifest.release_tag !== tag) reasons.push("MANIFEST_RELEASE_TAG_MISMATCH");
  if (!COMMIT.test(clean(manifest.source_commit, 40))) reasons.push("MANIFEST_SOURCE_COMMIT_INVALID");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    reasons.push("MANIFEST_ARTIFACTS_INVALID");
  }

  const name = clean(artifactName, 240);
  const artifact = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.find((item) => item?.name === name)
    : null;

  if (!artifact) {
    reasons.push("ARTIFACT_NOT_DECLARED");
  } else {
    if (!SHA256.test(clean(artifact.sha256, 64))) reasons.push("MANIFEST_ARTIFACT_HASH_INVALID");
    if (!Number.isInteger(artifact.bytes) || artifact.bytes <= 0) {
      reasons.push("MANIFEST_ARTIFACT_SIZE_INVALID");
    }
  }

  const parsed = parseChecksumFile(checksumText);
  reasons.push(...parsed.errors);
  const declaredChecksum = parsed.entries.get(name);
  if (!declaredChecksum) reasons.push("CHECKSUM_MISSING");

  const bytes = Buffer.isBuffer(artifactBytes)
    ? artifactBytes
    : Buffer.from(artifactBytes ?? "");
  const actual = bytes.length ? sha256Bytes(bytes) : null;

  if (!actual) reasons.push("ARTIFACT_BYTES_MISSING");
  if (artifact && actual && artifact.sha256 !== actual) reasons.push("ARTIFACT_HASH_MISMATCH");
  if (declaredChecksum && artifact && declaredChecksum !== artifact.sha256) {
    reasons.push("CHECKSUM_MANIFEST_DISAGREEMENT");
  }
  if (declaredChecksum && actual && declaredChecksum !== actual) {
    reasons.push("CHECKSUM_ARTIFACT_MISMATCH");
  }
  if (artifact && bytes.length && artifact.bytes !== bytes.length) {
    reasons.push("ARTIFACT_SIZE_MISMATCH");
  }

  return Object.freeze({
    ok: reasons.length === 0,
    reasons: Object.freeze(unique(reasons)),
    artifact_sha256: actual,
    source_commit: COMMIT.test(clean(manifest.source_commit, 40))
      ? manifest.source_commit
      : null,
  });
}
