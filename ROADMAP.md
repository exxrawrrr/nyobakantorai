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
- [x] native Hermes profile distributions + idempotent six-agent bootstrap
- [x] one-command Hermes-first installers for Windows and POSIX
- [x] migrate the office's direct Hermes reader fully onto the generic adapter interface
- [x] add strict loopback HTTP read-only adapter
- [x] add CLI-agent adapter
- [x] normalized execution and cost receipts

## v0.3 — Real AI Workforce
- [x] dedicated approval-queue view with pending count and owner decisions
- [x] canonical workforce registry with 16 specialized employees
- [x] native Hermes profile distributions and dynamic bootstrap
- [x] deterministic role routing and workforce doctor
- [x] provider-neutral Meta/Google Ads capability contracts
- [x] OBSERVE / GUARDED / DELEGATED autonomy model
- [x] v0.2 → v0.3 state-preserving upgrade path
- [x] Telegram / multi-profile gateway path documented
- [x] safe custom employee generator
- [x] 16-person office with provenance-honest placeholder visuals
- [x] signed/verifiable execution receipts
- [ ] live provider adapters for ads capabilities
- [ ] original character art for the ten v0.3 workers
- [ ] pluggable storage with export/import — adapter + integrity-checked portable bundle core implemented; office/UI wiring and migration path still pending
- [x] application-level adapter sandboxing and permission-policy extensions (not OS isolation)


## v0.4 — Modular Workforce
- [x] distinct machine-readable dialogue fingerprints for all 16 baseline employees
- [x] personality guardrails + deterministic 16-worker policy-invariance benchmark that never overrides approval, evidence, or verification
- [x] arbitrary employee subset selection + reusable workforce presets
- [x] selective Hermes bootstrap and Windows/POSIX installer flags
- [x] standalone employee pack builder with skill closure, optional-integration metadata, provenance, and SHA-256 checksums
- [x] tagged-release pipeline for one downloadable ZIP per employee + SHA256SUMS
- [x] Fikri upgraded to Knowledge / Markdown / Context / Prompt Engineer
- [x] source-preserving L0/L1/L2 context + prompt compiler procedure
- [x] M0–M4 memory/learning policy with repository-PR-only canonical skill mutation
- [x] expanded pinned upstream provenance and role-scoped optional integration catalog
- [x] provider-neutral contracts for repository packing, experimental compression, browser operation, Lighthouse, and Polars
- [x] static cross-harness skill packaging tests: Agent Skills core + Hermes + Codex CLI + Gemini CLI + GitHub Copilot
- [x] cross-harness self-service activation/execution probe runner for Hermes/Codex/Gemini/Copilot: disposable probe skill, exact protected atoms, isolated temporary workspace, bounded evidence, no auto-install/login
- [ ] canonical live cross-harness activation/execution parity before claiming broad behavioral portability — historical readiness remains UNPROVEN until reviewed live user runs are intentionally promoted
- [x] local profile learning read/export/delete isolation with explicit M3 scope + cross-profile contamination guards
- [x] fail-closed provider evaluation contracts for browser + memory candidates
- [x] Cognee self-service HTTP adapter + isolated eight-case memory runner: random run-owned datasets, profile isolation/negative contamination, exact roundtrip/provenance/export/delete checks, secret pre-write rejection, explicit shared promotion boundary, verified cleanup, no auto-install/login/key mint
- [ ] Cognee canonical live memory-provider evaluation — self-service runner is implemented and deterministically verified, but no reviewed user/provider live result has been committed; canonical status remains NOT_RUN / UNPROVEN
- [x] Browser Use self-service adapter + isolated six-case runner: pinned CLI contract, disposable loopback target, temporary CDP profile, server-side mutation/auth evidence, timeout/partial recovery, zero auto-install/login
- [ ] Playwright MCP vs Browser Use reliability/evidence/recovery benchmark — Playwright MCP controlled live run is EVALUATED_CANDIDATE (6/6, zero false-success, no writes/auth leakage, truthful timeout/partial recovery); Browser Use canonical live provider/agent result remains NOT_RUN / UNPROVEN until a user intentionally runs and commits reviewed evidence, so head-to-head comparison stays open
- [x] deterministic synthetic Fikri context-guard regression benchmark: token reduction + protected-atom/required-fact recall
- [x] deterministic adversarial policy/recovery benchmark with zero-false-success gate
- [x] live Fikri context-compaction benchmark on controlled synthetic fixtures: 41.10% average reduction, 100% protected/source fidelity, 5/5 blind downstream pass; real-task generalization remains separate
- [x] real-task dataset schema + anti-synthetic publication gate
- [x] self-service hash-chained Real Task Recorder / Collector with direct-source attestation, independent verification, tamper detection, local user-owned storage, and baseline export
- [x] Unified Provider Doctor for Hermes/Codex/Gemini/Copilot/Cognee/Browser Use/Playwright with zero-install/read-only detection and no credential-value output
- [x] fail-closed real-task baseline collection/audit/merge/prepare tooling with duplicate-source rejection, semantic consistency checks, immutable canonical dataset, and explicit no-auto-publish boundary
- [ ] real-task evaluation dataset and published baseline comparison — COLLECTING 1/20 eligible direct owner tasks, 19 remaining; tooling is complete but evidence cannot be manufactured
- [x] release convergence: permanent decision record, README/changelog/release-doc claim audit, and temporary PRD/workplan retirement
- [x] one-worker isolated fresh-install matrix: empty temporary Hermes profile home -> Siti only -> verified pack -> native-upgrade rerun -> user-owned state preserved -> no unrelated profiles; deterministic simulation only, not a real Hermes/provider machine claim
- [x] subset isolated fresh-install matrix: engineering preset (Subagjo + Siti + Bimo), exact per-worker skill/integration isolation, preview-before-destructive selective uninstall, Bimo-only removal, survivor byte-integrity
- [x] full-workforce isolated fresh-install matrix: every canonical employee pack verified, exact 16-profile registry parity, exact per-worker skill/integration closure, native-upgrade rerun for all profiles, user-owned state preserved across every profile, no extra/missing profile or pack directory
- [x] deterministic full-workforce upgrade/uninstall/reinstall lifecycle matrix: 16-profile existing install -> native-upgrade refresh with user-state preservation -> previewed selective removal -> previewed/confirmed full uninstall -> clean 16-profile reinstall -> native-upgrade rerun; no real Hermes/provider machine claim
- [ ] final real clean-machine Hermes coverage
- [ ] explicit stable promotion to `main` + final main-based release gate — HOLD until deferred evidence scope is re-approved

## Non-goals

nyobakantorai will not silently enable autonomous production writes, scrape credentials from local machines, or treat model output as verified evidence.
