# v0.4 Deferred Evidence

Current release decision: **RELEASE_WITH_ACCEPTED_DEFERRALS**  
Owner scope acceptance: **2026-09-30**  
Stable promotion allowed by scope decision: **YES, after final main verify + manual release-gate**

The canonical machine-readable ledger is:

```text
config/v0.4-deferred-evidence.json
```

## What the decision means

The owner explicitly chose to ship v0.4.0 while retaining six evidence classes as deferred scope.

This does **not** convert any evidence state into success. The canonical records remain authoritative:

1. live cross-harness parity — `UNPROVEN`;
2. Cognee live provider — `NOT_RUN / UNPROVEN`;
3. Browser Use live provider — `NOT_RUN / UNPROVEN`;
4. real-task baseline — `COLLECTING 1/20`;
5. major-department real-workflow coverage — `UNPROVEN`;
6. real clean-machine Hermes lifecycle — `NOT_RUN`.

Each ledger item is explicitly marked `accepted_for_v0_4_scope: true` and `blocking_stable_promotion: false`. That is a release-scope decision, not an evidence upgrade.

## Mandatory truth boundary

```text
cataloged != installed != connected != authorized != executed != succeeded != verified
valid signed receipt != external-world correctness != independent verification
static packaging compatibility != behavioral parity
controlled synthetic live-model evaluation != general real-world reliability
application-level policy != OS/container/process isolation
```

## Release mechanics

Stable promotion still requires:

1. promotion to `main`;
2. final cross-platform verify on the exact promoted `main` commit;
3. manual release-gate on that exact commit;
4. only then creation of the `v0.4.0` tag/release.

Scope acceptance changes the release decision, not the underlying evidence.
