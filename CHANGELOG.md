# Changelog

All notable public changes to nyobakantorai are documented here.

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

### Security
- Public release excludes credentials, auth state, runtime databases, logs, receipts, client/user records, and private workstation paths.
- VERIFIED requires independent evidence rather than model or UI claims.
