# Live Sandbox + Minimum Cost/Quota Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a provider-neutral live sandbox admission/meter/settlement layer around the existing bounded runtime substrate.

**Architecture:** `packages/live-sandbox/` owns sandbox policy, admission, quota accounting, and settlement evidence. Runtime execution stays in `packages/runtime-execution-adapter/`; live-provider invocation stays in the existing canonical live-run path.

**Tech Stack:** Node.js ESM, node:test, node:crypto, existing RuntimeExecutionAdapter v1.

**Spec:** `docs/superpowers/specs/2026-10-01-live-sandbox-design.md`

## Global Constraints

- Do not create a second executor.
- Do not weaken CHAT 05/06 model/capability policy.
- Unknown cost is not zero.
- Hard cost ceiling requires KNOWN projected cost.
- External writes remain prohibited.
- Credentials are never printed or copied into task payloads.
- No hidden fallback.
- OS/container isolation is not claimed.

## Review Focus

- unknown cost under a hard ceiling;
- actual usage exceeding projected/allowed quota;
- model identity unavailable at runtime;
- fallback disclosed after admission rather than before;
- cleanup failure after otherwise successful execution.

---

### Task 1: Sandbox policy + admission

**Files:**
- Create: `packages/live-sandbox/index.test.mjs`
- Create after RED: `packages/live-sandbox/index.mjs`
- Create: `schemas/live-sandbox-policy.schema.json`
- Create: `schemas/live-sandbox-record.schema.json`

**Produces:**
- `defineLiveSandboxPolicy(spec)`
- `admitLiveSandboxDispatch(policy, declaration)`
- `validateSandboxAdmission(admission)`

- [ ] Write admission/ceiling/allowlist/cost/fallback tests.
- [ ] Run tests and observe RED.
- [ ] Implement minimal policy + admission.
- [ ] Run tests and observe GREEN.

### Task 2: Settlement + quota evidence

**Files:**
- Extend: `packages/live-sandbox/index.test.mjs`
- Extend after RED: `packages/live-sandbox/index.mjs`

**Produces:**
- `settleLiveSandbox(admission, outcome, usage)`
- `validateSandboxRecord(record)`

- [ ] Add failing tests for teardown, workspace evidence, actual quota breach, known/unknown usage.
- [ ] Observe RED.
- [ ] Implement settlement.
- [ ] Observe GREEN.

### Task 3: Existing runtime integration

**Files:**
- Create: `packages/live-sandbox/runtime-integration.test.mjs`
- Create after RED: `packages/live-sandbox/runtime-integration.mjs`

**Produces:**
- `executeLiveSandboxedTask(...)`

- [ ] Test that admission occurs before runtime execution.
- [ ] Test that rejected admission never invokes adapter.
- [ ] Test successful fixture execution settles with cleanup/workspace evidence.
- [ ] Observe RED then implement and GREEN.

### Task 4: Core verification + docs

**Files:**
- Modify: `package.json`
- Create: `config/live-sandbox-policy.json`
- Create: `docs/V0.6-LIVE-SANDBOX.md`
- Modify: `docs/LIVE-WORKFORCE-30-CHAT-PLAN.md`
- Modify: `docs/LIVE-WORKFORCE-MASTER-PRD.md`
- Modify: `ROADMAP.md`

- [ ] Add `test:live-sandbox` to core verification.
- [ ] Document truthful isolation/cost limits.
- [ ] Run sandbox + CHAT 04/05/06 compatibility + security/public/readiness gates.

### Task 5: Real-provider exit-gate attempt

**Uses:**
- existing `scripts/portability-live-run.mjs`;
- existing provider doctor/runtime adapters.

- [ ] Run read-only live preflight on connected workstation.
- [ ] If one provider is installed/ready, run exactly one canonical bounded live attempt with explicit live flag and no fallback.
- [ ] Verify cleanup/temp-workspace/public-safety result.
- [ ] Do not install/login/create credentials if unavailable.
- [ ] Record only public-safe summary/evidence; report blocker truthfully if live preconditions are unavailable.

### Task 6: PR + exact-main verification

- [ ] Self-review base→HEAD for quota bypass, cost truth, cleanup claims, and scope creep.
- [ ] Open PR only after fresh verification.
- [ ] Require Ubuntu/Windows/minimum-version CI.
- [ ] Squash merge with exact-head guard.
- [ ] Require exact-main 3-lane verify before closing CHAT 07.
