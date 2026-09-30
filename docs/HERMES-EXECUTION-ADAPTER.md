# Hermes Execution Adapter — v0.5 Reference Case

Status: fixture/conformance proven; live provider execution not yet claimed.

The Hermes execution adapter implements RuntimeExecutionAdapter v1 for the canonical Siti reference case from Chat 4.

Locked core bundle SHA-256:
0c32963e42471e3ab14c74dc99f627cab254d45cfbc2de07bfe870abd7811fee

The adapter refuses initialization when supplied core bytes do not reproduce that manifest hash.

## Runtime boundary

The adapter is intentionally Hermes-specific and remains outside portable core. It targets profile Siti and preloads exactly the five canonical reference skills. The one-shot invocation exposes only the skills toolset.

No terminal, web, browser, install, login, account mutation, external write, paid action, destructive action, or production repository write capability is declared.

Invocation shape:
hermes -p siti chat --oneshot --quiet --format stream-json --toolsets skills --skills <five canonical skills> --query-file -

The exact five SKILL.md files are staged byte-for-byte in a temporary HERMES_BUNDLED_SKILLS root.

## Core bundle handling

The full canonical bundle is staged for hash and evidence purposes. The model-facing prompt intentionally includes only the reference ID/hash, portable Siti contract, task, source artifact, and skill IDs. Verifier-side expected_result is not shown to Hermes.

## Evidence and mutation guard

The staged temporary workspace is hashed before and after invocation. Any tree change fails closed. Evidence contains content hashes, before/after workspace hashes, code commit, Siti profile identity, and skills-only toolset identity. Environment credential values are not persisted.

## Fixture/conformance proof

Chat 5 CI injects a fake process implementation. Tests validate invocation shape, exact bundle binding, structural output normalization, conformance, cleanup, mutation rejection, process failure, and malformed output without a real Hermes/provider call.

## Claim boundary

Chat 5 proves implementation compatibility and exact Chat 4 input binding under deterministic fixture execution. It does not prove Hermes installation, profile configuration, provider auth, a live model call, real Hermes behavioral correctness, Hermes/Codex parity, or general portability.
