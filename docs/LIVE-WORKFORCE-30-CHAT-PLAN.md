# Live Workforce — 30-Chat Execution Plan

Status: **PLANNING ONLY**  
Companion PRD: `docs/LIVE-WORKFORCE-MASTER-PRD.md`  
Baseline: published `v0.5.1`  
Execution rule: **do not implement future chats early**

## How to use this plan

The owner can continue implementation by saying the next chat title. Each chat is a bounded engineering/review unit, not merely a discussion topic.

Every implementation chat follows the same operating contract:

1. inspect exact `main` / active branch HEAD;
2. inspect and reuse relevant existing modules before creating new boundaries;
3. preserve v0.5.1 evidence, approval, receipt, privacy, and release semantics;
4. implement only the current chat scope;
5. add/update tests for changed behavior;
6. run targeted verification first, then repository-required CI;
7. commit/push to a recoverable GitHub branch or PR;
8. report exact HEAD, tests, blockers, and next chat;
9. create release tags only in dedicated release chats;
10. never promote synthetic/demo evidence into real-world proof.

---

## Phase A — v0.6.0 Live Workforce

### CHAT 01 — v0.6 Baseline Audit + Architecture Lock

**Status: ✅ COMPLETED — 2026-10-01.**  
Architecture review: `docs/V0.6-ARCHITECTURE-LOCK.md`  
ADR: `docs/ADR-0001-LIVE-WORKFORCE-DOMAIN-OWNERSHIP.md`

Goal: freeze what v0.6 reuses versus adds.

Deliverables:
- inventory task registry, runtime adapters, approval, evidence, receipts, routing, office UI, and demo surfaces;
- dependency/boundary map;
- ADR for Mission / TaskNode / Attempt / Evidence / Approval ownership;
- proposed package list with complexity/delete-test justification;
- no behavior change.

Exit gate: architecture review merged, no unexplained duplicate task/mission abstraction, CI green.

### CHAT 02 — Mission Schema + Execution State Machine

Goal: define versioned Mission, TaskNode, and Attempt contracts.

Deliverables:
- schemas and fixtures;
- legal/illegal state transitions;
- explicit `PLANNED`, `READY`, `RUNNING`, `WAITING_APPROVAL`, `BLOCKED`, `PARTIAL`, `FAILED`, `RETRYING`, `RECOVERED`, `SUCCEEDED`, `VERIFIED`, `CANCELLED` semantics;
- migration/compatibility decision for current task objects;
- negative transition tests.

Exit gate: schemas fail closed and current v0.5 task truth is preserved.

### CHAT 03 — Mission Planner + Task Graph

Goal: turn one objective into an inspectable DAG without executing it.

Deliverables:
- planner contract;
- employee capability matching interface;
- constraints/evidence/budget propagation;
- dependency graph;
- cycle rejection;
- parallelizable-node calculation;
- plan preview fixture.

Exit gate: deterministic fixtures produce valid acyclic plans with assumptions/unknowns visible.

### CHAT 04 — Handoff Bus + Mission Orchestrator

Goal: execute the DAG through typed employee handoffs.

Deliverables:
- outbound/return handoff envelopes;
- artifacts/evidence/unknowns/receipt references;
- runtime-neutral dispatch;
- bounded concurrency;
- cancellation/block propagation;
- attempt provenance;
- compatibility bridge to existing handoff surfaces.

Exit gate: a 3+ node synthetic mission including parallel work completes without parsing free-form chat as canonical control state.

### CHAT 05 — Model Router

Goal: route task classes to allowed model/runtime choices.

Deliverables:
- FAST / REASONING / VISION / CODING / LOCAL_SENSITIVE policy classes;
- latency/budget/privacy/context/provider-health inputs;
- fallback rules;
- route-decision evidence;
- forbidden privacy fallback tests.

Exit gate: sensitive-local work cannot silently fail over to cloud and every route is inspectable.

### CHAT 06 — Tool / Capability Router

Goal: resolve task capability needs to allowed tools/connectors.

Deliverables:
- connector-state checks;
- per-employee grants;
- target/resource scope;
- read/write distinction;
- autonomy + approval calculation;
- evidence requirements per action.

Exit gate: disconnected/unauthorized tools cannot appear executed and write routes cannot bypass approval.

### CHAT 07 — Live Sandbox + Minimum Cost/Quota Guard

Goal: make real-model execution safe enough for bounded live use.

Deliverables:
- per-mission temporary workspace;
- tool/network allowlists;
- duration/tool-call/token ceilings;
- provider/model disclosure;
- cost-known/unknown semantics;
- teardown;
- no external writes;
- no hidden paid fallback.

Exit gate: one bounded real-model task runs in disposable state, teardown is verified, and hard ceilings fail closed.

### CHAT 08 — Public Interactive Demo Backend + UI

Goal: expose `TRY DEMO` and `TRY LIVE AI` as clearly different experiences.

Deliverables:
- deterministic no-login demo path;
- bounded live mission endpoint;
- anonymous-session isolation;
- rate/quota controls;
- mission input;
- task-graph/employee visualization;
- synthetic/live labels;
- live-unavailable fallback to deterministic demo;
- basic mobile behavior.

Exit gate: first-time visitor can run demo safely and the UI never labels synthetic work as live.

### CHAT 09 — Execution Telemetry + Evidence UI

Goal: replace vague `WORKING` status with inspectable execution facts.

Deliverables:
- employee/model/runtime/tool;
- timestamps/duration;
- token/cost counters;
- attempt state;
- artifacts/evidence;
- receipts;
- unknowns/blockers;
- terminal-state traceability.

Exit gate: every visible terminal state comes from canonical data; no invented progress events.

### CHAT 10 — Siti Verification / Red-Team Engine

Goal: operationalize independent verification.

Deliverables:
- research claim/source checks;
- code regression/negative checks;
- external-state verification hook;
- contradiction/unknown reporting;
- verifier independence guard;
- self-verification rejection.

Exit gate: unsupported output cannot become `VERIFIED`; contradictions remain visible.

### CHAT 11 — v0.6.0 End-to-End Acceptance Mission

Goal: prove the headline workflow as one bounded mission.

Reference acceptance mission includes:
- one user objective;
- Praroro plan;
- 3+ specialized workers;
- parallel branch;
- real model execution;
- safe tools;
- artifact output;
- Siti verification;
- evidence UI;
- cost/quota enforcement;
- no external write.

Exit gate: reviewed evidence bundle reconciles every v0.6.0 acceptance criterion and records remaining blockers.

### CHAT 12 — v0.6.0 Release Convergence

Goal: release only what the evidence supports.

Deliverables:
- README/changelog/roadmap update;
- readiness ledger;
- Linux/Windows/minimum-version CI;
- fresh-install checks where relevant;
- public demo deployment verification if configured;
- tag/release only after mandatory gates.

Stop condition: insufficient evidence keeps the release blocked.

---

## Phase B — v0.6.1 Reliability

### CHAT 13 — Full Cost Governor

Goal: make spend an operational control rather than telemetry only.

Deliverables:
- per-day/project/mission/employee budgets;
- warning/reroute/stop thresholds;
- approval-required overage;
- model/tool/provider cost ledger;
- reconciliation and unknown-cost tests.

Exit gate: configured hard budgets cannot be exceeded silently.

### CHAT 14 — Artifact Workspace + Execution Replay

Goal: turn outputs and history into durable production records.

Deliverables:
- artifact registry with ID/version/checksum/provenance;
- mission/task ownership;
- report/data/code/image/evidence artifact fixtures;
- canonical replay event stream;
- timeline reconstruction;
- tamper/missing-event handling.

Exit gate: artifacts survive outside chat history and replay derives from canonical records, not generated narration.

### CHAT 15 — Checkpoint + Failure Recovery

Goal: resume useful work after bounded failures.

Deliverables:
- checkpoint schema;
- safe resume boundaries;
- bounded retries;
- provider fallback under policy;
- browser/session recovery interface;
- `RETRYING`/`RECOVERED` semantics;
- failure-injection tests.

Exit gate: a mid-mission failure resumes without duplicating already-completed work.

### CHAT 16 — Project Brain / Memory 2.0

Goal: create useful project knowledge while preserving memory isolation.

Deliverables:
- PRIVATE / PROJECT / APPROVED_SHARED scopes;
- decisions/facts/assumptions/failures/preferences/terminology/artifacts/lessons records;
- source/confidence/time/owner/provenance;
- promotion flow;
- contamination/access tests.

Exit gate: private profile memory cannot leak into another employee and shared memory remains attributable.

### CHAT 17 — v0.6.1 Reliability Release Gate

Goal: close the reliability milestone.

Deliverables:
- recovery evaluation;
- cost-governor evaluation;
- artifact/replay integrity evaluation;
- memory-scope evaluation;
- cross-platform verification;
- release only if evidence supports it.

---

## Phase C — v0.7.0 Connected Office

### CHAT 18 — Connector Center + Least-Privilege Grants

Goal: establish a canonical external-integration lifecycle.

Deliverables:
- connector registry/state machine;
- connect/disconnect/revoke/expire;
- employee + capability + resource grants;
- read/write scopes;
- secret-reference-only handling;
- at least one practical read-only connector using an already supported provider where possible.

Exit gate: `CONNECTED` never means universal access and revocation blocks future use.

### CHAT 19 — Browser Agent

Goal: give employees browser hands with observable evidence.

Deliverables:
- read vs mutation action contract;
- navigation/action evidence;
- public research flow;
- user-owned-site audit flow;
- localhost QA/reproduction flow;
- prompt/tool-injection boundaries;
- disposable browser profile handling.

Exit gate: browser mutations are distinguishable, approval-aware, and independently auditable.

### CHAT 20 — Scheduler + Approval Center 2.0

Goal: support recurring work without creating a governance bypass.

Deliverables:
- recurring missions through normal Mission Engine;
- cadence/time/budget limits;
- morning briefing fixture;
- approval UI/data contract with target/risk/budget/reason/evidence/preview;
- approve/edit/reject + scope/expiry.

Exit gate: scheduled work obeys the same evidence/cost/approval rules as interactive work.

### CHAT 21 — Skills Store + 16-Employee Capability Upgrade

Goal: make the current workforce modular and more capable before adding headcount.

Deliverables:
- skill catalog/install/attach/version/provenance;
- skill != permission enforcement;
- capability-loop upgrades for all 16 roles;
- employee-addition capability-gap rule;
- no self-granted tools/permissions.

Exit gate: reusable skills extend existing employees without implicitly granting connector authority.

### CHAT 22 — Connected Workflow Live Evidence + v0.7.0 Release

Goal: prove real connected-office lifecycle.

Minimum evidence target:
- two read-only user-owned connectors with reviewed live lifecycle;
- one scoped write flow showing preview -> approval -> execute -> verify;
- connector revocation evidence;
- scheduled mission evidence;
- browser evidence;
- provider-lifecycle claim updated only to supported level.

Exit gate: v0.7.0 release gates pass or release remains blocked.

---

## Phase D — v0.7.1 Geo Intelligence

### CHAT 23 — Geo Core + Google Places Policy Layer

Goal: build compliant provider-aware discovery before lead-machine behavior.

Deliverables:
- provider-neutral geo discovery contract;
- Google Places connector;
- explicit FieldMask profiles;
- pricing/SKU policy metadata;
- ephemeral response handling;
- Place ID retention rule;
- attribution/retention checks;
- query/area bounds.

Exit gate: production wildcard field masks are rejected and provider data cannot be stored outside configured policy by accident.

### CHAT 24 — Search Expansion + Dedupe + Web Enrichment + Siti Verification

Goal: produce provenance-aware business profiles from incomplete discovery.

Deliverables:
- bounded geography/keyword expansion;
- no completeness claim from single-query search;
- identity resolution/deduplication;
- website/public-source enrichment;
- source/retrieval/confidence records;
- explainable/versioned scoring;
- Siti verification;
- CSV/XLSX/report/evidence pack.

Exit gate: duplicates reconcile with provenance preserved and scoring rationale is inspectable.

### CHAT 25 — Map Missions + CRM-Ready Lead Intelligence

Goal: turn verified geo research into operationally useful datasets.

Deliverables:
- map mission data/UI;
- qualification visualization;
- CRM-ready export;
- watchlist/change-monitor contract;
- competitor radar;
- territory-planning bounded workflow;
- outreach drafts only;
- approval boundary before send/write.

Exit gate: map attribution reviewed, monitoring respects retention/cost policy, no automatic outreach by default.

### CHAT 26 — v0.7.1 Geo Release Gate

Goal: prove Geo Intelligence without presenting it as exhaustive or policy-free scraping.

Deliverables:
- real bounded geo mission;
- cost/field-mask evidence;
- retention/attribution audit;
- dedupe/enrichment/verification evidence;
- cross-platform CI;
- release claims scoped to observed coverage.

Exit gate: release passes or remains blocked; no exhaustive-coverage claim.

---

## Phase E — v0.8.0 Lead Intelligence

### CHAT 27 — Prospecting Loop + Monitoring + CRM Workflow

Goal: complete the Lead Intelligence loop on user-owned workflows.

Deliverables:
- DISCOVER -> ENRICH -> SCORE -> VERIFY -> LEARN -> bounded query proposal loop;
- proposal review before adaptive search changes;
- CRM state model;
- qualified lead lifecycle;
- competitor monitoring;
- territory monitoring;
- outreach draft generation;
- human approval for external communication;
- v0.8.0 release gate.

Exit gate: adaptive behavior is bounded/auditable, CRM data is attributable, and outreach remains approval-gated.

---

## Phase F — v0.8.1 Mission Control

### CHAT 28 — Long-Running Mission Control + Sandbox Hardening

Goal: support larger autonomous objectives without removing boundaries.

Deliverables:
- long-running mission controller;
- deeper parallel execution;
- workload/queue balancing;
- checkpoint-aware rerouting;
- bounded adaptive planning;
- explicit escalation/stop conditions;
- stronger isolation implementation selected from repo reality (filesystem/browser/network/resource/credential boundaries);
- security/failure-recovery evaluation;
- v0.8.1 release gate.

Exit gate: long-running missions remain stoppable, inspectable, budgeted, recoverable, and permission-scoped.

---

## Phase G — v0.9.0 Team Office

### CHAT 29 — Multi-User Projects + RBAC + Shared Audit

Goal: move from one owner/operator to a governed team workspace.

Deliverables:
- human user/team identity;
- project membership;
- RBAC;
- approval ownership/delegation;
- workspace-scoped connectors;
- workspace budgets;
- collaboration-safe project memory;
- shared artifact/evidence access rules;
- immutable/shared audit history;
- multi-user threat model;
- v0.9.0 release gate.

Exit gate: one user's authority/data cannot silently bleed into another user's scope.

---

## Phase H — v1.0.0 Production Workforce

### CHAT 30 — Production Evidence Convergence + v1.0 Release

Goal: decide whether the project has actually earned `v1.0.0`.

Required work:
- reconcile real-world workflow dataset against the minimum evidence threshold defined by reviewed release policy;
- reconcile provider/connector lifecycle maturity;
- evaluate recovery/failure rates across representative missions;
- security review of connector grants, sandboxing, memory, replay, artifacts, and team boundaries;
- upgrade/migration/fresh-install matrix;
- release-claim audit;
- documentation and operator runbooks;
- exact-main Linux/Windows/minimum-version verification;
- manual release gate;
- immutable tagged-asset verification;
- post-release install smoke.

Decision rule:
- if evidence meets v1.0 criteria -> publish v1.0.0 and seal post-release state;
- if evidence does not meet criteria -> record exact blockers and keep the highest truthful pre-1.0 version.

v1.0 is **evidence-gated, not schedule-gated**.

---

## Version mapping

| Chats | Milestone |
| --- | --- |
| 01–12 | v0.6.0 Live Workforce |
| 13–17 | v0.6.1 Reliability |
| 18–22 | v0.7.0 Connected Office |
| 23–26 | v0.7.1 Geo Intelligence |
| 27 | v0.8.0 Lead Intelligence |
| 28 | v0.8.1 Mission Control |
| 29 | v0.9.0 Team Office |
| 30 | v1.0.0 evidence convergence / release decision |

Important: implementation reality may require an extra bounded chat. If that happens, add it explicitly through a plan update rather than silently expanding a chat beyond reviewable size.

## Stop rule for the current planning task

Once this plan, the master PRD, and the roadmap pointer are merged to GitHub, **stop**. Do not begin CHAT 01 until the owner explicitly asks to start implementation.
