# Complexity Budget + Delete Test

v0.5 treats complexity as debt that must buy a named property.

Canonical machine-readable ledger: `config/complexity-budget.json`.

Every major subsystem records:

- the problem it solves;
- the property it buys;
- the risk it reduces;
- evidence paths;
- measured maintenance surface;
- runtime coupling;
- known failure modes;
- the delete-test answer;
- `KEEP / SIMPLIFY / MERGE / DELETE / DEFER DECISION`;
- an owner/review note.

The measurement snapshot was taken at commit `a737e87dbcff76fd114a6e3ef4f1107d96ad7e3c`. File/byte counts are maintenance indicators, not quality scores.

## Current delete-test result

| Subsystem | Decision |
| --- | --- |
| Runtime adapters | KEEP |
| Cross-harness runner | KEEP |
| Provider doctor | KEEP |
| Evidence verifier | KEEP |
| Execution receipts | KEEP |
| Memory policy/isolation | KEEP |
| Employee packs | KEEP |
| Install lifecycle matrices | KEEP |
| Real-task recorder | KEEP |
| Deferred evidence / release claims | **MERGE** |
| Approval queue | KEEP |
| Office runtime reconciliation | KEEP |

This is **not** a claim that eleven KEEP rows are free. Each row has explicit failure modes and maintenance cost. The ledger validator rejects an all-KEEP/no-analysis ledger.

## Deep evaluation: merge the package boundary, not the historical evidence

The concrete Chat 19 candidate is:

`packages/deferred-evidence/` → merge under `packages/release-claims/`

Why this is the selected simplification:

- historical v0.4 deferred evidence and release claims are one release-truth pipeline;
- the two package directories currently total four package files / about 18.6 KB;
- the root package is private and currently defines no package exports;
- dependency scan currently finds exactly three importers of `packages/deferred-evidence/index.mjs`: its test, the release-claims test, and `scripts/release-manifest.mjs`;
- the historical JSON ledger and public docs do **not** need to move.

What must be preserved:

- `config/v0.4-deferred-evidence.json`;
- `docs/DEFERRED-EVIDENCE.md`;
- `docs/V0.4-RELEASE-DECISION.md`;
- all negative drift tests;
- release-manifest deferred decision/open-blocker semantics;
- the rule `release-scope acceptance != evidence completion`.

What Chat 19 may remove is only the redundant **top-level package boundary** after the code/tests have moved under release-claims.

## Why the other large subsystems stay

The largest surfaces are not automatically deletion targets. The verifier buys cross-implementation trust; runtime adapters buy portability boundaries; lifecycle matrices guard destructive installer semantics; the real-task recorder is the only accepted path to real-world evidence; reconciliation prevents local claims from masquerading as runtime truth.

Deleting any of those today would remove a property still named by the release/evidence model.

## Guardrail

A non-KEEP row is not permission to delete. Pruning still requires:

1. dependency search;
2. replacement test coverage;
3. migration note if public;
4. rollback/recovery path;
5. exact-head cross-platform CI.

Run:

```bash
npm run complexity:check
```

Chat 18 evaluates. Chat 19 is where the approved simplification is actually executed.
