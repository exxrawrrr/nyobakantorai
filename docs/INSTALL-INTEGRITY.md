# Immutable install and release integrity

Status: **v0.5 Chat 14**

The stable install channel is release-based and fail-closed. It must not silently follow mutable `main`.

## Stable channel

Default installer behavior:

```text
resolve latest stable GitHub release or explicit --version/-Version
-> download immutable core release archive
-> download install-manifest.json
-> download INSTALL-SHA256SUMS.txt
-> verify release tag
-> verify package version
-> verify exact source commit
-> verify artifact byte size
-> verify SHA-256 against manifest
-> verify SHA-256 against checksum file
-> unpack only after all checks pass
-> record installation provenance
```

Stable artifacts are published from the exact tagged `GITHUB_SHA`:

- `nyobakantorai-core-<tag>.tar.gz`
- `nyobakantorai-core-<tag>.zip`
- `install-manifest.json`
- `INSTALL-SHA256SUMS.txt`
- `install.sh`
- `install.ps1`

A stable verification failure stops installation. There is no fallback to a branch archive, Git clone, or mutable `main`.

## Development channel

Mutable source remains available only as explicit development behavior.

POSIX:

```bash
./install.sh --channel development --ref main
```

PowerShell:

```powershell
.\install.ps1 -Channel development -Ref main
```

Supplying `--ref` / `-Ref` is treated as development intent. Stable installation rejects a mutable ref.

## Existing directories

Stable installation refuses to mutate a non-empty existing install directory. Choose a new destination.

Development installs may reuse an existing Git checkout and explicitly fetch/checkout the requested ref. Stable mode never performs an implicit `git pull`.

## Recorded provenance

Every successful install writes:

```text
.nyobakantorai-install.json
```

with at least:

- install channel;
- version/tag or development ref;
- exact source commit;
- release artifact SHA-256 for stable installs;
- integrity verification state;
- installation timestamp;
- selected employees.

## Release build gate

Tagged release workflow must:

1. pass normal release checks;
2. build both core archive formats from the exact tag commit;
3. bind tag and `package.json` version exactly;
4. generate install manifest + checksum file;
5. independently re-read and verify both generated artifacts;
6. test archive structure before publishing;
7. publish immutable install assets only after the gate passes.

A tag/package mismatch is release-blocking. For example, a `v0.5.0` tag while `package.json` still reports `0.4.0` must fail.

## Negative integrity coverage

CI explicitly covers:

- modified artifact;
- wrong checksum;
- missing checksum;
- unknown/mutable release identifier;
- release-tag mismatch;
- package-version mismatch;
- artifact size mismatch.

No negative case is allowed to downgrade into a mutable-source fallback.

## Claim boundary

Passing these checks supports:

> stable installation is bound to an immutable tagged artifact with SHA-256 and manifest verification.

It does not prove:

- GitHub itself can never be compromised;
- a user's local machine is trustworthy;
- Hermes or another runtime is behaviorally correct;
- every future release was installed on a real clean machine.

Those remain separate evidence categories.
