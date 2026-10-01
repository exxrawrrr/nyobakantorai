# Live Workforce Master PRD

Status: **PLANNING ONLY — no implementation is authorized by this document**  
Owner: repository owner  
Created: 2026-10-01  
Baseline: `v0.5.1`  
Target horizon: `v0.6.0` through `v1.0.0`

## 1. Executive summary

`v0.5.1` hardened the proof, integrity, release, evidence, approval, and portability foundations. The next product step is not to add more decorative agents; it is to make the existing workforce perform visible, bounded, evidence-backed work.

The working name for this direction is **LIVE WORKFORCE**.

The intended user experience is:

```text
user objective
  -> mission
  -> plan
  -> task graph
  -> role-scoped execution
  -> tools / models / connectors
  -> artifacts + evidence
  -> independent verification
  -> human approval when required
  -> final result / replay / audit
```

The project must continue to preserve the core truth boundary already established by the repository:

```text
configured != connected
connected != executed
executed != succeeded
succeeded != verified
```

`LIVE WORKFORCE` is successful only if more real work happens **without weakening those semantics**.

## 2. Current baseline

The implementation starts from the published `v0.5.1` baseline, not from a blank architecture.

Already present and reusable:

- canonical 16-employee workforce registry;
- SOUL / skill / tool / MCP / profile separation;
- installable one-worker, subset, preset, and full-workforce packs;
- evidence-gated task state;
- human approval policy for high-impact actions;
- signed execution receipts and independent verification paths;
- runtime-neutral execution contracts and Hermes/Codex reference adapters;
- memory isolation and explicit shared-memory promotion concepts;
- browser/provider evaluation scaffolding;
- public-release integrity, immutable stable installers, checksums, and release gates;
- explicit multidimensional maturity and claim boundaries.

Still intentionally incomplete at baseline:

- real-world workflow evidence remains `COLLECTING` and is not broad reliability proof;
- provider lifecycle remains `partial`; 
- several external connectors are declared but not live-account verified;
- application-level isolation is not an OS/container sandbox;
- ten worker visuals still use pending-original-art placeholders;
- the current office is not yet a long-running autonomous-company system.

## 3. Product problem

The repository has strong machinery for truth, evidence, roles, and safety, but the user experience still requires too much interpretation. A new user can understand that the office is careful, but cannot yet open it and immediately watch a useful multi-agent mission run from objective to artifact.

The product gap is therefore:

**turn the existing proof/safety machinery into an obvious, useful, interactive work experience.**

## 4. Product vision

A user opens the office, enters an objective, sees the system construct a bounded mission, watches specialized employees perform their parts, receives artifacts instead of chat-only output, sees evidence and verification, and remains the final authority for high-impact external actions.

The experience should feel like a small operating team, not a multiplayer chatbot and not an avatar simulator.

## 5. Product principles

1. **Evidence before celebration.** A task label or model statement is never sufficient proof.
2. **Human authority stays explicit.** External writes, paid actions, account changes, and destructive actions remain approval-gated unless a reviewed delegated scope explicitly permits them.
3. **Structured handoff over free-form agent chatter.** Inter-agent work uses contracts with objectives, constraints, artifacts, evidence requirements, budget, and risk.
4. **Provider-neutral by default.** Employees express capability needs; routers resolve a suitable model/runtime/tool.
5. **Cost is a first-class constraint.** Missions have budgets, per-step cost telemetry, warnings, and hard-stop behavior.
6. **Memory remains scoped.** Private, project, and approved shared memory stay distinct.
7. **Failure must be honest and resumable.** `FAILED`, `PARTIAL`, `BLOCKED`, `RETRYING`, and `RECOVERED` remain meaningful states.
8. **Artifacts are first-class output.** Reports, datasets, patches, images, dashboards, and evidence packs must be addressable and attributable.
9. **Do not add employees to fake capability growth.** Prefer a new skill/capability on an existing role when the responsibility already fits that role.
10. **Public demo is a sandboxed product surface, not a proof shortcut.** Demo success does not automatically become production reliability evidence.
11. **External data source policy is part of architecture.** Retention, attribution, billing fields, and provider terms must be enforced in code/config rather than remembered manually.

## 6. Primary users

### 6.1 Repository evaluator / first-time visitor

Wants to understand the value quickly by running a safe demonstration without configuring a full local office.

### 6.2 Individual operator

Wants a local AI workforce for research, engineering, growth, operations, knowledge work, and evidence-backed task execution.

### 6.3 Power user / builder

Wants to configure models, connectors, employees, skills, budgets, memory scopes, automation, and developer workflows.

### 6.4 Future team workspace user

Wants shared projects, role-based access, audit history, approvals, and multi-user mission operations. This is a later milestone, not v0.6 scope.

## 7. Release strategy

### v0.6.0 — Live Workforce

Primary objective: make the office visibly perform real bounded AI work.

Must ship:

1. Public Interactive Web Demo;
2. Live AI Sandbox mode;
3. Mission Engine + task graph;
4. Model Router + Tool/Capability Router;
5. Siti Verification + Evidence UI.

Strong supporting scope when required by the five items:

- structured Agent Handoff Bus;
- mission/task execution state contract;
- live execution telemetry;
- bounded public-demo quotas;
- artifact/evidence references sufficient for the demo;
- no external writes in the public demo.

Explicitly not required for v0.6.0:

- full connector marketplace;
- broad autonomous scheduling;
- production CRM actions;
- full OS/container sandbox;
- multi-user team workspace;
- massive Maps/Places lead harvesting;
- automatic employee creation;
- v1.0 reliability claims.

### v0.6.1 — Reliability

Primary objective: make live missions recoverable, inspectable, and cost-bounded.

Planned scope:

- Cost Governor;
- Artifact Workspace;
- Execution Replay;
- checkpoints and resume;
- provider fallback/retry policy;
- Project Brain / Memory 2.0 foundations;
- reliability fixtures and failure-injection evaluation.

### v0.7.0 — Connected Office

Primary objective: let reviewed employees safely operate against user-owned external systems.

Planned scope:

- Connector Center;
- per-employee least-privilege grants;
- Browser Agent production contract;
- Scheduler / recurring missions;
- Approval Center 2.0;
- Agent Skills Store;
- expanded employee capability loops;
- real connected-workflow evidence collection.

### v0.7.1 — Geo Intelligence

Primary objective: add compliant geo/business discovery and enrichment as a department capability.

Planned scope:

- Google Places connector as a discovery/lookup provider;
- query expansion and geographic partitioning;
- place identity resolution / deduplication;
- website/public-source enrichment;
- provenance-aware business profiles;
- qualification/scoring with explicit rationale;
- Siti verification;
- map-oriented mission UI;
- policy-aware storage/retention/attribution.

### v0.8.0 — Lead Intelligence

Primary objective: convert verified discovery into user-owned lead intelligence and monitoring.

Planned scope:

- CRM-ready datasets;
- lead qualification workflows;
- outreach drafts behind human approval;
- watchlists / change monitoring;
- competitor radar;
- territory planning;
- reusable evidence packs.

### v0.8.1 — Mission Control

Primary objective: support longer-running parallel missions with self-recovery inside bounded autonomy.

Planned scope:

- long-running mission coordination;
- deeper parallel execution;
- checkpoint-aware rerouting;
- bounded adaptive query proposals;
- workload balancing;
- stronger sandbox isolation;
- explicit escalation and stop conditions.

### v0.9.0 — Team Office

Primary objective: support multiple human users safely.

Planned scope:

- shared projects;
- user/team identity;
- RBAC;
- approval ownership;
- shared audit log;
- workspace-scoped connectors and budgets;
- collaboration-safe memory.

### v1.0.0 — Production Workforce

`v1.0.0` is evidence-gated, not date-gated.

It requires demonstrated real-world reliability across a reviewed dataset, mature provider/connector lifecycle evidence, security and recovery validation, stable upgrade/migration paths, and a release claim that matches the evidence actually collected.

## 8. v0.6.0 detailed requirements

### 8.1 Public Interactive Web Demo

CHAT 08 implementation/status source: [v0.6 Public Interactive Demo Backend + UI](V0.6-PUBLIC-INTERACTIVE-DEMO.md). The repository now includes the deterministic no-login experience, bounded anonymous sessions, task-graph/employee visualization, strict synthetic/live labeling, and a fail-closed live-unavailable fallback.

The public surface exposes two distinct experiences:

```text
[ TRY DEMO ]
[ TRY LIVE AI ]
```

`TRY DEMO`: deterministic, instant, synthetic, no login, no external service dependency.

`TRY LIVE AI`: real model execution in a bounded sandbox with explicit quotas and visible evidence/runtime telemetry.

Required public-demo boundaries:

- one active mission per anonymous session;
- bounded employee count;
- bounded tool calls;
- bounded tokens/cost;
- no user account access;
- no production external writes;
- no paid actions;
- no destructive actions;
- disposable workspaces/sessions;
- automatic fallback offer to deterministic demo when live capacity is unavailable;
- clear labeling of synthetic vs live work.

The product may target very low operating cost, but **must not promise permanent zero-cost operation**. Hosting/model free tiers and quotas are external variables.

### 8.2 Mission Engine

CHAT 03 planning source: [v0.6 Mission Planner](V0.6-MISSION-PLANNER.md). The current planner is deterministic/rule-based with explicit-work-item support; it produces validated Mission/TaskNode DAGs but does not execute them.

A mission is the top-level work object derived from a user objective.

Minimum mission contract:

```json
{
  "mission_id": "M-...",
  "objective": "...",
  "constraints": [],
  "risk_class": "LOW|MEDIUM|HIGH",
  "budget": {},
  "autonomy": {},
  "tasks": [],
  "artifacts": [],
  "evidence": [],
  "approvals": [],
  "state": "..."
}
```

The planner must be able to build a DAG, identify parallelizable tasks, assign workers by capability, declare dependencies, and define completion/verification criteria before execution.

Mission planning must remain inspectable. The system must not hide a large free-form agent conversation behind a single `WORKING` state.

### 8.3 Agent Handoff Bus

CHAT 04 implementation source: [v0.6 Mission Orchestrator](V0.6-MISSION-ORCHESTRATOR.md). Typed handoff envelopes and bounded runtime-neutral DAG execution are now implemented for synthetic/read-only contract cases; dynamic model routing and production connectors remain later milestones.

Inter-agent delegation uses typed envelopes rather than unrestricted chat as the source of truth.

Minimum outbound handoff fields:

- task ID;
- source employee;
- destination employee;
- objective;
- constraints;
- required evidence;
- input artifacts;
- budget;
- deadline/timeout;
- risk class;
- allowed capabilities.

Minimum return envelope:

- task ID;
- terminal/current state;
- produced artifacts;
- evidence references;
- unknowns;
- residual risks;
- execution receipt reference.

Human-readable messages may still be rendered in UI, but the typed envelope is canonical.

### 8.4 Execution states

At minimum:

```text
PLANNED
READY
RUNNING
WAITING_APPROVAL
BLOCKED
PARTIAL
FAILED
RETRYING
RECOVERED
SUCCEEDED
VERIFIED
CANCELLED
```

`VERIFIED` requires independent evidence according to the existing repository policy. No model may self-promote its own output to independently verified.

### 8.5 Model Router

CHAT 05 implementation source: [v0.6 Model Router](V0.6-MODEL-ROUTER.md). The current router is provider-neutral and decision-only: it filters/ranks supplied model/runtime candidates and emits an inspectable content-addressed route decision; it does not execute inference.

Employees declare model requirements, not hardcoded global providers.

Routing inputs may include:

- task class;
- latency target;
- reasoning depth;
- modality;
- privacy/locality requirement;
- context size;
- budget;
- provider health;
- user policy;
- fallback permission.

Example model classes:

- FAST;
- REASONING;
- VISION;
- CODING;
- LOCAL_SENSITIVE.

Fallback is policy-controlled and must preserve privacy/capability constraints. A sensitive-local task must not silently fail over to a cloud provider.

### 8.6 Tool / Capability Router

CHAT 06 implementation source: [v0.6 Capability Router / Tool Policy](V0.6-CAPABILITY-POLICY.md). The existing capability router now binds employee, action, READ/WRITE mode, exact resource target, connection evidence, grant evidence, autonomy, approval evidence, and required post-action evidence into a content-addressed capability route decision. It still does not execute tools.

Tools and connectors are selected from explicit employee/task capability requirements.

Routing must verify:

- connector state;
- permission scope;
- autonomy mode;
- approval requirement;
- target resource;
- rate/cost limits;
- whether the operation is read or write;
- required evidence after execution.

### 8.7 Live AI Sandbox

CHAT 07 implementation/status source: [v0.6 Live Sandbox + Minimum Cost/Quota Guard](V0.6-LIVE-SANDBOX.md). The application-level sandbox enforces bounded read-only admission, quota/cost truth semantics, exact task/provider binding, disposable workspace settlement, teardown checks, and canonical live-run integration. CHAT 07 is closed for repository delivery; the most recent provider-quota failure remains documented as an external operational limitation rather than unfinished sandbox work.


The live demo/runtime sandbox must provide:

- per-mission temporary workspace;
- bounded runtime duration;
- tool allowlist;
- network policy appropriate to the selected tool;
- no hidden credentials;
- explicit provider/model disclosure;
- resource/cost counters;
- safe teardown;
- structured failure reporting.

OS/container isolation is a later hardening target unless an existing safe substrate can be adopted without delaying v0.6.0.

### 8.8 Siti Verification / Red Team

Siti becomes the default independent verification role for mission outputs that require verification.

For research:

- source exists;
- source is relevant/current enough for the claim;
- quoted/interpreted values match;
- units/definitions match;
- contradictions are surfaced;
- unsupported claims remain unsupported.

For code:

- changed files inspected;
- tests executed;
- negative/regression cases attempted;
- claimed fix mapped to evidence;
- remaining uncertainty reported.

For external actions:

- independent external state check where technically possible;
- receipt/evidence presence;
- no `VERIFIED` state when the system cannot establish the result.

### 8.9 Evidence UI

The UI should expose more than a status badge.

Per execution step, show when available:

- employee;
- model/runtime;
- tool/connector;
- start/end time;
- token/cost counters;
- artifacts;
- evidence count/references;
- receipt;
- state;
- verifier outcome;
- unknowns/blockers.

### 8.10 Employee capability upgrades

Do not expand headcount for v0.6. Upgrade the existing 16 employees.

Target capability direction:

| Employee | v0.6+ capability direction |
| --- | --- |
| Praroro | mission command, planning, delegation, budget, blocker escalation, synthesis |
| Alex | deep research, source triangulation, browser-assisted research |
| Subagjo | inspect -> patch -> test -> PR/CI engineering loop |
| Siti | adversarial QA, regression, evidence verification |
| Paijo | BI, unit economics, scenarios |
| Ratri | SEO/CRO, website diagnostics, experiments |
| Nara | data analysis, SQL/Polars, anomalies, experiments |
| Bimo | connectors, MCP/API/webhook integration |
| Fikri | document ingestion, context optimization, project knowledge |
| Maya | Meta Ads analysis -> draft -> approval -> execute -> verify |
| Gugun | Google Ads analysis -> draft -> approval -> execute -> verify |
| Sumiati | campaign concepts, copy, creative briefs |
| Caca | community/social monitoring and response drafts |
| Dina | project/inbox/operational task management |
| Tari | CRM/inbox/follow-up preparation |
| Bambang | scheduling, retries, queue/workload balancing |

## 9. v0.6.1 reliability requirements

### 9.1 Cost Governor

Track cost by mission, task, employee, provider, and day.

Budget policy supports:

- warning threshold;
- cheaper-model reroute threshold;
- hard stop;
- approval-required overage;
- per-tool and per-provider quotas.

Example behavior:

```text
80% budget -> warning
90% budget -> cheaper compliant route if allowed
100% budget -> stop or request approval
```

### 9.2 Artifact Workspace

Artifacts must be addressable objects rather than ephemeral chat attachments.

Each artifact records:

- artifact ID/version;
- project/mission/task;
- creator;
- timestamp;
- MIME/type;
- source inputs;
- checksum;
- evidence links;
- verifier/review state;
- retention/scope.

Expected artifact examples:

- report Markdown/PDF;
- spreadsheet/CSV;
- dashboard data;
- image/creative;
- patch/diff;
- build archive;
- evidence JSON.

### 9.3 Execution Replay

Users can inspect a chronological mission timeline with planning, tool calls, artifact creation, verification findings, corrections, approvals, retries, and final state.

Replay is reconstructed from canonical events/receipts, not from fabricated narration.

### 9.4 Failure Recovery

Long-running work should checkpoint safe resumable state.

Recovery requirements:

- no restart-from-zero when a valid checkpoint exists;
- provider timeout can reroute only within policy;
- browser session recovery uses disposable state where possible;
- retries are bounded;
- partial artifacts are preserved and labeled;
- `RECOVERED` is distinct from `SUCCEEDED`/`VERIFIED`.

### 9.5 Project Brain / Memory 2.0

Project memory separates:

```text
PRIVATE MEMORY
PROJECT MEMORY
APPROVED SHARED MEMORY
```

Memory records include source, confidence, timestamp, owner, scope, provenance, and where relevant expiration/retention.

Suggested project knowledge classes:

- decisions;
- facts;
- assumptions;
- failed attempts;
- user/customer preferences;
- terminology;
- artifacts;
- lessons.

## 10. v0.7 Connected Office requirements

### 10.1 Connector Center

Initial candidates:

- GitHub;
- Google Drive;
- Gmail;
- Calendar;
- Slack;
- Telegram;
- Notion;
- Browser;
- Meta Ads;
- Google Ads.

Each connection must distinguish:

```text
AVAILABLE
NOT_CONNECTED
CONNECTED_READ
CONNECTED_WRITE_SCOPED
ERROR
EXPIRED
REVOKED
```

Connection alone does not grant every employee access. Grants are employee + capability + resource + scope specific.

### 10.2 Skills Store

A skill is modular procedure/knowledge and does not implicitly grant a tool or credential.

Users can attach reviewed skills to existing employees. New employee creation is only justified when a distinct responsibility cannot be represented cleanly as an existing role plus skills.

### 10.3 Scheduler

Recurring missions must use the same evidence, cost, autonomy, approval, and recovery contracts as interactive missions.

Examples:

- morning briefing;
- competitor/news monitoring;
- website change checks;
- KPI anomaly checks;
- approval queue summary.

### 10.4 Browser Agent

Browser execution must expose observable navigation/action evidence and distinguish reads from mutations.

Use cases include:

- public web research;
- user-owned site audits;
- localhost QA/reproduction;
- approved connector/browser workflows.

### 10.5 Approval Center 2.0

Approval UI must show:

- requested action;
- employee/requester;
- target;
- risk class;
- budget/cost exposure;
- reason;
- evidence;
- reviewer findings;
- preview/diff when available;
- approve/edit/reject;
- scope and expiry of the approval.

## 11. Geo Intelligence requirements

Geo Intelligence is an AI research department, **not a Google Maps scraper product**.

### 11.1 Provider strategy

Preferred discovery/lookup path: Google Places API (New) or another contract-compliant source.

Browser scraping of Google Maps UI must not be the foundational data strategy.

### 11.2 Data flow

```text
discovery provider
  -> ephemeral provider response
  -> allowed identifiers / normalized facts
  -> website/public-source enrichment
  -> user-owned/internal data enrichment
  -> analysis / qualification
  -> independent verification
  -> CRM/report/artifacts
```

### 11.3 Places-specific engineering constraints

As checked on 2026-10-01 against Google documentation:

- Text Search (New) requires a response FieldMask;
- selected fields can affect billing tier, so production code must request only required fields;
- Text Search currently returns at most 60 results across pages and identical requests are not guaranteed to return identical result sets;
- Place IDs may be stored/reused and are exempt from normal Places caching restrictions; Google recommends refreshing older IDs;
- non-ID Places data retention/caching and attribution must follow current Google Maps Platform policy;
- pricing/free usage is SKU-dependent and must be configuration/documentation, not a hardcoded product promise.

Therefore discovery must use query expansion / geographic partitioning instead of pretending one query enumerates an area completely.

### 11.4 Search Expansion Engine

Search plans may expand:

- geography partitions;
- relevant category/type;
- synonym/keyword variants;
- user-supplied domain knowledge;
- adaptive query proposals from observed qualified patterns.

Adaptive proposals must remain bounded and auditable. The system may propose new queries; it must not silently rewrite user policy.

### 11.5 Identity resolution / deduplication

Primary identity should use provider identifiers where available, plus secondary normalized signals such as name, location, website, and public phone when permitted.

Duplicate resolution must preserve provenance to all observations.

### 11.6 Web enrichment

Enrichment may inspect public business websites/pages for business-relevant information such as services, locations, industries, branches, fleet/corporate signals, or contact surfaces.

Every extracted claim retains source URL, retrieval time, extraction method, and confidence/verification status.

### 11.7 Qualification and scoring

Scores are product heuristics, not objective truth.

A score must expose contributing features/weights, evidence coverage, missing data, and version of the scoring policy.

### 11.8 Geo mission output

Potential outputs:

- CSV/XLSX dataset;
- report;
- business profiles;
- evidence pack;
- map visualization where provider terms permit;
- CRM-ready export.

### 11.9 Monitoring

Later Geo/Lead Intelligence may periodically refresh stored identifiers and permitted data to detect changes. Monitoring cadence, fields, cost, and retention must respect provider terms and user budget.

## 12. Lead Intelligence requirements

Pipeline:

```text
DISCOVER
  -> NORMALIZE / DEDUPE
  -> ENRICH
  -> SCORE
  -> VERIFY
  -> CRM PREP
  -> OUTREACH DRAFT
  -> HUMAN APPROVAL
  -> EXTERNAL ACTION
```

Outbound communication remains an external write. Default behavior is draft-first; send requires explicit approved scope.

## 13. Autonomy model

Preserve the existing three high-level modes:

- `OBSERVE`;
- `GUARDED`;
- `DELEGATED`.

`DELEGATED` is never global. It must define scope, targets, action classes, limits, evidence requirements, budget, expiry, and stop/escalation conditions.

Public live demo remains effectively read-only/sandboxed regardless of employee autonomy configuration.

## 14. Employee growth rule

Default rule:

**do not add a new employee if the capability fits an existing employee plus a new skill/tool policy.**

Future role candidates such as Security/Red Team, Product Ops, Sales/BD, Customer Success, or Finance require an explicit capability-gap review before addition.

Employee proposal flow, if implemented later:

```text
proposal
  -> role/capability justification
  -> permission review
  -> human approval
  -> profile generation
  -> tests
  -> install
```

No agent may grant itself new tools, permissions, credentials, or autonomy.

## 15. System architecture target

**CHAT 01 architecture lock:** [V0.6 Architecture Lock](V0.6-ARCHITECTURE-LOCK.md) and [ADR-0001 Live Workforce Domain Ownership](ADR-0001-LIVE-WORKFORCE-DOMAIN-OWNERSHIP.md) are authoritative for implementation boundaries. The module list below is conceptual; it must not be interpreted as permission to create duplicate task, approval, capability, runtime, or evidence packages.

Proposed logical modules:

```text
office/
  mission-ui/
  evidence-ui/
  approval-center/
  artifact-workspace/
  replay/

packages/
  mission-engine/
  mission-planner/
  handoff-bus/
  model-router/
  capability-router/
  cost-governor/
  artifact-registry/
  execution-replay/
  recovery-engine/
  project-brain/
  scheduler/
  geo-intelligence/
  lead-intelligence/

connectors/
  github/
  browser/
  google-places/
  google-drive/
  gmail/
  calendar/
  slack/
  notion/
  meta-ads/
  google-ads/
  crm/
```

Exact folders are implementation choices, not requirements. Existing package boundaries should be reused when they already satisfy the contract; new packages require a delete-test/complexity-budget justification.

## 16. Canonical data objects

CHAT 02 implementation source: [v0.6 Mission Contracts](V0.6-MISSION-CONTRACTS.md). Mission, TaskNode, and Execution Attempt now have versioned v1 contracts; planning/execution behavior remains staged for later chats.

Minimum new/extended entities:

- Mission;
- MissionPlan;
- TaskNode;
- HandoffEnvelope;
- ExecutionAttempt;
- ModelRouteDecision;
- ToolRouteDecision;
- BudgetLedger;
- ArtifactRecord;
- EvidenceRecord;
- VerificationReport;
- ApprovalRequest;
- Checkpoint;
- ReplayEvent;
- ConnectorGrant;
- ScheduledMission;
- ProjectMemoryRecord;
- GeoObservation;
- BusinessProfile;
- QualificationScore.

Every durable object must have versioned schema and migration behavior before it is treated as stable.

## 17. Security and privacy

Must preserve or strengthen current threat-model boundaries.

Minimum requirements:

- least privilege per connector and employee;
- secrets never included in evidence/replay/public demo;
- no credential scraping;
- external writes approval-gated by default;
- target/resource binding for approvals;
- auditable connector grant/revocation;
- network/tool allowlists in sandboxed execution;
- user-owned data separation;
- explicit data retention policy;
- public demo isolation between sessions;
- rate/abuse controls;
- security scan coverage for new artifact/evidence surfaces.

## 18. Cost and quota design

Costs/limits are runtime configuration, not permanent product constants.

For public live mode:

- hard per-session mission quota;
- per-mission token/call/time budget;
- provider quota awareness;
- graceful degradation to deterministic demo;
- no hidden paid fallback.

Candidate low-cost infrastructure/providers may include Vercel Hobby, OpenRouter free routing/models, and Gemini free-tier-capable models, but current external quotas/pricing must be checked at deployment/release time and never marketed as 'free forever'.

## 19. Observability and evidence

Required counters/events:

- mission/task duration;
- task state transitions;
- model/provider route;
- tool/connector route;
- token and reported cost;
- retries/fallbacks;
- approvals;
- artifact creation;
- evidence attachment;
- verifier findings;
- failure/recovery reasons;
- queue/scheduler events;
- connector errors.

Telemetry must not leak secret values or private content into public logs.

## 20. Acceptance criteria by milestone

### v0.6.0 acceptance

- first-time visitor can run deterministic demo without login;
- live mode can execute at least one bounded real-model mission end-to-end;
- mission is decomposed into a visible task graph;
- at least two tasks can execute through structured handoff;
- route decisions identify model/tool/runtime used;
- user can inspect artifacts/evidence and verification outcome;
- Siti cannot self-verify work she generated herself;
- public mode cannot perform external writes;
- budget/tool/token/time ceilings fail closed;
- live capacity failure offers deterministic demo without fabricating live success;
- Linux/Windows/minimum-version CI green;
- release claim language remains scoped.

### v0.6.1 acceptance

- mission can resume from at least one real checkpointed failure case;
- replay reconstructs canonical mission events;
- artifact workspace versions/checksums artifacts;
- cost governor blocks/requests approval at configured ceilings;
- provider fallback is tested for allowed and forbidden privacy routes;
- project memory provenance and scope tests pass.

### v0.7.0 acceptance

- at least two real user-owned connectors complete read-only live lifecycle evidence;
- at least one scoped write connector demonstrates preview -> approval -> execute -> verify;
- scheduler runs recurring bounded mission through the normal mission/evidence pipeline;
- connector revocation invalidates further capability use;
- browser actions remain evidence-visible and mutation-aware.

### v0.7.1 acceptance

- Places discovery connector obeys field-mask/cost policy;
- query expansion is bounded and logged;
- provider results normalize/dedupe deterministically;
- enrichment keeps source provenance;
- retention/attribution policy tests pass;
- qualification scores are explainable/versioned;
- map/report outputs do not overstate completeness.

### v1.0 acceptance

Defined later from accumulated evidence. Version number alone is not sufficient.

## 21. Test strategy

Every new subsystem needs:

- schema/contract tests;
- deterministic unit tests;
- negative/fail-closed tests;
- integration tests;
- cross-platform tests where relevant;
- live tests only when user/provider access is intentionally available;
- evidence classification for each test result;
- regression fixtures for every release-blocking bug.

Additional required evaluation classes:

- planner/task-graph correctness;
- handoff schema fuzz/adversarial cases;
- model/tool routing policy conflicts;
- cost limit enforcement;
- approval scope escape attempts;
- connector revocation;
- prompt/tool injection resistance;
- replay integrity;
- checkpoint corruption;
- duplicate identity resolution;
- Places retention/field-mask policy;
- public demo abuse/rate boundaries.

## 22. Migration and compatibility

- preserve `v0.5.1` stable install semantics;
- do not rewrite `v0.5.0` failed-publication history;
- existing employee registry remains canonical until a versioned migration is reviewed;
- old receipts remain verifiable according to their version/trust lifecycle;
- current approval semantics remain fail-closed;
- new mission/task schemas require explicit version fields;
- existing deterministic demo remains available as fallback/reference.

## 23. Non-goals

The master direction does **not** authorize:

- silent production writes;
- automatic credential collection;
- unrestricted self-modifying employees;
- hidden cross-provider data movement;
- uncontrolled recursive agent spawning;
- unlimited public demo usage;
- pretending Google Places is a freely dumpable permanent database;
- declaring broad real-world reliability from synthetic/demo runs;
- adding dozens of employees merely for visual complexity.

## 24. Risks

| Risk | Required mitigation |
| --- | --- |
| Architecture explosion | staged releases, delete tests, reuse existing packages |
| Expensive public demo | hard quotas, cost governor, deterministic fallback |
| Agent loops / runaway work | bounded DAG, budgets, timeouts, stop conditions |
| False VERIFIED state | independent verifier + evidence contract |
| Excessive connector privilege | per-employee scoped grants + approval |
| Provider outage | health-aware routing + bounded fallback |
| Privacy leakage | locality policy, secret scanning, scoped memory |
| Replay/evidence contains secrets | redaction + schema restrictions |
| Maps/Places policy violation | provider-specific data policy layer |
| Lead scoring presented as truth | transparent heuristic + evidence + version |
| Employee sprawl | capability-gap rule before new employee |
| v1.0 overclaim | evidence-gated release criteria |

## 25. External dependency notes checked 2026-10-01

These are planning references, not permanent guarantees:

- Google Places Text Search (New): https://developers.google.com/maps/documentation/places/web-service/text-search
- Google Places field masks: https://developers.google.com/maps/documentation/places/web-service/choose-fields
- Google Places policy/attribution: https://developers.google.com/maps/documentation/places/web-service/policies
- Google Place IDs: https://developers.google.com/maps/documentation/places/web-service/place-id
- Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- OpenRouter pricing/free plan: https://openrouter.ai/pricing
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing

Any implementation must re-check provider policy/pricing during the relevant delivery chat.

## 26. Governance

This PRD is intentionally broad, but implementation must remain incremental.

Rules for execution:

1. one chat = one bounded implementation/review objective;
2. start from exact GitHub HEAD and audit before changing code;
3. do not silently broaden scope inside a chat;
4. each implementation chat ends with tests and a recoverable GitHub checkpoint;
5. main remains protected from unfinished work;
6. release/tag operations occur only in dedicated release chats;
7. unfinished evidence remains explicitly unfinished;
8. if architecture reality contradicts this PRD, update the PRD through review rather than forcing code to match a stale assumption.

## 27. Execution plan

The canonical step-by-step implementation sequence is maintained in:

`docs/LIVE-WORKFORCE-30-CHAT-PLAN.md`

That document intentionally spans 30 bounded chats from architecture lock through evidence-gated v1.0 convergence. It is a work plan, not a claim that all milestones are already implemented.

## 28. Final product test

The direction is successful when a user can reasonably ask:

> What do you want your company to do?

and the office can produce a bounded, inspectable mission that performs useful work, creates artifacts, shows evidence, survives failures, respects budget/permissions, and asks the human when authority is required.

The product should become **more capable without becoming less truthful**.
