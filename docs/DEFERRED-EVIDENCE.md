# Deferred Evidence Ledger

The v0.4 candidate keeps one machine-readable source of truth for evidence that is intentionally **not** promoted into a stable claim:

```text
config/v0.4-deferred-evidence.json
```

Current release decision:

```text
decision: HOLD
open blockers: 6
stable promotion allowed: NO
```

The six release-evidence blockers are:

1. live cross-harness behavioral parity;
2. canonical live Cognee/Hermes provider evaluation;
3. canonical live Browser Use provider evaluation;
4. the >=20-case real-task baseline;
5. broader evidence-backed department workflow coverage;
6. real clean-machine Hermes lifecycle execution on the intended release environment.

These entries are not implementation failures. Most already have deterministic/self-service infrastructure. They remain open because the stronger **live/real-world evidence claim** has not been demonstrated and intentionally promoted.

## Drift protection

The ledger is validated against canonical evidence sources:

- `benchmarks/cross-harness/run-2026-09-29.json`;
- `benchmarks/provider-evaluations/memory-results.json`;
- `benchmarks/provider-evaluations/browser-results.json`;
- `benchmarks/real-tasks/collection-status-2026-09-29.json`.

CI fails when, for example:

- cross-harness canonical state changes while the ledger still says `UNPROVEN`;
- Cognee or Browser Use becomes completed without release-ledger review;
- real-task collection moves away from 1/20 without updating the ledger;
- the real-task publication gate opens while the release decision still assumes it is closed;
- a blocking item is silently relabeled non-blocking.

## Release manifest

The release manifest includes a compact deferred-evidence snapshot:

```text
decision
open_blockers
stable_promotion_allowed
item id/category/status/blocking flag
```

It intentionally omits free-form operational notes and credential-bearing data.

The release manifest generation itself fails if the deferred ledger is inconsistent with canonical evidence.

## Claim boundary

```text
deterministic/self-service evidence != canonical live evidence
```

Examples:

- a passing Browser Use self-test runner does not automatically become a canonical Browser Use live evaluation;
- a passing Cognee storage/isolation self-test does not automatically prove Hermes live memory behavior;
- static or self-service cross-harness support does not automatically prove broad live behavioral parity;
- a recorder/collector capable of handling 20 real tasks does not mean 20 real tasks exist;
- deterministic install lifecycle matrices do not automatically prove a real clean-machine Hermes lifecycle.

## Completion

A deferred item may change only when its canonical evidence changes and the release decision is explicitly reviewed.

The ledger does not auto-promote the candidate. Even with all evidence complete, stable promotion still requires the explicit PR/main/release-gate path documented in `docs/V0.4-RELEASE-DECISION.md`.
