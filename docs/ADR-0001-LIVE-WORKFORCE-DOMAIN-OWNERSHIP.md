# ADR-0001 — Live Workforce Domain Ownership

Status: **ACCEPTED**  
Date: 2026-10-01  
Applies from: v0.6 planning and implementation  
Baseline: `main@218612caf33c690fda2be46bd13569a97cb3a01f`

## Context

The v0.6 Live Workforce roadmap introduces Mission, TaskNode, execution Attempt, structured handoff, model/tool routing, evidence UI, and independent verification.

The repository already contains overlapping but useful primitives:

- `packages/task-registry/` for portable task lifecycle, approval, runtime staging, receipt refs, and independent verification;
- `office/registry.mjs` for browser-local task UI/storage, comments, attachments, provenance, and quarantine;
- `packages/runtime-execution-adapter/` for one bounded runtime execution attempt;
- `packages/execution-receipt/` for signed execution claims;
- `packages/evidence-verifier/` for independent evidence verification;
- `packages/evidence-classification/` for claim/evidence maturity;
- `packages/capability-router/` for connection/scope/autonomy/approval authorization;
- `lib/routing.mjs` for deterministic employee selection;
- owner/manual compatibility tooling under `operations/`.

Without an ownership decision, v0.6 could accidentally create a third task store, duplicate approval policy, duplicate evidence semantics, or turn a read-only runtime boundary into a generic dispatcher.

## Decision

### 1. Mission ownership

A future `packages/mission-engine/` owns the Mission aggregate.

It owns:

- mission ID;
- user objective;
- constraints;
- plan/DAG;
- TaskNode references;
- dependency graph;
- orchestration summary;
- mission-level budget/autonomy envelope;
- aggregate state.

It does not own:

- task-level approval authority;
- task-level VERIFIED semantics;
- connector connection state;
- cryptographic receipt verification;
- evidence truth decisions.

### 2. TaskNode ownership

`packages/task-registry/` is the canonical task-domain core.

The future TaskNode contract must evolve from this package through a versioned schema/migration.

No independent Mission-specific task store may be introduced.

A Mission references canonical TaskNode IDs.

### 3. Office task model status

`office/registry.mjs` is classified as a compatibility/UI projection pending migration.

Its existing browser-local schema and user data are preserved until a reviewed migration exists.

Office-only metadata such as comments, attachments, quarantine, and presentation provenance may continue to exist, but they cannot redefine canonical task truth.

### 4. Runtime provider task IDs

Hermes or other provider task IDs are runtime/provider references.

They are not canonical TaskNode IDs.

`operations/taskctl/` stays owner/manual compatibility tooling and is not the Mission task store.

### 5. Attempt ownership

One execution Attempt is coordinated by Mission orchestration and executed through `packages/runtime-execution-adapter/`.

Attempt metadata includes:

- attempt ID;
- TaskNode ID;
- selected model/runtime route;
- selected capability route;
- start/end time;
- normalized execution outcome;
- error category;
- cleanup state;
- receipt ref;
- retry/predecessor relationship.

The execution adapter continues to own the bounded execution lifecycle and normalized outcome contract.

### 6. Evidence ownership

Evidence responsibilities remain separated:

- execution claim authenticity and provenance: `packages/execution-receipt/`;
- execution-key lifecycle: `packages/receipt-trust-registry/`;
- independent evidence decision: `packages/evidence-verifier/`;
- evidence class / release claim maturity: `packages/evidence-classification/`.

Mission and TaskNode store references and status resulting from these systems. They do not become trust stores or evidence verifiers.

### 7. Approval ownership

Task/risk approval state remains canonical in `packages/task-registry/`.

Capability authorization remains in `packages/capability-router/`.

The office approval summary remains a human-review projection.

Mission may aggregate pending approvals but cannot create a higher-level approval that bypasses task/action/resource scope.

### 8. Employee routing ownership

`lib/routing.mjs` remains the deterministic employee-selection primitive.

Mission Planner may invoke it per proposed TaskNode.

Human assignment still wins.

Mission Planner must not create a second canonical employee registry.

### 9. Capability routing ownership

The future product term “Tool Router” maps to extending `packages/capability-router/`.

A new generic `tool-router` package is rejected unless a future architecture review proves the existing capability-router boundary is insufficient.

### 10. Runtime read vs execute boundary

`packages/runtime-adapter/` and the office Hermes adapter remain read-only.

`packages/runtime-execution-adapter/` remains the explicit bounded execution contract.

v0.6 must not collapse these boundaries into one generic runtime API.

### 11. Public demo boundary

The current office server is localhost-oriented and explicitly has no dispatch endpoint.

The future public demo must use shared portable domain packages but must have a separate internet-facing session/rate/sandbox boundary.

The localhost server must not simply be exposed publicly.

## Consequences

### Positive

- v0.6 builds on tested safety/evidence primitives instead of replacing them.
- Task/approval/evidence semantics stay consistent with v0.5.1.
- Runtime execution remains bounded and provider-neutral.
- Public demo work cannot accidentally weaken the local office trust model.
- Existing manual Hermes tooling remains usable during migration.
- Fewer new package boundaries are needed.

### Negative / debt made explicit

- The repository temporarily continues to have both `packages/task-registry` and `office/registry.mjs`.
- CHAT 02 must design a careful schema/migration path.
- Some office fields have no direct portable task-domain equivalent yet.
- `operations/workflow` still represents only the older six-role manual preview model and must not be mistaken for the 16-worker Mission Planner.

These are accepted temporary debts because deleting/migrating them in CHAT 01 would introduce behavior and storage risk before the canonical v0.6 schema exists.

## Alternatives rejected

### Create a new Mission Task store from scratch

Rejected because it would duplicate existing lifecycle, approval, runtime, receipt, and verification semantics.

### Promote `office/registry.mjs` to canonical domain

Rejected because it is UI/storage-oriented and lacks several stronger portable domain invariants already present in `packages/task-registry`.

### Use Hermes Kanban as canonical Mission storage

Rejected because provider/runtime state must remain an edge reference, not the product's portable domain model.

### Merge read-only runtime observation and execution APIs

Rejected because the current split is a deliberate safety/truth boundary.

### Make Siti / verifier own approval

Rejected because independent verification and human permission answer different questions.

## Invariants

Future changes violate this ADR if they:

- introduce an independent third task lifecycle;
- allow Mission state to override stricter TaskNode state;
- let a model self-approve or self-verify;
- treat receipt signature as correctness;
- treat connected capability as authorization;
- expose the local office server as the public execution service without a new trust-boundary review;
- bypass `packages/capability-router` for high-impact tool authorization;
- store provider task IDs as canonical Mission task identities.

## Superseding this ADR

This ADR may be superseded only through a reviewed architecture change that:

1. identifies the concrete limitation;
2. includes a migration plan;
3. preserves or explicitly replaces existing safety/evidence invariants;
4. passes the repository complexity/delete test;
5. updates the v0.6 architecture lock and relevant tests/docs.
