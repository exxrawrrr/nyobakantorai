# Evidence Classification Inventory

v0.5 classifies evidence by **how the system learned something**, not by whether the result looks green.

Canonical machine-readable source: `config/evidence-classification.json`.

## Classes

| Class | Meaning |
| --- | --- |
| `INTERNAL_UNIT` | Pure/component-level logic inside the repository process boundary. |
| `INTERNAL_INTEGRATION` | Multiple repository components exercised together under repository control. |
| `SELF_OBSERVATION` | The system inspects its own configuration/state; useful for readiness, not sufficient for behavioral proof. |
| `BLACK_BOX_EXTERNAL_BEHAVIOR` | Behavior is observed from outside the component/process under test, with independent observable effects where applicable. |
| `CROSS_IMPLEMENTATION` | Independent implementations consume the same contract/corpus and their decisions are compared. |
| `LIVE_RUNTIME_EVIDENCE` | A real model/provider/runtime executes the bounded task/evaluation. |
| `REAL_WORLD_EVIDENCE` | Direct non-generated owner work meeting the real-task eligibility/evidence rules. |

## Fail-closed claim rule

A behavioral claim marked `SUPPORTED` cannot be backed only by `INTERNAL_UNIT`, `INTERNAL_INTEGRATION`, or `SELF_OBSERVATION`. A self-test can prove its own contract; a provider doctor can prove what it observed about readiness; neither alone proves live behavior.

The validator recomputes claim status from explicit evidence IDs, classes, statuses, claim bindings, and minimum qualifying record/unit counts. The committed `expected_status` must match or CI fails.

## Current truth

Supported within bounded scope: anomaly-first approval summary semantics; built office HTTP black-box smoke; Node/Python differential verifier agreement; immutable installer integrity matrix; Fikri five-case controlled live-model regression; Playwright six-case controlled live evaluation with server-side evidence.

Not promoted: canonical Siti Hermes+Codex portability = **UNPROVEN**; real-world baseline = **COLLECTING (1/20)**; complete provider lifecycle = **UNPROVEN**.

## v0.5 evidence-growth gate

- `BLACK_BOX_EXTERNAL_BEHAVIOR`: **INCREASED**
- `CROSS_IMPLEMENTATION`: **INCREASED**
- `LIVE_RUNTIME_EVIDENCE`: **OPEN_REQUIRED**

Historical bounded Fikri/Playwright live evidence stays valid in its scope, but it does not satisfy the missing **new canonical Hermes+Codex portability evidence**.

Run `npm run evidence:inventory:check`.

The inventory is evidence governance, not provider permission or an external-action grant.
