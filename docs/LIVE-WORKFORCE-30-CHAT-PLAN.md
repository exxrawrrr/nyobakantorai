# Live Workforce — 30-Chat Execution Plan

Status: **PLANNING ONLY**  
Companion PRD: `docs/LIVE-WORKFORCE-MASTER-PRD.md`  
Baseline: published `v0.5.1`  
Execution rule: **do not implement future chats early**

## How to use this plan

The owner can continue implementation by saying the next chat title exactly or approximately. Each chat is intentionally bounded so that repository state, tests, and evidence can be reviewed before proceeding.

Every implementation chat should follow the same operating contract:

1. inspect exact `main` / active branch HEAD;
2. inspect relevant existing modules before inventing new ones;
3. preserve v0.5.1 safety/evidence semantics;
4. implement only the current chat scope;
5. add/update tests for the changed behavior;
6. run targeted verification first, then repository-required CI;
7. commit/push to a recoverable GitHub branch or PR;
8. report exact HEAD, tests, known gaps, and next chat;
9. never create a release tag except in a dedicated release chat;
10. never promote synthetic/demo evidence into real-world proof.

---

## Phase A — v0.6.0 Live Workforce Foundation

### CHAT 01 — v0.6 Baseline Audit + Architecture Lock

Goal: freeze what v0.6 will reuse versus add.

Deliverables:

- exact inventory of task registry, runtime execution adapters, approval, evidence, receipts, routing, office UI, and demo surfaces;
- dependency/boundary map;
- ADR for Mission / TaskNode / Attempt / Evidence / Approval ownership;
- identify packages to reuse and packages that genuinely need creation;
- complexity-budget update for proposed modules;
- no product behavior change yet.

Exit gate:

- architecture review document merged;
- no duplicate mission/task abstraction left unexplained;
- CI green.

### CHAT 02 — Mission Schema + State Machine

Goal: create the canonical versioned Mission and TaskNode contracts.

Deliverables:

- Mission schema;
- TaskNode schema;
- mission/task state transitions;
- invariants for `PARTIAL`, `FAILED`, `SUCCEEDED`, `VERIFIED`, `WAITING_APPROVAL`, `RECOVERED`;
- serialization fixtures;
- invalid transition tests.

Exit gate:

- schemas fail closed;
- old task semantics remain compatible or have explicit migration;
- tests green.

### CHAT 03 — Mission Planner Contract

Goal: turn one objective into an inspectable execution plan without executing it.

Deliverables:

- planner input/output contract;
- deterministic planning fixture;
- employee capability matching interface;
- constraints / required evidence / budget propagation;
- plan preview representation;
- no hidden tool execution.

Exit gate:

- planner can produce a valid plan from canonical fixtures;
- plan clearly records assumptions/unknowns;
- no execution side effects.

### CHAT 04 — Task Graph / DAG Engine

Goal: make mission dependencies and parallelism executable.

Deliverables:

- DAG validation;
- cycle rejection;
- ready-node calculation;
- dependency completion rules;
- parallelizable group calculation;
- cancellation/block propagation;
- graph serialization for UI.

Exit gate:

- adversarial graph tests;
- deterministic ordering where required;
- no task can run before dependencies permit it.

### CHAT 05 — Structured Agent Handoff Bus

Goal: replace canonical free-form inter-agent delegation with typed handoff envelopes.

Deliverables:

- outbound handoff schema;
- result envelope schema;
- artifacts/evidence/unknowns/receipt references;
- capability and budget propagation;
- compatibility adapter for existing manual handoff surfaces;
- schema fuzz/negative tests.

Exit gate:

- canonical execution no longer depends on parsing agent chat to understand delegation;
- malformed handoffs fail closed.

### CHAT 06 — Mission Orchestrator + Parallel Execution

Goal: execute a bounded task graph using existing runtime adapters.

Deliverables:

- orchestrator loop;
- worker dispatch through runtime-neutral adapter;
- bounded concurrency;
- per-task attempt records;
- cancellation and blocked states;
- synthetic end-to-end mission fixture.

Exit gate:

- at least one 3+ node mission completes deterministically;
- parallel branches converge correctly;
- every attempt has provenance.

### CHAT 07 — Model Router

Goal: choose a model/runtime class from explicit policy rather than hardcoded employee-provider pairing.

Deliverables:

- routing policy schema;
- FAST / REASONING / VISION / CODING / LOCAL_SENSITIVE classes;
- provider health input;
- budget/privacy constraints;
- fallback policy;
- route decision receipt/evidence.

Exit gate:

- forbidden privacy fallback is rejected;
- route reason is inspectable;
- no provider choice is inferred from marketing names alone.

### CHAT 08 — Tool / Capability Router

Goal: resolve task capability needs to allowed tools/connectors.

Deliverables:

- task capability requirements;
- connector-state checks;
- employee grant checks;
- read/write distinction;
- target/resource binding;
- approval requirement calculation;
- evidence requirements per action.

Exit gate:

- unauthorized tool route rejected;
- disconnected connector cannot appear executed;
- write routes cannot bypass approval policy.

### CHAT 09 — Cost + Quota Skeleton for Live Missions

Goal: add the minimum cost/quota machinery required before public live AI.

Deliverables:

- per-mission token/tool-call/time ceilings;
- provider/model cost reporting contract;
- unknown-cost handling;
- hard stop behavior;
- public-session quota interface;
- no full Cost Governor UI yet.

Exit gate:

- mission cannot exceed configured hard ceiling silently;
- unknown cost is represented as unknown, not zero.

### CHAT 10 — Live AI Sandbox Runtime

Goal: run a real-model bounded mission in disposable state.

Deliverables:

- temporary workspace contract;
- allowlisted tool surface;
- disposable session lifecycle;
- provider/model disclosure;
- teardown;
- live/synthetic evidence classification;
- no external writes.

Exit gate:

- one real-model bounded mission can run without touching production/user accounts;
- teardown verified;
- secrets absent from evidence.

### CHAT 11 — Public Demo Backend

Goal: expose safe deterministic and live mission endpoints.

Deliverables:

- explicit DEMO vs LIVE mode;
- anonymous session boundaries;
- mission rate limiting;
- bounded live capacity;
- deterministic fallback;
- abuse-safe input limits;
- no login required for deterministic demo.

Exit gate:

- quota exhaustion cannot silently fall through to paid/unbounded provider use;
- live unavailable state offers deterministic demo;
- cross-session state isolation tested.

### CHAT 12 — Public Interactive Web Demo UI

Goal: make first-time visitors understand the project by trying it.

Deliverables:

- `TRY DEMO` and `TRY LIVE AI`;
- mission objective input;
- task-graph visualization;
- employee live states;
- clear synthetic/live labeling;
- failure/unavailable states;
- basic mobile behavior.

Exit gate:

- a new visitor can understand what is happening without reading the README first;
- UI never labels synthetic work as live.

### CHAT 13 — Live Execution Telemetry + Evidence UI

Goal: show what actually happened, not just `WORKING`.

Deliverables:

- employee/model/runtime/tool display;
- timestamps/duration;
- token/cost display;
- artifacts/evidence counters;
- attempt state;
- receipt link/reference;
- unknown/blocker display.

Exit gate:

- every visible terminal state can be traced to canonical execution data;
- UI has no invented progress events.

### CHAT 14 — Siti Verification / Red-Team Engine

Goal: make independent verification operational for live missions.

Deliverables:

- research verification contract;
- code verification contract;
- external-state verification hook;
- contradiction/unknown handling;
- verifier independence guard;
- negative/regression tests.

Exit gate:

- work cannot self-promote to `VERIFIED`;
- unsupported claim produces non-verified result;
- contradiction is surfaced.

### CHAT 15 — v0.6.0 End-to-End Acceptance Mission

Goal: prove the five v0.6.0 headline capabilities work together.

Reference mission:

- one user objective;
- Praroro plan;
- at least 3 role-specific workers;
- at least one parallel branch;
- real model execution;
- safe tools only;
- artifact output;
- Siti verification;
- evidence UI;
- bounded cost/quota;
- no external write.

Exit gate:

- reviewed end-to-end evidence bundle;
- all v0.6.0 acceptance criteria reconciled;
- explicit remaining blockers recorded.

### CHAT 16 — v0.6.0 Release Convergence

Goal: finish v0.6.0 truthfully.

Deliverables:

- changelog/README/roadmap status;
- release readiness ledger;
- cross-platform verify;
- fresh-install check where relevant;
- public demo deployment verification if configured;
- tag/release only if all mandatory gates pass.

Stop condition:

- if evidence is insufficient, release stays blocked; do not manufacture a success claim.

---

## Phase B — v0.6.1 Reliability

### CHAT 17 — Full Cost Governor

Goal: make cost a first-class operational control.

Deliverables:

- per-day / project / mission / employee budgets;
- warning / reroute / stop thresholds;
- approval for budget overage;
- budget dashboard data;
- cost reconciliation tests.

Exit gate:

- configured hard budget cannot be exceeded without approved policy.

### CHAT 18 — Artifact Workspace

Goal: move from chat outputs to versioned production artifacts.

Deliverables:

- artifact registry;
- version/checksum/provenance;
- task/mission ownership;
- verification status;
- safe local storage layout;
- report/data/code/evidence fixture coverage.

Exit gate:

- artifacts survive outside chat history and remain attributable.

### CHAT 19 — Execution Replay

Goal: reconstruct how a mission reached its outcome.

Deliverables:

- canonical event stream;
- timeline renderer/data contract;
- plan/tool/artifact/verification/correction/approval events;
- tamper/missing-event handling;
- replay fixtures.

Exit gate:

- replay derives from canonical records, not generated storytelling.

### CHAT 20 — Checkpoint + Failure Recovery

Goal: stop restarting useful work from zero.

Deliverables:

- checkpoint schema;
- safe resume boundaries;
- bounded retries;
- provider-failure fallback;
- browser/session recovery interface;
- `RETRYING` / `RECOVERED` semantics;
- failure-injection tests.

Exit gate:

- at least one mid-mission failure resumes from checkpoint without duplicating completed work.

### CHAT 21 — Project Brain / Memory 2.0

Goal: make project knowledge useful without breaking profile isolation.

Deliverables:

- private/project/approved-shared scopes;
- decisions/facts/assumptions/failures/artifacts/lessons records;
- provenance/confidence/time/owner;
- promotion flow;
- access-control and contamination tests.

Exit gate:

- one employee cannot silently read another employee's private memory;
- shared memory is attributable.

### CHAT 22 — v0.6.1 Reliability Release Gate

Goal: close reliability milestone.

Deliverables:

- recovery evaluation;
- cost-governor evaluation;
- artifact/replay integrity evaluation;
- memory scope evaluation;
- cross-platform CI;
- release only if evidence supports it.

---

## Phase C — v0.7.0 Connected Office

### CHAT 23 — Connector Center + Grant Model

Goal: establish one canonical lifecycle for external integrations.

Deliverables:

- connector registry/state machine;
- connect/disconnect/revoke/expire semantics;
- per-employee capability grants;
- resource scope;
- read/write separation;
- secret-reference-only handling;
- initial read-only connector integration using an already supported provider where practical.

Exit gate:

- `CONNECTED` does not imply universal access;
- revocation blocks future execution.

### CHAT 24 — Browser Agent + Scheduler + Approval Center 2.0

Goal: give the office hands and recurring work without bypassing governance.

Deliverables:

- browser action/evidence contract;
- scheduler through normal Mission Engine;
- recurring job limits;
- Approval Center with target/budget/evidence/preview;
- approve/edit/reject + scope/expiry;
- at least one read-only recurring mission fixture.

Exit gate:

- scheduler cannot create a privileged bypass path;
- browser mutations remain approval-aware.

### CHAT 25 — Skills Store + Employee Capability Upgrade Pass

Goal: make existing employees modular before adding headcount.

Deliverables:

- skill catalog/install/attach contract;
- skill != permission enforcement;
- version/provenance for skills;
- upgrade loops for Praroro/Alex/Subagjo/Siti/Paijo/Ratri/Nara/Bimo/Fikri and ops/creative/ads roles;
- employee-addition capability-gap rule.

Exit gate:

- no new employee added merely to represent a reusable skill;
- skill installation cannot grant connector authority by itself.

### CHAT 26 — Connected Workflow Live Evidence + v0.7 Gate

Goal: prove connected-office lifecycle on real user-owned systems.

Minimum evidence target:

- two read-only connectors with reviewed live lifecycle;
- one scoped write workflow showing preview -> approval -> execute -> verify;
- connector revocation evidence;
- scheduled mission evidence;
- browser evidence.

Exit gate:

- provider lifecycle claims updated only to the level supported by reviewed evidence.

---

## Phase D — v0.7.1 Geo Intelligence

### CHAT 27 — Geo Intelligence Core + Google Places Policy Layer

Goal: implement compliant discovery before building lead-machine behavior.

Deliverables:

- provider-neutral geo discovery contract;
- Google Places connector;
- explicit FieldMask profiles;
- pricing/SKU policy metadata;
- ephemeral response handling;
- Place ID retention rule;
- attribution/retention policy checks;
- query/area bounds.

Exit gate:

- provider data cannot be stored outside allowed policy by accident;
- no production wildcard FieldMask;
- cost-relevant field selection visible.

### CHAT 28 — Discovery Expansion + Dedupe + Web Enrichment + Verification

Goal: turn incomplete search responses into provenance-aware business research.

Deliverables:

- geographic/keyword query expansion;
- 60-result-per-query constraint handling without completeness claims;
- identity resolution/deduplication;
- website/public-source enrichment;
- source/retrieval-time/confidence records;
- explainable qualification scoring;
- Siti verification;
- CSV/XLSX/report/evidence output.

Exit gate:

- duplicate business observations reconcile to one profile with preserved provenance;
- scoring rationale inspectable;
- report does not claim exhaustive coverage.

### CHAT 29 — Map Missions + Lead Intelligence / CRM Preparation

Goal: convert verified geo research into useful operational datasets.

Deliverables:

- map mission UI/data contract;
- high/medium/low qualification visualization;
- CRM-ready export;
- monitoring/watchlist contract;
- competitor radar / territory-planning bounded workflows;
- outreach drafts only;
- human approval before send/write.

Exit gate:

- no automatic outreach by default;
- map/provider attribution behavior reviewed;
- monitoring respects retention/cost policy.

---

## Phase E — v0.8+ Mission Control to v1.0

### CHAT 30 — Long-Running Mission Control + Team/V1 Evidence Roadmap

Goal: complete the PRD implementation program by establishing the final higher-order architecture and evidence gates, not by falsely declaring production readiness.

Deliverables:

- long-running mission-control contract;
- deeper parallelism + workload balancing;
- bounded adaptive query proposals;
- stronger sandbox isolation plan/implementation selected from repo reality;
- team/multi-user RBAC architecture;
- shared project/approval/audit boundaries;
- v0.8/v0.9 migration plan;
- v1.0 evidence matrix;
- explicit real-world reliability minimums;
- provider/connector lifecycle minimums;
- security/recovery/upgrade acceptance gates;
- release roadmap reconciled with actual completed evidence.

Exit gate:

- every remaining path to v1.0 has a measurable evidence requirement;
- if evidence is still incomplete, v1.0 remains future work rather than being declared complete.

---

## Version mapping

| Chats | Milestone |
| --- | --- |
| 01–16 | v0.6.0 Live Workforce |
| 17–22 | v0.6.1 Reliability |
| 23–26 | v0.7.0 Connected Office |
| 27–29 | v0.7.1 Geo Intelligence + Lead Intelligence foundation |
| 30 | v0.8+ Mission Control / Team / v1.0 evidence architecture |

Important: one chat may discover that a milestone needs additional bounded work. In that case, add a new chat explicitly rather than silently expanding an existing chat beyond reviewable size.

## Stop rule for the current planning task

Once this plan, the master PRD, and the roadmap pointer are merged to GitHub, **stop**. Do not begin CHAT 01 until the owner explicitly asks to start implementation.
