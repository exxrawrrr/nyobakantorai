# Changelog

## [0.5.1] - Unreleased

### Fixed
- Corrected the tagged-release asset verifier CLI to import `pathToFileURL` from `node:url` instead of `node:path`.
- Added a regression test that executes the verifier CLI against generated immutable install assets.

### Release status
- **BLOCKED** pending the v0.5.1 final promotion gate and a successful tagged-release asset verification run.
- The immutable `v0.5.0` tag is preserved as a failed publication attempt; its tagged workflow stopped before GitHub Release/assets were published.

All notable public changes to nyobakantorai are documented here.

## [0.5.0] - 2026-10-01 — failed publication attempt

### Added
- Runtime-portability inventory, bounded execution contract, Hermes/Codex adapters, immutable Siti reference case, live harness, and comparator.
- Independent Python verifier + Node/Python differential corpus.
- Receipt trust lifecycle registry and immutable installer integrity.
- Anomaly-first approval oversight, evidence classification, multidimensional maturity, complexity budget, and machine-readable release readiness.

### Changed
- Stable install defaults no longer rely on mutable branch archives.
- Approval review prioritizes structured anomalies/missing evidence/failed checks/material changes.
- Historical deferred-evidence validation was consolidated under release-claims.
- Temporary v0.5 implementation PRD was retired after permanent transfer.

### Release status
- Promoted-main verification and manual release-gate passed, but tagged-release workflow `36809825093` failed before publication during immutable asset verification.
- Canonical Hermes+Codex Siti reference case is `PORTABILITY_VERIFIED_FOR_REFERENCE_CASE`; v0.5 LIVE_RUNTIME evidence growth is `INCREASED`.
- No GitHub Release or downloadable v0.5.0 assets were published; the tag remains immutable and is not the current stable release.
- Real-world baseline remains `COLLECTING 1/20`; provider lifecycle remains `partial`; those states are intentionally not promoted by this release.

## [0.4.0] - 2026-09-30

### Added
- Modular one/subset/preset/all employee packs with reproducible checksums and tagged-release packaging.
- Typed employee capability contracts, expanded provenance catalog, and static cross-harness skill exports.
- Ed25519 execution receipts with replay/freshness/task/worker/capability/runtime-trust hardening.
- M0–M4 memory/learning policy, deterministic profile isolation, and personality-governance invariance.
- Fikri L0/L1/L2 context compiler with controlled live-model evaluation evidence.
- Browser/memory provider evaluation contracts, evaluation doctor, and release claim snapshot.
- Anti-synthetic real-task dataset gate with direct-source provenance requirements.
- Hash-chained Real Task Recorder / Collector and read-only Unified Provider Doctor.
- Browser Use self-service six-case runner with isolated disposable browser profile and server-side write/auth evidence.
- Cognee self-service eight-case memory runner with run-owned datasets, profile-isolation/contamination guards, provenance/export/delete verification, secret pre-write rejection, explicit shared promotion, remote opt-in, and cleanup verification.
- Cross-harness self-service parity runner for Hermes/Codex/Gemini/Copilot plus Codex static skill export target.
- Real-task baseline audit/merge/prepare tooling with duplicate-source and semantic-consistency gates, immutable canonical evidence, exact 1/20 collection status, and explicit no-auto-publish behavior.
- One-worker and subset isolated fresh-install matrices covering exact selection, per-worker closure, safe rerun, selective uninstall preview/confirmation, and survivor integrity.
- Full-workforce isolated fresh-install matrix covering all 16 canonical employee packs/profiles, exact per-worker skill/integration closure, all-profile native-upgrade rerun, and preservation of seeded user-owned state.
- Full upgrade/uninstall/reinstall lifecycle matrix covering deliberate distribution drift repair, user-state preservation, selective removal, confirmed full uninstall, clean reinstall, rerun idempotency, and immutable pack artifacts.

### Evaluation
- Fikri controlled live-model run: 5/5 compiled-context downstream pass, zero critical losses, 41.10% average estimated token reduction, and 100% protected/source fidelity on the recorded synthetic fixture set.
- Playwright MCP controlled live run: 6/6 required browser cases, zero false-successes, zero mutation POSTs, no auth-cookie leakage, and truthful timeout/partial recovery.
- Real-task collection started at 1/20 eligible direct owner tasks; the first eligible case is intentionally preserved as `NEEDS_EVIDENCE`, not rewritten as success.
- Cognee, Browser Use, and live cross-harness behavioral parity remain explicitly unproven/NOT_RUN where prerequisites were unavailable.
- Real clean-machine Hermes lifecycle coverage remains open; isolated release matrices are deterministic repository evidence, not environment-level live-machine proof.

### Changed
- Release/documentation claims now distinguish IMPLEMENTED, DETERMINISTICALLY_VERIFIED, and REAL_WORLD_EVALUATED states.
- Runtime permission policy is documented as application-level sandboxing rather than OS/container isolation.
- PR #11 release topology is explicit: staging merge is not stable v0.4 shipment.

### Release status
- Stable v0.4 promotion is **AUTHORIZED WITH ACCEPTED DEFERRALS** by the owner decision recorded on 2026-09-30 in `docs/V0.4-RELEASE-DECISION.md`.
- The six deferred evidence classes remain truthfully `UNPROVEN` / `NOT_RUN` / `COLLECTING` where applicable; stable scope acceptance does not convert them into completed evidence.
- The `v0.4.0` stable tag is permitted only after the promoted `main` commit passes final cross-platform verify and the manual release-gate.

## [0.3.0] - Unreleased

### Added
- Canonical 16-employee workforce registry and generated native Hermes distributions.
- Ten specialist workers across paid media, SEO/CRO, integrations, data, client operations, automation, governance, follow-up, and community.
- Provider-neutral Meta/Google Ads capability contracts with fail-closed connection states.
- Deterministic routing, workforce doctor, custom-employee generator, and permanent v0.3 architecture/Telegram/ads docs.
- Registry-driven office roster with provenance-honest `pending-original-art` placeholders for the ten new workers.
- Role-appropriate Hermes toolset defaults for fresh profile installs.

### Changed
- Bootstrap/installers support v0.2 → v0.3 migration using native Hermes profile update for existing distributions and install for missing profiles.
- Verification policy is registry-driven; self-verification is forbidden, including Siti reviewing Siti.
- Office/runtime/tests/audits derive workforce identity from the canonical registry instead of separate six-person arrays.

### Security
- Existing user config, auth, memory, sessions, provider settings, Telegram config, and runtime state remain user-owned during native profile updates.
- Advertising actions remain GUARDED by default and no live-provider credentials are bundled.


## [0.2.0] - 2026-09-28

### Added
- Six portable example agent profiles.
- Sixteen reusable safety, research, growth, creative, engineering, and QA skills.
- Local-first visual office with localhost-only server.
- Read-only optional Hermes runtime integration.
- Machine-readable `/api/capabilities` endpoint.
- Manual handoff, receipt, source-provenance, and independent-QA protocols.
- Repository audit, secret scan, public-release scan, and build provenance gate.
- Linux and Windows CI plus a minimum-version compatibility gate for Node 20 / Python 3.10.
- Owner-authored PNG character sprite set with provenance manifest.
- Deterministic synthetic multi-agent demo flow.
- Explicit owner approval gate for external writes, paid actions, account changes, and destructive work.
- Dedicated approval queue with pending count, owner decisions, and mission drill-through.
- Dependency-free Runtime Adapter SDK v1 with bounded fail-closed snapshots.
- Public-safe office and approval-flow screenshots with SHA-256 provenance.
- Animated `Meet the Office` README showcase for Praroro, Paijo, Subagjo, Alex, Sumiati, and Siti using the original owner-authored PNG sprites.
- End-to-end boot smoke test covering health, capabilities, runtime fail-closed mode, UI delivery, security headers, canonical character assets, method guards, and clean shutdown.
- Native Hermes profile distributions for all six employees with role-scoped skills.
- Idempotent Hermes bootstrap that installs missing profiles and creates/switches the `nyobakantorai` Kanban board without copying credentials.
- One-command Windows and POSIX installers with explicit opt-in for the official Hermes upstream installer.
- Upstream acknowledgements for Hermes Agent and Pixel Agents.

### Changed
- Restored the canonical owner-authored PNG character sprites for all six employees and removed the temporary generic SVG stand-ins.
- Runtime staging now supports all six public roles.
- Added a cross-platform `npm run doctor` preflight for prerequisites, project integrity, asset manifest, port readiness, and optional Hermes configuration.
- Added a strict loopback HTTP read-only runtime adapter with GET-only/no-credential/no-redirect boundaries and fail-closed tests.
- Machine-specific paths and private workspace assumptions were removed from supported public surfaces.
- External/runtime claims fail closed when identity, state, or freshness cannot be verified.
- Local legacy/private workspace mirrors are explicitly ignored in addition to being blocked by the public-release scanner.
- Hermes auto-discovery can now be explicitly disabled with `NYOBAKANTORAI_DISABLE_HERMES=1`, making standalone/offline behavior deterministic.
- Direct admin shutdown now removes its ephemeral stop token instead of relying on the CLI wrapper for cleanup.
- Windows Hermes auto-discovery now follows the upstream `%LOCALAPPDATA%\hermes` location before the legacy `~/.hermes` fallback.
- Runtime-only preflight no longer requires Python/PyYAML; those remain release/developer requirements.

### Security
- Public release excludes credentials, auth state, runtime databases, logs, receipts, client/user records, and private workstation paths.
- VERIFIED requires independent evidence rather than model or UI claims.
