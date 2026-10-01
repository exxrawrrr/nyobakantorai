# Canonical live portability evidence — 2026-10-01

Source code commit: `30b3be36dd1d4e13888ad921c597dbb3b13d02e6`

Canonical core bundle:

`cf156141c8f825d13250bf4bc6368195787d37564ce41b8be5f0cd1502a6aaa8`

Evidence chain:

- Hermes raw live record SHA-256 (runner): `9c884de61277c347dc9a28f95b3ae953190283734bef2be5fe14e0da36cd1805`
- Codex raw live record SHA-256 (runner): `252d8a93ad09b99b946c9e8dc55e04b368c30444de68b500e589d68b1d6c5344`
- Hermes independent verifier evidence ref: `sha256:c458733d12e92737b09d75fcfd6a93ea4e1d136694c4eee81f0dec4b8e30cbf8`
- Codex independent verifier evidence ref: `sha256:3b30d227a364c61acb490949a2440eaf5aafb677bc69d8daa6cc5fbf02939e2a`
- Comparator state: `PORTABILITY_VERIFIED_FOR_REFERENCE_CASE`
- Comparator SHA-256: `31c0940dcdae7a63f036b4fda774b38feb5a64ed4f7e29d58c8d92933e987d93`
- Blocking reasons: none.

Both live records were produced by the canonical live runner on the same exact Git commit and final canonical core bundle. Both passed `python-portability-run-verifier-v1` independently before comparison.

The runner public-safety scan, the independent verifier public-safety scan, and an additional pre-promotion scan found no credential value or private machine path in the committed evidence files.

Claim boundary: this evidence supports portability only for this bounded Siti reference case. It does not establish global runtime parity, broad production reliability, or external-world correctness.
