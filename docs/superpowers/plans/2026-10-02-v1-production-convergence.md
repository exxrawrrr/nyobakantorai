# CHAT 30 — Production Evidence Convergence + v1.0 Release Plan

**Goal:** Decide whether the repository has actually earned v1.0.0 without converting static tests, synthetic fixtures, or schedule pressure into production evidence.

## Invariants

- GitHub is the source of truth.
- No package bump, tag, or release before computed readiness is READY.
- Live workstation checks may add evidence only when tied to an exact commit and sanitized for repository use.
- Failed or incomplete evidence remains visible.
- Manual GO cannot override technical blockers.
- Tagged-asset verification and post-release smoke happen only after a valid pre-release GO.

## Tasks

- [x] Recover exact CHAT 29 main baseline and verify exact-main CI.
- [x] Define reviewed v1.0 release policy and production evidence ledger.
- [x] Add fail-closed v1.0 readiness evaluator, CLI, manifest snapshot, and tag guard.
- [x] Add adversarial tests against forged READY/manual GO.
- [x] Review connector, sandbox, credential, memory/replay/artifact, recovery, and team security boundaries.
- [x] Add operator release/post-release runbook.
- [x] Run clean workstation baseline verification in an isolated Python environment.
- [x] Record one-worker/subset/full/lifecycle install matrix evidence across Linux, Windows, and minimum-version CI.
- [x] Reconcile blocker ledger after install convergence: four production blockers remain.
- [ ] Require final PR Linux/Windows/minimum-version verification.
- [ ] Merge with exact-head guard and require exact-main three-lane verification.
- [ ] Record final manual release verdict.
- [ ] If and only if READY: bump to 1.0.0, tag, verify immutable tagged assets, publish, and run post-release install smoke.

## Current ruling

The release is currently **NO_GO**. The stable package remains 0.5.1. Completing CHAT 30 with a truthful NO_GO is a valid final outcome when evidence thresholds are not met.
