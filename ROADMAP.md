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
- [x] explicit stable-promotion decision recorded — owner accepted the six deferred evidence classes for v0.4.0 scope on 2026-09-30; final `main` verify + manual release-gate remain mandatory before tagging

## v0.5 — Proof Over Machinery

- [x] machine-readable runtime portability map with zero unresolved/Hermes-shaped architectural surfaces
- [x] runtime-neutral execution contract plus Hermes and Codex reference adapters
- [x] immutable canonical Siti reference-case bundle and comparator
- [x] bounded live reference-run harness with explicit confirmation, no auto-install/login, temporary workspace, and public-safety scan
- [x] qualifying canonical Hermes live reference evidence
- [x] qualifying canonical Codex live reference evidence under the reviewed bounded execution policy
- [x] comparator reaches `PORTABILITY_VERIFIED_FOR_REFERENCE_CASE`
- [x] v0.5 `LIVE_RUNTIME_EVIDENCE` growth promoted to `INCREASED` from qualifying reference evidence
- [x] independent Python reference verifier plus Node/Python adversarial differential corpus
- [x] receipt trust registry with ACTIVE/RETIRED/REVOKED, rotation, revocation, and compromise semantics
- [x] immutable stable-install material with manifest/checksum/exact-source verification and no mutable-main fallback
- [x] anomaly-first approval oversight with untrusted agent prose excluded from safety decisions
- [x] machine-readable evidence classification and fail-closed behavioral-claim mapping
- [x] multidimensional maturity model
- [x] executable complexity budget and delete test
- [x] pruning pass merged the redundant deferred-evidence package boundary into release-claims
- [x] final convergence moved surviving requirements into permanent readiness/roadmap surfaces and retired the temporary implementation PRD
- [ ] real-world baseline remains `COLLECTING 1/20` — do not claim demonstrated
- [ ] provider lifecycle remains `partial` — do not claim validated
- [x] bump package/release metadata to `0.5.1` after preserving the failed immutable `v0.5.0` publication attempt
- [x] explicit readiness ledger reaches `READY`
- [x] promote reviewed candidate through PR to `main`
- [x] exact promoted-`main` Linux/Windows/minimum-version verify + manual release gate
- [x] publish `v0.5.1` after PR CI, exact-main verify #578, manual release-gate `36811702004`, fresh-clone require-ready, and tagged asset verification `36812543303` all passed

Permanent readiness source: `docs/V0.5-RELEASE-READINESS.md` + `config/v0.5-release-readiness.json`.

## v0.6+ — Live Workforce

Planning source of truth:

- [Live Workforce Master PRD](docs/LIVE-WORKFORCE-MASTER-PRD.md)
- [Live Workforce 30-Chat Execution Plan](docs/LIVE-WORKFORCE-30-CHAT-PLAN.md)
- [v0.6 Architecture Lock](docs/V0.6-ARCHITECTURE-LOCK.md)
- [ADR-0001 Live Workforce Domain Ownership](docs/ADR-0001-LIVE-WORKFORCE-DOMAIN-OWNERSHIP.md)

Execution progress:

- [x] CHAT 01 — baseline audit + architecture lock; canonical task domain stays `packages/task-registry`, Mission becomes an orchestration layer, existing approval/evidence/runtime/capability boundaries are reused.
- [x] CHAT 02 — Mission/TaskNode/Attempt v1 schemas + state machines + legacy migration projection; no Mission execution yet. See [v0.6 Mission Contracts](docs/V0.6-MISSION-CONTRACTS.md).
- [x] CHAT 03 — deterministic Mission Planner + validated DAG + worker routing + propagation + explicit assumptions/unknowns; still planning-only. See [v0.6 Mission Planner](docs/V0.6-MISSION-PLANNER.md).
- [x] CHAT 04 — typed handoff envelopes + bounded runtime-neutral DAG orchestration + Attempt provenance + dependency/failure/cancel propagation. See [v0.6 Mission Orchestrator](docs/V0.6-MISSION-ORCHESTRATOR.md).
- [x] CHAT 05 — deterministic provider-neutral Model Router with privacy/locality, health, budget, context, latency, fallback and route-evidence enforcement. See [v0.6 Model Router](docs/V0.6-MODEL-ROUTER.md).
- [x] CHAT 06 — capability action policy with exact employee/resource grants, READ/WRITE distinction, connection + approval evidence and Attempt route-ref propagation. See [v0.6 Capability Policy](docs/V0.6-CAPABILITY-POLICY.md).
- [x] CHAT 07 — Live Sandbox implemented, verified, and closed for repository delivery. CHAT 07B traced the current Codex status-1 failure to external provider quota exhaustion, not an adapter/sandbox regression. The quota limitation remains documented but is not a repository-development blocker. See [v0.6 Live Sandbox](docs/V0.6-LIVE-SANDBOX.md) and [Codex Runtime Diagnosis](docs/V0.6-CODEX-RUNTIME-DIAGNOSIS.md).
- [x] CHAT 08 — Public Interactive Demo Backend + UI implemented and verified: deterministic no-login demo, isolated anonymous sessions, bounded quotas, visible task graph/employee routing, strict synthetic/live labels, and fail-closed LIVE fallback. The localhost office does not currently inject an arbitrary-mission live runner. See [v0.6 Public Interactive Demo](docs/V0.6-PUBLIC-INTERACTIVE-DEMO.md).
- [x] CHAT 09 — Execution Telemetry + Evidence UI implemented and verified. Canonical Attempt state, runtime/model/tool/usage/evidence/receipt/unknown/blocker projections are visible without inventing progress or converting unknown usage to zero; public live success now requires canonical Attempt traceability. See [v0.6 Execution Telemetry](docs/V0.6-EXECUTION-TELEMETRY.md).
- [x] CHAT 10 — Siti Verification / Red-Team Engine implemented, independently gated, and verified. Research/code/external-state reviews use the canonical evidence-verifier and Task/Mission VERIFIED transitions; unsupported or contradictory output cannot be promoted to VERIFIED. See [v0.6 Siti Verification](docs/V0.6-SITI-VERIFICATION.md).
- [x] CHAT 11 — v0.6.0 End-to-End Acceptance Mission completed as an evidence evaluation. Deterministic mission reached VERIFIED and 9/11 criteria passed; fresh current-commit Codex and Hermes attempts remained UNVERIFIED_RUNTIME_ATTEMPT, so REAL_MODEL_EXECUTION and COST_QUOTA_ENFORCEMENT stay blocked for CHAT 12 release convergence. See [v0.6 E2E Acceptance](docs/V0.6-E2E-ACCEPTANCE.md).
- [x] CHAT 12 — v0.6.0 Release Convergence completed. Readiness is machine-readable and BLOCKED at 9/11 acceptance; cross-platform PR verification and all four fresh-install matrices pass; package version remains 0.5.1 and no v0.6.0 tag/release is authorized or created. See [v0.6 Release Convergence](docs/V0.6-RELEASE-CONVERGENCE.md).
- [x] CHAT 13 — Full Cost Governor implemented and verified: per-day/project/mission/employee hard budgets, warning/reroute/approval/stop thresholds, canonical approval escalation, provider/model/tool ledger, UNKNOWN-cost fail-closed semantics, and post-execution reconciliation. Configured hard budgets cannot be exceeded silently. See [v0.6.1 Cost Governor](docs/V0.6.1-COST-GOVERNOR.md).
- [x] CHAT 14 — Artifact Workspace + Execution Replay implemented and verified: immutable checksumed artifact versions, Mission/Task/Attempt ownership, report/data/code/image/evidence fixtures, durable directory storage + portable bundles, canonical hash-chained replay, deterministic timeline reconstruction, and fail-closed tamper/missing-event handling. Artifacts survive outside chat history and replay derives from canonical records. See [v0.6.1 Artifact Workspace + Replay](docs/V0.6.1-ARTIFACT-WORKSPACE-REPLAY.md).
- [x] CHAT 15 — Checkpoint + Failure Recovery implemented and verified: checksumed recovery checkpoints, safe resume boundaries, bounded retries/cycles, policy-gated provider fallback, browser fresh-session recovery, durable Artifact Workspace checkpoint persistence, and canonical RETRYING/RECOVERED orchestration. Mid-Mission recovery resumes without re-executing completed work. See [v0.6.1 Checkpoint + Recovery](docs/V0.6.1-CHECKPOINT-RECOVERY.md).
- [x] CHAT 16 — Project Brain / Memory 2.0 implemented and verified: PRIVATE / PROJECT / APPROVED_SHARED records, eight attributable knowledge classes, content-addressed immutable records, explicit scope promotion, exact access grants, expiration/retention enforcement, durable local storage, and fail-closed contamination/lineage checks. See [v0.6.1 Project Brain](docs/V0.6.1-PROJECT-BRAIN.md).
- [x] CHAT 17 — v0.6.1 Reliability Release Gate completed: Cost Governor, Artifact/Replay, Checkpoint/Recovery, and Project Brain reliability verdict is PASS; publication remains BLOCKED because prerequisite v0.6.0 readiness is still BLOCKED on REAL_MODEL_EXECUTION and COST_QUOTA_ENFORCEMENT. Package version remains 0.5.1 and no v0.6.1 tag/release is authorized. See [v0.6.1 Reliability Release Gate](docs/V0.6.1-RELIABILITY-RELEASE-GATE.md).
- [x] CHAT 18 — Connector Center + Least-Privilege Grants implemented and verified: canonical connector lifecycle, connect/disconnect/revoke/expire, secret-reference-only auth, exact employee/capability/action/resource grants, fail-closed stale-history handling, Capability Router double-boundary integration, and practical deterministic Google Ads read-only connector. `CONNECTED` alone grants nothing and revocation blocks future use. See [v0.7 Connector Center](docs/V0.7-CONNECTOR-CENTER.md).
- [x] CHAT 19 — Browser Agent implemented and verified: explicit READ/MUTATION action contract, exact-origin public research/user-owned audit/localhost QA scopes, Connector Center + Capability Router double-route enforcement, page/tool-injection mutation blocking, disposable browser profiles, content-addressed navigation/action evidence, and approval-aware pre/receipt/post mutation records. See [v0.7 Browser Agent](docs/V0.7-BROWSER-AGENT.md).
- [x] CHAT 20 — Scheduler + Approval Center 2.0 implemented and verified: timezone-aware recurring schedules materialize only through the normal Mission Engine, Cost Governor ALLOW/WARN admission is required, Morning Briefing fixture is contract-locked, and Approval Center v2 exposes target/risk/budget/reason/evidence/preview with owner-only approve/edit/reject, exact scope, expiry, and point-of-use revalidation. See [v0.7 Scheduler + Approval Center 2.0](docs/V0.7-SCHEDULER-APPROVAL-CENTER.md).

Planned release sequence:

- `v0.6.0` — Live Workforce: public demo, live AI sandbox, Mission Engine, model/tool routing, Siti verification/evidence UI;
- `v0.6.1` — Reliability: cost governor, artifact workspace, replay, checkpoint/recovery, Project Brain;
- `v0.7.0` — Connected Office: connector grants, browser, scheduler, Approval Center 2.0, skills store, connected-workflow evidence;
- `v0.7.1` — Geo Intelligence: policy-aware Places discovery, dedupe, enrichment, verification, map missions;
- `v0.8+` — Lead Intelligence and Mission Control;
- `v0.9.0` — Team / multi-user office;
- `v1.0.0` — evidence-gated Production Workforce.

These are **planned milestones, not completed claims**. The implementation plan intentionally begins with existing v0.5.1 foundations and preserves current evidence, approval, release-integrity, and maturity boundaries.

## Non-goals

nyobakantorai will not silently enable autonomous production writes, scrape credentials from local machines, or treat model output as verified evidence.
