# Codex Execution Adapter — v0.5 Reference Case

Status: fixture/conformance proven; live Codex execution not yet claimed.

The Codex execution adapter implements RuntimeExecutionAdapter v1 for the exact same Chat 4 Siti reference case used by the Hermes adapter.

Locked core bundle SHA-256:
ce77d083d805bdca33d6c096c55071627d017758deff41ea0ed8b23897119c64

No Codex-specific worker or task fork exists.

## Runtime boundary

The adapter is intentionally Codex-specific and remains outside portable core. It follows the repository's existing cross-harness invocation shape:

codex exec --skip-git-repo-check --sandbox read-only --ephemeral --ignore-user-config --ignore-rules -c model_reasoning_effort="low" --json -

The adapter does not use --dangerously-bypass-approvals-and-sandbox.

Exactly the five Chat 4 canonical SKILL.md files are staged byte-for-byte under .agents/skills in a disposable workspace.

## Core-bundle handling

The adapter refuses initialization if the supplied core bytes do not reproduce the Chat 4 manifest hash. It also requires the canonical Siti READ_ONLY task and exact five-skill set.

The full canonical bundle is staged for hash/evidence purposes. The model-facing prompt intentionally excludes verifier-side expected_result.

## Evidence and mutation guard

The disposable workspace is snapshotted before and after invocation. Any tree mutation fails closed. Evidence contains the core hash, workspace hashes, code commit, read-only sandbox identity, ephemeral-session identity, and .agents/skills staging identity.

The adapter does not persist credential values.

## Fixture/conformance proof

Chat 6 CI injects a fake Codex process implementation. Tests validate exact invocation arguments, exact canonical skill bytes, shared Hermes/Codex core binding, conformance, cleanup, mutation rejection, nonzero-process rejection, and malformed-output rejection without a live Codex/provider call.

## Claim boundary

Chat 6 proves Codex adapter implementation compatibility and exact Chat 4 input binding under deterministic fixture execution. It does not prove Codex installation, account/provider auth, a live model call, real Codex behavior, Hermes/Codex parity, or general portability.


## Chat 10 live hardening

The live adapter now ignores user config and user/project rules while retaining Codex authentication. This prevents local model/tool/rule configuration from silently changing the reference-case behavior. Cleanup retries bounded deletion to tolerate short Windows file-release delays after process termination.


The reference invocation's reasoning effort is explicitly bounded to `low` as runtime metadata. On 2026-10-01 the canonical execution policy was deliberately re-baselined from 10 seconds to a 45-second bounded maximum after authorized live diagnostics showed real Hermes/Codex latency exceeded 10 and sometimes 30 seconds. That timeout is now part of the canonical policy/core hash; it is not an adapter-only exception.
