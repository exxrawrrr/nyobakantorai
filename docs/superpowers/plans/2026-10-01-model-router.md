# Model Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic provider-neutral Model Router with policy-preserving fallback and inspectable route evidence.

**Architecture:** A pure `packages/model-router` package normalizes route requests/candidates, applies fail-closed hard filters, deterministically ranks eligible candidates, and returns a content-addressed decision reference. CHAT 04's runtime resolver consumes the decision; the router itself never executes a provider.

**Tech Stack:** Node.js ESM, node:test, node:crypto, JSON Schema/JSON config conventions already used by the repository.

**Spec:** `docs/superpowers/specs/2026-10-01-model-router-design.md`

## Global Constraints

- Preserve ADR-0001 ownership boundaries.
- Do not call model/provider APIs from the router.
- LOCAL_SENSITIVE and LOCAL_ONLY must never fall back to cloud.
- Unknown provider health is not healthy.
- Unknown cost under a hard budget is not zero.
- Route evidence must be deterministic and inspectable.
- Existing Mission/TaskNode/Attempt contracts and CHAT 04 orchestrator remain authoritative.
- No new dependency is required.

## Review Focus

- Caller tries to weaken LOCAL_SENSITIVE privacy.
- Health snapshot omits a provider.
- Candidate has unknown price while request has a hard budget.
- Fallback candidate violates provider/locality policy.
- Equal candidates produce nondeterministic route refs/order.

---

### Task 1: Model Router contract and RED tests

**Files:**
- Create: `packages/model-router/index.test.mjs`
- Create later after RED: `packages/model-router/index.mjs`
- Create later after RED: `schemas/model-route-decision.schema.json`

**Interfaces:**
- Produces: `routeModel(request, candidates)`
- Produces: `normalizeModelRouteRequest(request)`
- Produces: `normalizeModelCandidate(candidate)`
- Produces: `MODEL_TASK_CLASSES`

- [ ] **Step 1: Write failing tests** for task classes, privacy, provider policy, health, context, modality, reasoning, latency, budget, fallback and deterministic refs.
- [ ] **Step 2: Run `node --test packages/model-router/index.test.mjs` and confirm RED because the router module does not exist.**
- [ ] **Step 3: Implement the minimal router and decision schema.**
- [ ] **Step 4: Run `node --test packages/model-router/index.test.mjs` and confirm GREEN.**

### Task 2: Orchestrator seam integration

**Files:**
- Create: `packages/model-router/orchestrator-integration.test.mjs`

**Interfaces:**
- Consumes: `routeModel(...)`
- Consumes: `executeMissionPlan(...)`
- Verifies: selected `model_route_ref` reaches Execution Attempt.

- [ ] **Step 1: Write integration test first.**
- [ ] **Step 2: Run it and confirm RED until the test's route integration fixture is complete.**
- [ ] **Step 3: Add only the minimal fixture/resolver glue required; do not modify orchestrator unless a real missing seam is proven.**
- [ ] **Step 4: Run integration test and existing CHAT 04 suite; confirm GREEN.**

### Task 3: Core verification and documentation

**Files:**
- Modify: `package.json`
- Create: `docs/V0.6-MODEL-ROUTER.md`
- Modify: `docs/LIVE-WORKFORCE-30-CHAT-PLAN.md`
- Modify: `docs/LIVE-WORKFORCE-MASTER-PRD.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Adds: `npm run test:model-router`
- Adds Model Router suite to `test:core`.

- [ ] **Step 1: Add the suite to core verification.**
- [ ] **Step 2: Document hard filters, fallback/privacy invariants, evidence shape and non-goals.**
- [ ] **Step 3: Run model-router, Mission orchestrator, security, public audit and release-readiness targeted gates.**
- [ ] **Step 4: Run full CI on PR before merge.**
