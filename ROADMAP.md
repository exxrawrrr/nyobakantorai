# Roadmap

## v0.1 — Portable local-first core
- [x] localhost-only office dashboard
- [x] read-only optional Hermes integration
- [x] evidence-gated task state
- [x] machine-readable capabilities endpoint
- [x] repository, secret, and cross-language test gates

## v0.2 — Public preview
- [x] public-tree privacy scrub
- [x] machine-independent paths and configuration
- [x] owner-authored original character sprites with provenance manifest
- [x] 6 public agent profiles and 16 reusable skills
- [x] manual handoff, source-provenance, and QA receipt protocols
- [x] deterministic synthetic multi-agent demo
- [x] explicit human approval gate for high-impact task classes
- [x] Linux + Windows CI
- [x] automated public-release audit
- [x] end-to-end boot smoke test with security-header and clean-shutdown assertions
- [x] dependency-free read-only Runtime Adapter SDK with fail-closed snapshots
- [ ] migrate Hermes implementation onto the generic adapter interface
- [x] add strict loopback HTTP read-only adapter
- [ ] add CLI-agent adapter
- [ ] normalized execution and cost receipts

## v0.3 — Human-governed orchestration
- [x] dedicated approval-queue view with pending count and owner decisions
- [ ] signed/verifiable execution receipts
- [ ] capability negotiation and policy packs per role
- [ ] pluggable storage with export/import
- [ ] adapter sandboxing and permission-policy extensions

## Non-goals

nyobakantorai will not silently enable autonomous production writes, scrape credentials from local machines, or treat model output as verified evidence.
