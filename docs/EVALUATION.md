# Evaluation methodology

nyobakantorai treats evaluation as a product requirement, not a demo accessory.

## Deterministic evaluation layers

### Context guard

`benchmarks/context-compaction/` measures approximate token reduction, protected exact-atom recall, and required-fact recall. It does not claim live-model quality.

### Adversarial policy and failure recovery

`benchmarks/adversarial-policy/` attacks high-impact execution without approval, fake verifier identity, forged runtime state, out-of-role capability use, CONNECTED-without-evidence claims, and runtime timeout.

Release target:

    false_successes = 0
    false_success_rate = 0

### Evidence verifier

`packages/evidence-verifier/` rejects evidence packets containing wrong exact facts/numbers, missing required evidence, untrusted evidence schemes, stale/future-dated evidence, wrong artifacts, partial completion, unauthorized execution claims, non-Siti verifier claims, or prompt-injection signals.

A rejection does not prove the underlying work failed. It means the provided packet is insufficient to mark the work VERIFIED.

## Truth boundary

    configured != connected != authorized != executed != succeeded != verified

A provider connection is not evidence that an action occurred. An action receipt is not proof that the requested outcome is correct. A model saying done is not verification.

## Metrics for future live evaluations

Real-task evaluations should record task success, evidence completeness, false-success rate, human intervention, retries, latency/duration, cost, verification outcome, and recovery after provider/tool failure.

Context evaluations should additionally record token reduction, exact constraint retention, numeric fidelity, source-link fidelity, instruction fidelity, and downstream task success before vs after compilation.

## Provider/browser evaluation status

Playwright MCP, Browser Use, Cognee, LLMLingua, and other optional integrations remain evaluation candidates unless permanent documentation explicitly says otherwise.

Cataloged does not mean installed, connected, authorized, or production-approved.

Cross-harness, browser, memory-provider, and live-model evaluations must publish environment, version/commit, task set, failures, and claim limits before being treated as proven capabilities.

## Failure recovery

A recovery evaluation should show that the system returns to a truthful state after provider unavailable, timeout, malformed output, partial result, delayed approval, verifier rejection, or interrupted execution.

Expected flow:

    detect failure
    -> preserve evidence/state
    -> mark BLOCKED / WAITING / REJECTED as appropriate
    -> retry only when policy permits
    -> verify independently before closure


## Provider evaluation contracts

Provider-dependent benchmarks now have machine-readable claim gates:

- `config/provider-evaluation-contracts.json`
- `benchmarks/provider-evaluations/browser-results.json`
- `benchmarks/provider-evaluations/memory-results.json`
- `packages/provider-evaluation/index.mjs`

The committed result records intentionally begin as:

```text
status = NOT_RUN
claim_state = UNPROVEN
```

That is a valid state. It prevents an evaluation placeholder from being interpreted as proof.

### Browser candidates

The comparison contract covers:

- Playwright MCP;
- Browser Use.

A completed browser evaluation must cover the same task classes:

- read navigation;
- structured evidence;
- write guard;
- auth isolation;
- timeout recovery;
- partial-result recovery.

Every case records success, evidence completeness, false-success, intervention, retries, duration, and truthful recovery.

A provider can become only `EVALUATED_CANDIDATE` when:

- false successes = 0;
- evidence completeness = 100%;
- auth isolation passes;
- write guard passes;
- timeout and partial-result recovery return to a truthful state.

This is **not** production approval.

### Memory candidate

The Cognee/Hermes evaluation contract requires:

- profile isolation;
- write/read roundtrip;
- provenance;
- export;
- deletion;
- secret rejection;
- shared-promotion boundary.

A completed candidate must prove zero cross-profile leaks, zero secret persistence, and verified export/delete/provenance behavior.

### Evidence/claim binding

The validator checks provider/integration/source IDs and the exact pinned upstream commit.

For completed or partial runs, the environment must record OS, runtime, provider version, start, and finish timestamps. Every case requires evidence references.

Claim states are derived from status/evidence:

```text
NOT_RUN / PARTIAL -> UNPROVEN
COMPLETED + gate pass -> EVALUATED_CANDIDATE
COMPLETED + gate fail -> EVALUATED_NOT_APPROVED or REJECTED
INVALID -> REJECTED
```

A result cannot label itself candidate while its evidence fails the acceptance gate.
