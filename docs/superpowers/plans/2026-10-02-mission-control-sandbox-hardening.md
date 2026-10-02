# Mission Control + Sandbox Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:test-driven-development and superpowers:verification-before-completion.

**Goal:** Implement CHAT 28 without adding a second executor or weakening any existing evidence, budget, permission, or approval boundary.

**Spec:** `docs/superpowers/specs/2026-10-02-mission-control-sandbox-hardening-design.md`

## Global constraints

- Existing Mission Engine remains the sole executor.
- Add safe `PAUSED` boundary; do not pause RUNNING work mid-attempt.
- Queue selection may select only a subset of already-runnable tasks.
- Paused resume must not consume failure-recovery cycles.
- Adaptive planning is proposal-only and owner-reviewed.
- Recovery rerouting must reuse the existing recovery allowlist.
- Hardened sandbox remains application-level; no OS/container claim.
- Credentials stay reference-only and outside task payloads.
- v0.8.1 publication remains fail-closed behind live evidence + v0.8.0 prerequisite.

### Task 1 — RED contracts
- [ ] Add Mission Control acceptance tests.
- [ ] Add sandbox hardening acceptance tests.
- [ ] Add v0.8.1 release-readiness adversarial tests.
- [ ] Observe RED.

### Task 2 — Mission Engine safe boundary
- [ ] Add Mission `PAUSED` state and legal transitions.
- [ ] Add validated queue selector hook.
- [ ] Add safe `shouldPause` batch-boundary hook.
- [ ] Preserve existing cancellation semantics.

### Task 3 — Mission Control
- [ ] Add policy normalization and content-addressed policy ref.
- [ ] Add fair employee queue selector.
- [ ] Add slice boundary assessment.
- [ ] Add controlled Mission wrapper that delegates to Mission Engine.
- [ ] Add pause checkpoint generation/persistence.
- [ ] Add proposal-only bounded adaptive plan.
- [ ] Add checkpoint-aware reroute decision using existing recovery policy.

### Task 4 — Sandbox hardening
- [ ] Add explicit filesystem/browser/network/resource/credential contract.
- [ ] Add fail-closed admission assessment + content ref.
- [ ] Prove no authority widening and no credential values.

### Task 5 — v0.8.1 gate + docs
- [ ] Add live-evidence ledger + release-readiness evaluator/CLI.
- [ ] Add release workflow guard + manifest snapshot.
- [ ] Add package scripts and core regression wiring.
- [ ] Update roadmap/30-chat plan/changelog/docs truthfully.

### Task 6 — verification and merge
- [ ] Targeted CHAT 28 tests GREEN.
- [ ] Full `npm run verify` GREEN.
- [ ] Open PR from exact main baseline.
- [ ] Require Ubuntu/Windows/minimum-version CI.
- [ ] Squash merge with exact-head guard.
- [ ] Require exact-main 3-lane verify before closing CHAT 28.
