# Hermes Execution Adapter — v0.5 Reference Case

Status: fixture/conformance proven; live provider execution not yet claimed.

The Hermes execution adapter implements RuntimeExecutionAdapter v1 for the canonical Siti reference case from Chat 4.

Locked core bundle SHA-256:
cf156141c8f825d13250bf4bc6368195787d37564ce41b8be5f0cd1502a6aaa8

The adapter refuses initialization when supplied core bytes do not reproduce that manifest hash.

## Runtime boundary

The adapter is intentionally Hermes-specific and remains outside portable core. The portable worker remains Siti, while the local Hermes profile is runtime metadata outside the canonical core hash. The default runtime profile is `default`, and another safe profile identifier may be supplied explicitly. The adapter preloads exactly the five canonical reference skills and exposes only the skills toolset.

No terminal, web, browser, install, login, account mutation, external write, paid action, destructive action, or production repository write capability is declared.

Invocation shape:
hermes -p <runtime-profile> chat --oneshot --quiet --format stream-json --toolsets skills --ignore-rules --source tool --skills <five canonical skills> --query-file -

The exact five SKILL.md files are staged byte-for-byte in a temporary HERMES_BUNDLED_SKILLS root.

## Core bundle handling

The full canonical bundle is staged for hash and evidence purposes. The model-facing prompt intentionally includes only the reference ID/hash, portable Siti contract, task, source artifact, and skill IDs. Verifier-side expected_result is not shown to Hermes.

## Evidence and mutation guard

The staged temporary workspace is hashed before and after invocation. Any tree change fails closed. Evidence contains content hashes, before/after workspace hashes, code commit, runtime profile identity, and skills-only toolset identity. `--ignore-rules` prevents profile/workspace rules and memory from replacing the canonical Siti contract while retaining user-owned provider configuration. Environment credential values are not persisted.

## Fixture/conformance proof

Chat 5 CI injects a fake process implementation. Tests validate invocation shape, exact bundle binding, structural output normalization, conformance, cleanup, mutation rejection, process failure, and malformed output without a real Hermes/provider call.

## Claim boundary

Chat 5 proves implementation compatibility and exact Chat 4 input binding under deterministic fixture execution. It does not prove Hermes installation, profile configuration, provider auth, a live model call, real Hermes behavioral correctness, Hermes/Codex parity, or general portability.
