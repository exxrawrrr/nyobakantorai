# Runtime portability — v0.5 baseline

Status: **Chat 2 enforced core/runtime boundary**
Audited stable base: `v0.4.0` @ `5d4725d6e2963c467d092af53d9743b6619745dd`

The canonical machine-readable inventory is:

```text
config/runtime-portability-map.json
```

Validate it with:

```bash
npm run runtime:portability:check
npm run test:runtime-portability
```

## Claim boundary

This document answers:

> Which current surfaces are runtime-neutral, which are adapter boundaries, and which are still Hermes-shaped?

It does **not** claim broad behavioral portability.

An interface, exporter, or adapter is not sufficient proof that the same worker/task/governance contract behaves acceptably on multiple live runtimes.

## Classification meanings

| Classification | Meaning |
| --- | --- |
| `CORE_PORTABLE` | Runtime-neutral logic/contract with no known direct Hermes implementation dependency in the audited surface. |
| `ADAPTER_BOUNDARY` | Intentionally knows runtime/provider interfaces and protects portable core from their semantics. |
| `HERMES_SHAPED` | General product behavior currently embeds Hermes-specific names, states, paths, or lifecycle assumptions. |
| `RUNTIME_SPECIFIC_BY_DESIGN` | Hermes distribution/integration implementation that is expected to remain runtime-specific. |
| `UNKNOWN_REQUIRES_PROOF` | Mixed or insufficiently isolated; do not claim portable until split or proven. |

## Baseline inventory

| Surface | Current classification | Why |
| --- | --- | --- |
| Employee definitions | `UNKNOWN_REQUIRES_PROOF` | Core role/governance data is mixed with preferred runtime toolsets, Hermes integrations, and `PROFILE_SCOPED_HERMES_FIRST`. |
| Canonical skill definitions | `ADAPTER_BOUNDARY` | Canonical source is now `skills/canonical/`; runtime activation/export metadata remains adapter concern and behavioral portability is still unproven. |
| Capability contracts | `CORE_PORTABLE` | Capability IDs, risk and authorization semantics are runtime-neutral. |
| Task registry | `CORE_PORTABLE` | Runtime binding is now opaque `runtime_provider` + `runtime_ref`; lifecycle, approval, and verification no longer hard-code a runtime. |
| Approval policy | `UNKNOWN_REQUIRES_PROOF` | Policy semantics are neutral but co-located with Hermes-shaped task/worker structures. |
| Evidence + signed receipts | `CORE_PORTABLE` | Receipt and evidence verification do not depend on Hermes implementation. |
| Memory policy | `CORE_PORTABLE` | Canonical memory layers are runtime-neutral; worker preference metadata is separately Hermes-shaped. |
| Provider doctor | `ADAPTER_BOUNDARY` | Concrete harness/provider probing belongs at the integration boundary. |
| Runtime Adapter SDK | `ADAPTER_BOUNDARY` | Generic normalized read-only runtime contract with constrained provider implementations. |
| Hermes office adapter | `RUNTIME_SPECIFIC_BY_DESIGN` | Hermes executable/profile/kanban semantics are correctly isolated here. |
| Hermes bootstrap/profile distribution | `RUNTIME_SPECIFIC_BY_DESIGN` | These are explicitly Hermes packaging/lifecycle surfaces. |
| Cross-harness export/self-test | `ADAPTER_BOUNDARY` | Knows Hermes/Codex/Gemini/Copilot mechanics and already limits its own claims. |
| Office runtime reconciliation | `ADAPTER_BOUNDARY` | Server consumes a generic runtime provider; Hermes construction lives in the explicit composition root. |
| Install/update/remove lifecycle | `HERMES_SHAPED` | Core-only install exists, but workforce lifecycle remains primarily Hermes bootstrap semantics. |
| Employee release packs | `RUNTIME_SPECIFIC_BY_DESIGN` | Current employee ZIPs package Hermes profile distributions. |
| Real-task evidence | `CORE_PORTABLE` | Recorder/evaluation machinery is evidence-contract oriented rather than Hermes implementation oriented. |
| Release claims | `UNKNOWN_REQUIRES_PROOF` | Generic mechanism, but canonical v0.4 data includes runtime/provider-specific deferred states. |
| Office workforce UI | `UNKNOWN_REQUIRES_PROOF` | UI can be reused, but generated worker data still carries Hermes-shaped metadata. |
| Workforce generation pipeline | `ADAPTER_BOUNDARY` | Canonical skills are runtime-neutral by path; generator still emits Hermes distributions explicitly as runtime packaging. |

## Chat 1 baseline findings (historical context)

### 1. The project is not Hermes-only, but the current core boundary is not clean enough to prove runtime agnosticism

There is genuine portable machinery already: capabilities, evidence verification, receipts, memory policy and real-task evidence.

There is also a genuine generic read-only runtime adapter boundary.

However, several surfaces that look like core still contain Hermes-shaped semantics. Therefore the correct claim today is:

> **adapter-ready with meaningful portable core components, but broad runtime portability remains unproven.**

### 2. Employee definitions are the highest-leverage mixed boundary

`config/employees.json` contains both:

- genuinely portable role/personality/governance/operational contracts; and
- runtime preferences such as Hermes-oriented optional integrations and `PROFILE_SCOPED_HERMES_FIRST`.

The next phase should split those concerns without rewriting worker identity.

### 3. Canonical skills are semantically broader than their storage boundary

The project already exports skills to multiple harnesses, but the canonical source directory remains `skills/canonical/`.

That is not evidence of broken skills. It is evidence that the source-of-truth boundary still carries historical Hermes coupling.

### 4. Task truth is portable in intent but not yet in representation

The registry contains useful lifecycle, approval and independent-verification rules. It also hard-codes `HERMES` as an execution mode and treats Hermes reconciliation as a special provenance path.

Chat 2 should separate runtime identity from generic task truth.

### 5. The Office server is the clearest runtime composition leak

The server directly resolves Hermes home/executable, constructs `createHermesRuntimeAdapter()`, and emits a Hermes-shaped runtime object.

This should become composition through a generic office runtime port; the Hermes adapter itself should remain runtime-specific.

## Executable guard added in Chat 1

The validator now fails when:

- a required mapped surface disappears;
- a classification value is unknown;
- a required surface ID disappears;
- a `CORE_PORTABLE` JavaScript surface imports a known Hermes implementation path.

This is intentionally a conservative first guard.

It does not yet forbid all runtime knowledge from every core-looking surface because the audit found real existing coupling that Chat 2 must refactor rather than hide.

## Direction after Chat 2

Chat 2 should enforce:

```text
core -> contracts only
adapter -> core allowed
runtime implementation -> adapter allowed
core -> Hermes implementation forbidden
```

Priority extraction targets:

1. employee runtime preferences vs portable worker contract;
2. task registry runtime identity/provenance;
3. canonical skill source naming/ownership;
4. Office runtime composition.

Do not move Hermes-specific code into a generically named file and call the problem solved. The boundary must be backed by imports, tests, and later live portability evidence.


## Chat 3 execution-boundary update

Chat 3 adds a separately scoped `RuntimeExecutionAdapter v1` boundary. The existing `packages/runtime-adapter/` snapshot SDK remains read-only and is not widened into a dispatch/write API.

The execution contract enforces a narrow READ_ONLY reference policy, declared capabilities, isolated temporary workspace metadata, bounded timeout/output, normalized results, evidence completeness, prohibited-action checks, and mandatory cleanup. Runtime-reported success is downgraded when policy/evidence/cleanup fails.

This is contract/conformance evidence only. Live Hermes execution, live Codex execution, and cross-runtime behavioral parity remain unproven until later chats.


## Chat 4 canonical reference-input update

Chat 4 adds the canonical Siti reference case documented in `docs/PORTABILITY-REFERENCE-CASE.md`.

The reference case binds one portable worker projection, one READ_ONLY task, five canonical skill files, the runtime execution policy, a local source artifact, an exact expected result, a verification contract, and evidence expectations into one deterministic core bundle.

Current aggregate core bundle SHA-256:

```text
cf156141c8f825d13250bf4bc6368195787d37564ce41b8be5f0cd1502a6aaa8
```

Hermes and Codex runtime metadata is explicitly outside that core hash. Future adapter/live-run evidence must fail closed if the canonical core input bytes differ.

This is byte-identity/input-binding evidence only. It does not upgrade live cross-runtime behavioral portability.

## Chat 5 Hermes execution-adapter update

Chat 5 adds a Hermes-specific RuntimeExecutionAdapter v1 implementation.

It is bound to core bundle cf156141c8f825d13250bf4bc6368195787d37564ce41b8be5f0cd1502a6aaa8, targets Siti, preloads exactly the five Chat 4 skills, and exposes only the skills toolset.

Fixture/conformance tests make no real Hermes/provider call. This advances implementation readiness, not live behavioral portability.

## Chat 6 Codex execution-adapter update

Chat 6 adds a Codex-specific RuntimeExecutionAdapter v1 implementation using the repository's existing read-only ephemeral Codex invocation.

Hermes and Codex adapters now both bind to the exact same canonical Siti core bundle cf156141c8f825d13250bf4bc6368195787d37564ce41b8be5f0cd1502a6aaa8. This proves shared input binding only; fixture tests do not prove live behavioral parity.

## Chat 7 reference-case comparator update

Chat 7 adds a runtime-neutral comparator that checks the exact canonical core/component hashes, Hermes+Codex pairing, evidence completeness, protected expected atoms, prohibited-action/workspace state, code-commit identity, and independent-verifier state.

Fixture evidence is intentionally capped at PARTIAL. Complete live evidence without independent verification is capped at PORTABILITY_CANDIDATE. Only two complete live runs plus independent PASS verification may reach PORTABILITY_VERIFIED_FOR_REFERENCE_CASE.

## Chat 8 bounded live-run harness update

Chat 8 adds a one-runtime-at-a-time live evidence harness with explicit confirmation, clean-commit/provider/version preflight, canonical-adapter-only execution, public-safety scanning, and comparator-compatible records.

Fixture evidence remains fixture evidence. Provider-unverified attempts use a separate `UNVERIFIED_RUNTIME_ATTEMPT` class. Only a successful canonical live path satisfying every qualification gate may emit `LIVE_RUNTIME_EVIDENCE`.

CI does not execute provider/model calls, so Chat 8 does not itself create live portability evidence.

## Chat 11 independent verifier update

Chat 11 adds a Python reference verifier for the minimum stable signed-receipt/evidence trust surface.

The implementation does not import or invoke the JavaScript verifier and does not consume a JavaScript verdict. It independently checks canonical payload SHA-256, Ed25519 signatures, trusted key IDs, task/worker/capability/result bindings, freshness, replay, runtime scope, and evidence receipt-reference presence.

This establishes an independent implementation path. Cross-implementation agreement remains a separate differential-corpus gate.

## Chat 12 differential verifier update

Chat 12 adds one static adversarial receipt corpus consumed by both the JavaScript production verifier and the independent Python reference verifier.

The gate compares the exact corpus SHA-256, accept/reject decision, packet-level reason codes, and per-receipt reason sets. Any disagreement fails CI.

The shared corpus contains valid, tampered payload, bad signature, unknown key, stale/future, task/worker/capability/result/runtime mismatch, consumed replay, duplicate replay, and missing receipt-reference cases.

## Chat 13 signing-key lifecycle update

Chat 13 adds a runtime-neutral public receipt trust registry with explicit ACTIVE, RETIRED, and REVOKED semantics, validity windows, runtime provider/reference scope, rotation overlap analysis, and compromise policies.

The registry is authoritative when supplied to the verifier; a legacy public-key map cannot bypass a revoked or out-of-scope registry key.

The JavaScript/Python differential corpus is extended to v2 with lifecycle cases so cross-implementation agreement now covers the tested trust-registry semantics as well as the original signed-receipt cases.


## Chat 15 — remaining UNKNOWN resolution

Chat 15 resolves the four remaining `UNKNOWN_REQUIRES_PROOF` surfaces with executable evidence rather than cosmetic relabeling:

- `employee-definitions` → `ADAPTER_BOUNDARY`: portable worker governance is projected by `lib/workforce.mjs`; runtime toolsets/integrations/distribution metadata stay in `WORKFORCE_RUNTIME_PREFERENCES`.
- `approval-policy` → `CORE_PORTABLE`: task approval/verification gates use portable worker policy plus opaque runtime provider bindings; arbitrary-provider tests remain fail-closed.
- `release-claims` → `CORE_PORTABLE`: the claims model is exercised with synthetic provider IDs; v0.4 Hermes/provider records remain historical data, not implementation coupling.
- `office-ui-workforce-view` → `ADAPTER_BOUNDARY`: the UI consumes `WORKFORCE_VIEW`; runtime preferences are surfaced only through an explicit preference boundary.

The result is **0 `UNKNOWN_REQUIRES_PROOF`** and **0 `HERMES_SHAPED`** surfaces. This is an architectural coupling claim only; it does not upgrade live Hermes/Codex evidence or the final reference-case portability claim.
