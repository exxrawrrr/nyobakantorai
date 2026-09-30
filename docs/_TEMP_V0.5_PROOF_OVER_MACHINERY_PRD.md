# TEMP PRD — nyobakantorai v0.5: Proof Over Machinery

> Temporary implementation PRD.
>
> This file MUST be deleted before the v0.5 release is finalized. Durable requirements must be migrated into permanent docs, tests, schemas, release notes, and architecture records first.

Date: 2026-09-30  
Base: stable v0.4.0  
Working branch: `v0.5/proof-over-machinery`  
Status: IMPLEMENTATION PLAN  
Theme: **prove portability, prove independence, reduce friction, remove unnecessary complexity**

---

## 1. Why v0.5 exists

v0.4 established that nyobakantorai is no longer just a visual office/specification layer. It now has real engineering machinery: contracts, packaging, checksums, signed receipts, verification, memory isolation, provider/self-test infrastructure, cross-platform CI, release gates, and evidence collection.

The next problem is different.

The project now has enough architecture that adding more machinery without proving its value would increase complexity faster than confidence.

v0.5 therefore does **not** primarily optimize for feature count.

It optimizes for five proofs:

1. **Portability** — the same workforce contract can execute through more than one runtime without rewriting the worker/governance core.
2. **Independent trust** — verification is not only logically separate but has at least one implementation path that does not reuse the producer's implementation.
3. **Operational usability** — approval and oversight reduce human review burden instead of moving AI work into manual review.
4. **Release reproducibility** — default installation points at immutable, integrity-verifiable release material.
5. **Complexity justification** — each major subsystem must show the property it buys, evidence for that property, and its maintenance cost.

The v0.5 rule is:

```text
do not add a subsystem
unless it buys a named property
and that property has an executable proof
```

---

## 2. Product thesis

nyobakantorai is:

> a portable workforce + governance + evidence system that can be attached to multiple AI runtimes.

It is **not** defined as a Hermes-only layer.

Hermes remains the reference runtime and the most mature current integration, but runtime-specific semantics must stay outside the portable core wherever feasible.

The desired shape is:

```text
                  nyobakantorai CORE
        worker definitions / skills / policy
       task contracts / approval / verification
              receipt / provenance / evidence
                        |
          +-------------+-------------+
          |                           |
     Hermes adapter               Codex adapter
          |                           |
      Hermes Agent                  Codex CLI
```

v0.5 must produce evidence that this separation is real.

---

## 3. Primary outcome

At the end of v0.5, a reviewer must be able to answer **yes** to all of these:

- Can one canonical worker execute one canonical task through Hermes and Codex without editing the worker, skill, policy, task contract, or verification contract between runs?
- Can the repository identify which core surfaces are truly runtime-agnostic and which remain Hermes-shaped?
- Can one receipt/evidence packet be checked by an independently implemented verifier and produce the same security decision as the primary verifier?
- Is signing-key ownership, trust, rotation, revocation, and compromise handling defined and testable?
- Does approval UI prioritize anomalies/material changes instead of forcing full-output rereads?
- Does default quick-start install an immutable release/version and verify integrity rather than silently following mutable `main`?
- Is “stable” split into artifact/API/behavioral maturity instead of used as one ambiguous label?
- Can maintainers see the complexity cost and proof value of each major subsystem?
- Is there at least one explicit deletion/simplification decision showing the project can remove abstractions, not only add them?

If any answer is no, the corresponding claim remains experimental.

---

## 4. Non-goals

v0.5 is intentionally **not**:

- a rewrite of the office UI;
- a 16-worker cross-runtime migration;
- a requirement to finish the 20/20 real-task baseline;
- a requirement to prove every provider;
- an expansion of the capability catalog for its own sake;
- a new orchestration framework;
- a replacement for Hermes;
- a benchmark competition between model vendors;
- a claim that stable packaging implies stable real-world behavior;
- work on the separate `codex-engineering-skills`, `otak-atik`, or profile repositories.

Those other repositories have separate audit items and must not inflate this PRD.

---

# 5. Workstream A — Core/runtime boundary audit

## A1. Produce a machine-readable portability map

Create a canonical map of runtime coupling for all major subsystems.

Minimum categories:

- `CORE_PORTABLE`
- `ADAPTER_BOUNDARY`
- `HERMES_SHAPED`
- `RUNTIME_SPECIFIC_BY_DESIGN`
- `UNKNOWN_REQUIRES_PROOF`

Minimum surfaces:

- employee definitions;
- skill definitions;
- capability contracts;
- task schema;
- approval policy;
- evidence schema;
- execution receipts;
- verifier;
- memory policy;
- task registry;
- provider doctor;
- runtime adapter SDK;
- Hermes bootstrap;
- Hermes profile generation;
- cross-harness export;
- office runtime reconciliation;
- install/update/remove lifecycle.

Suggested canonical file:

```text
config/runtime-portability-map.json
```

A validation test must fail when a mapped path disappears or an explicitly portable surface imports a forbidden runtime-specific module.

## A2. Dependency rule

Portable core must not import Hermes implementation modules.

Runtime adapters may import core.

Core may define interfaces/contracts used by adapters.

Required directional rule:

```text
core -> contract only
adapter -> core allowed
runtime implementation -> adapter allowed
core -> Hermes implementation forbidden
```

## A3. Architecture inventory

Produce a permanent architecture document showing:

- what is genuinely portable today;
- what is Hermes-shaped today;
- why each Hermes-shaped dependency still exists;
- whether it should be extracted, retained, or explicitly accepted.

No claim of runtime agnosticism may rely only on the existence of an interface.

---

# 6. Workstream B — Real proof of portability

## B1. Reference worker

Use **Siti** as the default reference worker for portability proof because the task can remain bounded, read-oriented, verification-heavy, and low-risk.

If implementation constraints make another existing worker materially more appropriate, the change must be documented before the live proof and must not alter the acceptance criteria.

## B2. Reference task

Create one canonical task fixture with:

- exact objective;
- protected facts/atoms;
- explicit prohibited action;
- skill requirement;
- policy/risk class;
- expected structured output;
- verification contract;
- no external write;
- no production mutation.

The exact same task object must be consumed by both runtime executions.

## B3. Runtime pair

Required pair for v0.5:

1. Hermes Agent;
2. Codex CLI.

Why Codex:

- the repository already recognizes it in cross-harness configuration;
- it provides a practical second runtime with different invocation semantics;
- it is sufficient to prove the architecture is not Hermes-only.

## B4. Core immutability rule

Between Hermes and Codex runs, the following must be byte-identical:

- worker definition;
- referenced skills;
- task fixture;
- approval/risk policy;
- evidence expectations;
- verification logic/config;
- normalized expected output contract.

Allowed differences:

- runtime adapter implementation;
- runtime command/invocation;
- runtime-local temporary workspace metadata;
- provider/model metadata;
- runtime-native raw output before normalization.

## B5. Adapter contract

Introduce or extend an execution-capable portability adapter contract without weakening the existing read-only runtime snapshot API.

Do not silently turn the current read-only SDK into a broad write surface.

Prefer a separately scoped interface, for example:

```text
RuntimeExecutionAdapter v1
- id
- runtime identity
- prepare()
- executeBoundedTask()
- normalizeResult()
- collectEvidence()
- cleanup()
```

The interface must explicitly prohibit undeclared capabilities.

## B6. Portability evidence bundle

A successful comparison bundle must record:

- task hash;
- worker hash;
- skill-set hash;
- policy hash;
- adapter ID/version;
- runtime/provider version;
- raw-result artifact reference;
- normalized-result artifact;
- protected-atom result;
- prohibited-action result;
- workspace mutation check;
- verifier result;
- timestamps;
- exact code commit.

## B7. Claim states

Use explicit states:

- `NOT_RUN`
- `PARTIAL`
- `PORTABILITY_CANDIDATE`
- `PORTABILITY_VERIFIED_FOR_REFERENCE_CASE`

Do not introduce a global `PORTABLE` label from one worker/task.

Successful v0.5 proof means only:

> one canonical worker/task/governance contract produced acceptable behavior through Hermes and Codex with adapter-only runtime differences.

---

# 7. Workstream C — Adapter conformance tests

Create a runtime-adapter conformance suite that every execution adapter must pass.

Required checks:

- declared capabilities only;
- no shell escalation outside adapter contract;
- temporary workspace isolation;
- cleanup;
- bounded timeout;
- bounded output;
- normalized result schema;
- explicit runtime identity;
- failure truthfulness;
- no success on timeout;
- no success on malformed output;
- no hidden account mutation;
- no hidden installation/login;
- no production repository writes;
- evidence bundle completeness.

The conformance suite must be runnable without live credentials using fixtures/fakes, while the live portability proof remains separate.

---

# 8. Workstream D — Independent reference verifier

## D1. Goal

The current verifier is logically separate, but v0.5 must prove a second implementation does not merely repeat the same code path.

## D2. Independent implementation

Build a small **Python reference verifier** for the minimum stable verification surface.

It must not:

- import the Node verifier;
- shell out to the Node verifier;
- consume a precomputed Node verdict;
- reuse Node helper code through generated bindings.

It may consume shared public schemas/specifications.

## D3. Minimum verification scope

The Python verifier must independently validate at least:

- canonical receipt envelope shape;
- payload SHA-256;
- Ed25519 signature;
- trusted `key_id`;
- task binding;
- worker binding;
- capability binding;
- allowed result state;
- timestamp/freshness;
- runtime provider/ref allowlist;
- duplicate/replay fixture detection at packet level;
- required evidence reference presence.

## D4. Differential corpus

Create a shared fixture corpus with:

- valid receipt;
- modified payload;
- wrong signature;
- unknown key;
- stale receipt;
- future receipt;
- task mismatch;
- worker mismatch;
- capability mismatch;
- runtime mismatch;
- replay;
- missing receipt reference.

Primary Node verifier and Python reference verifier must agree on accept/reject for the corpus.

A mismatch fails CI.

## D5. Independence claim limit

Passing differential tests supports:

> implementation-independent agreement for the tested receipt/evidence contract.

It does not prove the external work itself occurred correctly.

---

# 9. Workstream E — Signing key lifecycle

## E1. Threat model

Document:

- signer identity;
- key owner;
- key generation boundary;
- public trust anchor;
- storage expectations;
- allowed runtime scope;
- rotation;
- expiry if used;
- revocation;
- compromise response;
- historical receipt verification after rotation;
- behavior for revoked key on old vs new receipts.

## E2. Trust registry

Introduce a public-key trust registry format.

Example semantics:

```text
key_id
public_key
status = ACTIVE | RETIRED | REVOKED
valid_from
valid_until?
runtime_provider_scope
runtime_ref_prefixes
revoked_at?
revocation_reason?
```

No private key material may be stored in the repository.

## E3. Rotation proof

Tests must prove:

- old ACTIVE key verifies before rotation;
- new key verifies after activation;
- RETIRED key behavior follows policy;
- REVOKED key cannot validate receipts that policy considers untrusted;
- unknown key fails closed;
- overlapping rotation window is explicit, not accidental.

## E4. Compromise procedure

Permanent docs must give a concrete response sequence for a compromised signer key.

---

# 10. Workstream F — Immutable installation and release integrity

## F1. Default install rule

The default quick-start must no longer silently install mutable `main`.

Preferred behavior:

```text
stable quick-start
-> resolve explicit stable version/tag
-> download immutable release/source artifact
-> verify SHA-256 / release manifest
-> install
```

## F2. Explicit development mode

Installing from `main` remains allowed only through an explicit opt-in such as:

```text
--channel development
```

or:

```text
--ref main
```

The UI/docs must clearly label that path mutable/development.

## F3. Release asset installer

Support immutable release assets where practical:

- full-workforce ZIP;
- selected employee pack workflow where relevant;
- manifest;
- checksum file.

Installer must fail closed on checksum mismatch.

## F4. Version recording

Installed state should record at minimum:

- version/tag;
- source commit;
- artifact checksum;
- install timestamp;
- install channel;
- selected employees.

## F5. Integrity tests

Required negative tests:

- modified ZIP;
- wrong checksum;
- missing checksum;
- unknown release;
- manifest/version disagreement.

No fallback to mutable `main` after verification failure.

---

# 11. Workstream G — Define stability precisely

Introduce separate maturity dimensions.

Minimum model:

| Dimension | Example states |
| --- | --- |
| Artifact | experimental / candidate / stable |
| Contract/API | experimental / candidate / stable |
| Runtime adapter | experimental / candidate / stable |
| Behavioral evidence | unproven / evaluated-case / repeated |
| Real-world workflow | unproven / collecting / demonstrated |
| Provider lifecycle | not-run / partial / validated |

Rules:

- one dimension cannot automatically promote another;
- `stable artifact` does not mean `stable behavior`;
- README/release manifest must expose relevant dimensions;
- release claims must remain machine-readable.

v0.4 historical evidence must remain truthful.

---

# 12. Workstream H — Approval UX: anomaly-first oversight

## H1. Goal

Human approval should answer:

> what changed, what is risky, what failed, and why do you need me?

It should not require reading every output from zero.

## H2. Approval summary contract

Each approval candidate should be able to expose a bounded summary:

- task/risk;
- requested action;
- material changes;
- changed files/resources;
- capability usage;
- capability escalation;
- policy violations;
- failed checks;
- missing evidence;
- anomalies;
- unusual output;
- verification state;
- confidence/status if available and honestly sourced;
- count of passed checks;
- exact reason human judgment is required.

## H3. UI

Approval cards/detail should prioritize:

```text
APPROVAL REQUIRED
2 anomalies
1 missing evidence
14 checks passed
no capability escalation
material changes: 3
```

Full details remain available, but secondary.

## H4. Safe summary rule

The summary must be computed from structured evidence/state where available.

Do not let an agent self-author its own “all clear” approval summary without independent checks.

## H5. UX evidence

Create deterministic fixtures showing:

- routine low-risk case;
- missing evidence;
- capability escalation;
- material file change;
- policy violation;
- mixed pass/fail state.

Tests must assert that risky conditions are surfaced prominently.

---

# 13. Workstream I — Self-test versus external proof inventory

Create a test-evidence inventory classifying checks as:

- `INTERNAL_UNIT`
- `INTERNAL_INTEGRATION`
- `SELF_OBSERVATION`
- `BLACK_BOX_EXTERNAL_BEHAVIOR`
- `CROSS_IMPLEMENTATION`
- `LIVE_RUNTIME_EVIDENCE`
- `REAL_WORLD_EVIDENCE`

For each major release claim, list which evidence classes support it.

The project must not use a self-observation-only test as the sole support for a behavioral claim.

v0.5 must increase the amount of evidence in at least these classes:

- `BLACK_BOX_EXTERNAL_BEHAVIOR`;
- `CROSS_IMPLEMENTATION`;
- `LIVE_RUNTIME_EVIDENCE`.

No vanity percentage is required; classification quality matters more than a numeric target.

---

# 14. Workstream J — Complexity budget

Create a durable complexity ledger for major subsystems.

Minimum fields:

```text
subsystem
problem_solved
property_bought
risk_reduced
evidence
maintenance_surface
runtime_coupling
failure_modes
keep_simplify_delete
owner/review_note
```

Required subsystems include at least:

- runtime adapters;
- cross-harness runner;
- provider doctor;
- evidence verifier;
- execution receipts;
- memory policy/isolation;
- employee packs;
- install lifecycle matrices;
- real-task recorder;
- deferred-evidence/release claims;
- approval queue;
- office runtime reconciliation.

## J1. Delete test

For every subsystem, ask:

> If this project started today, would we still build this?

Allowed answers:

- KEEP
- SIMPLIFY
- MERGE
- DELETE
- DEFER DECISION

At least one concrete simplification/removal must be evaluated.

v0.5 is allowed to conclude that nothing should be deleted, but only if the ledger provides evidence-backed reasons rather than defaulting every row to KEEP.

---

# 15. Workstream K — Pruning and simplification pass

After the complexity ledger:

- remove dead code that is proven unused;
- merge duplicate abstractions where behavior is equivalent;
- remove stale RC-only documentation/configuration if superseded;
- reduce duplicated source-of-truth files;
- preserve compatibility intentionally, not accidentally.

No deletion based only on aesthetics.

Every removal must have:

- dependency search;
- test coverage or replacement evidence;
- migration note if public;
- rollback/recovery path.

---

# 16. Architecture constraints

These constraints are mandatory:

1. No hidden downgrade of v0.4 evidence truth.
2. No private credentials in repo or evidence bundles.
3. No automatic provider installation/login.
4. No destructive external action in portability proof.
5. No mutation of user's real repositories during runtime proof.
6. No “portable” claim from static export only.
7. No “independent verifier” claim when both implementations share verdict-producing code.
8. No mutable-main install presented as the stable default.
9. No approval summary sourced solely from agent prose.
10. No new abstraction without a named property + evidence plan.
11. Historical v0.4 release artifacts/tags must remain immutable.
12. Temporary PRD must not survive final release.

---

# 17. Repository structure proposed for v0.5

Names may change during implementation if a better existing location exists.

```text
config/
  runtime-portability-map.json
  runtime-execution-policy.json
  receipt-trust-registry.example.json
  maturity-model.json
  evidence-classification.json
  complexity-budget.json

packages/
  runtime-execution-adapter/
  portability-evidence/
  approval-summary/

reference-verifier/
  python/
    verifier.py
    tests/

benchmarks/
  portability/
    fixtures/
    evidence/
  verifier-differential/
    fixtures/

docs/
  RUNTIME-PORTABILITY.md
  RECEIPT-KEY-LIFECYCLE.md
  STABILITY-MODEL.md
  APPROVAL-OVERSIGHT.md
  COMPLEXITY-BUDGET.md

scripts/
  portability-proof.mjs
  verify-install-artifact.mjs
  evidence-inventory.mjs
```

Prefer extending existing modules when adding a new package would only rename existing behavior.

---

# 18. Required test layers

## Layer 1 — Static architecture

- portability map schema;
- forbidden core -> Hermes dependency check;
- config/source alignment.

## Layer 2 — Unit

- execution adapter contract;
- normalizer;
- trust registry;
- approval summary;
- maturity model;
- installer verification.

## Layer 3 — Differential

- Node primary verifier vs Python reference verifier.

## Layer 4 — Integration

- Hermes adapter fixture;
- Codex adapter fixture;
- immutable installer path;
- approval summary UI fixtures.

## Layer 5 — Live bounded runtime proof

- one Siti task on Hermes;
- same task on Codex;
- same immutable core hashes;
- no prohibited mutation;
- bounded evidence bundle.

## Layer 6 — Release verification

- Linux;
- Windows;
- minimum supported versions;
- public/security scan;
- packaging;
- immutable install smoke test.

---

# 19. Acceptance criteria

v0.5 implementation is complete only when all mandatory criteria below pass.

## Portability

- [ ] Machine-readable runtime portability map exists and is validated.
- [ ] Portable core has a tested forbidden-dependency rule.
- [ ] Hermes execution adapter exists and passes conformance.
- [ ] Codex execution adapter exists and passes conformance.
- [ ] One canonical worker/task executes through both runtimes.
- [ ] Worker/skill/policy/task/verification inputs are hash-identical across both runs.
- [ ] Adapter-only differences are demonstrated.
- [ ] Evidence bundle is committed only after redaction/public-safety checks.
- [ ] Claim is scoped to the tested reference case.

## Independent verification

- [ ] Python reference verifier exists.
- [ ] It does not reuse primary verifier implementation code.
- [ ] Differential adversarial corpus exists.
- [ ] Node/Python decisions agree on the corpus.
- [ ] CI fails on disagreement.

## Signing key lifecycle

- [ ] Trust registry format exists.
- [ ] ACTIVE/RETIRED/REVOKED semantics exist.
- [ ] Rotation tests pass.
- [ ] Revocation tests pass.
- [ ] Compromise procedure is documented.
- [ ] No private key is committed.

## Installation

- [ ] Stable quick-start defaults to immutable release material.
- [ ] Checksum/manifest verification is mandatory.
- [ ] Mutable `main` path requires explicit development opt-in.
- [ ] Tampered artifact fails closed.
- [ ] Installed version/source/checksum metadata is recorded.

## Stable semantics

- [ ] Artifact/API/adapter/behavior/real-world maturity are separate.
- [ ] README and release claims use the new maturity model.
- [ ] v0.4 historical claims remain accurate.

## Approval UX

- [ ] Anomaly-first approval summary contract exists.
- [ ] UI prominently surfaces anomaly/missing-evidence/escalation/material-change state.
- [ ] Agent prose alone cannot mark the summary safe.
- [ ] Deterministic approval UX fixtures pass.

## Evidence independence

- [ ] Major release claims have evidence-class mapping.
- [ ] At least portability proof is LIVE_RUNTIME_EVIDENCE.
- [ ] Verifier comparison is CROSS_IMPLEMENTATION.
- [ ] External/black-box tests are distinguishable from self-observation.

## Complexity

- [ ] Major subsystem complexity ledger exists.
- [ ] Every row has keep/simplify/merge/delete/defer disposition.
- [ ] At least one simplification/removal decision is deeply evaluated.
- [ ] Dead/stale complexity found by the review is removed or explicitly retained with evidence.

## Release

- [ ] Full CI green.
- [ ] Release gate green.
- [ ] No secrets/private machine paths in public surfaces.
- [ ] Temporary PRD deleted before final release.
- [ ] Permanent docs contain all surviving requirements.

---

# 20. Quality gates / fail-closed conditions

The release must remain blocked if any of these occur:

- portability proof changes core worker definition between runtime runs;
- one runtime receives weaker policy constraints;
- normalized outputs hide a runtime failure;
- portability evidence contains credentials/private machine secrets;
- Python verifier consumes the Node verdict;
- verifier disagreement is ignored;
- revoked/unknown signing key is accepted unexpectedly;
- installer verification failure falls back to mutable source;
- approval summary suppresses a known anomaly;
- maturity model labels unproven behavior as stable;
- complexity ledger is filled with unsupported KEEP decisions;
- new runtime abstraction is added without executable use.

---

# 21. Migration and compatibility

v0.5 should preserve:

- v0.4 employee definitions;
- existing public task/evidence semantics unless versioned;
- v0.4 release artifacts;
- v0.4 receipt verification where policy remains compatible;
- existing Hermes installs where migration is safe.

If a public schema changes:

- version it;
- provide migration/compat behavior;
- add fixture coverage;
- document claim impact.

Do not silently reinterpret old receipts.

---

# 22. Release claim language

Allowed example:

> v0.5 demonstrates reference-case portability for one canonical worker/task across Hermes and Codex with unchanged worker, skill, policy, task, and verification contracts. It also adds cross-implementation receipt verification and immutable stable installation.

Not allowed:

> nyobakantorai works identically on all AI runtimes.

Not allowed:

> signed receipts prove the external action happened correctly.

Not allowed:

> v0.5 is production-proven because CI passed.

---

# 23. Evidence outputs expected

At minimum:

```text
runtime portability map
adapter conformance report
Hermes reference-case evidence
Codex reference-case evidence
core-input hash comparison
normalized-result comparison
Node/Python verifier differential report
key rotation/revocation test report
immutable install integrity report
approval anomaly fixture report
evidence classification inventory
complexity budget + delete-test decision
final release manifest
```

Evidence files must be deterministic where possible and clearly marked when live/environment-specific.

---

# 24. Execution order

The dependency order is:

```text
boundary audit
  -> portability contract
  -> adapter conformance
  -> Hermes/Codex adapters
  -> bounded live portability proof

verifier spec
  -> Python reference verifier
  -> differential corpus

key threat model
  -> trust registry
  -> rotation/revocation tests

release installer design
  -> immutable install implementation
  -> tamper tests

approval summary contract
  -> UI
  -> anomaly fixtures

evidence inventory
  -> stability model
  -> complexity budget
  -> pruning
  -> final convergence
```

Parallel implementation is allowed only when source-of-truth ownership is unambiguous.

---

# 25. Final deletion rule for this PRD

This file is temporary.

Delete it only after:

1. all completed requirements have durable implementation/tests/docs;
2. all incomplete requirements are moved to `ROADMAP.md` or another permanent tracked surface;
3. final release claims have been reconciled;
4. review confirms no requirement exists only in this file;
5. the deletion commit itself passes CI.

Deletion of this file must **not** imply every aspiration shipped.

---

# 26. Definition of Done

v0.5 is done when the project can demonstrate, with bounded evidence:

```text
same worker
+ same skill
+ same task contract
+ same governance
+ same verification contract
        |
        +-- Hermes
        |
        +-- Codex
```

while also showing:

```text
primary verifier
        !=
reference implementation

stable install
        =
immutable artifact + integrity verification

human oversight
        =
anomaly-first judgment
not full manual reread

architecture
        =
property bought + evidence + justified maintenance cost
```

The desired v0.5 story is not:

> “we added more architecture.”

It is:

> **“we proved which architecture matters, proved it across runtime/trust boundaries, reduced avoidable friction, and removed or justified the rest.”**
