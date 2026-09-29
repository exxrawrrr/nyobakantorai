# Evaluation methodology

nyobakantorai treats evaluation as a product requirement, not a demo accessory.

## Deterministic evaluation layers

### Context guard

`benchmarks/context-compaction/` measures approximate token reduction, protected exact-atom recall, and required-fact recall. It does not claim live-model quality.

### Adversarial policy and failure recovery

`benchmarks/adversarial-policy/` attacks high-impact execution without approval, self-verification, non-allowlisted reviewers, approved reviewers without evidence, forged runtime state, out-of-role capability use, CONNECTED-without-evidence claims, and runtime timeout.

Release target:

    false_successes = 0
    false_success_rate = 0

### Evidence verifier

`packages/evidence-verifier/` rejects evidence packets containing wrong exact facts/numbers, missing required evidence, untrusted evidence schemes, stale/future-dated evidence, wrong artifacts, partial completion, unauthorized execution claims, self-verification, reviewers outside the trusted role allowlist, missing verifier policy, or prompt-injection signals.

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


## Real-task dataset gate

The project now has an explicit anti-theater gate for the future real-task baseline:

- `config/real-task-evaluation.json`
- `benchmarks/real-tasks/dataset.json`
- `packages/real-task-evaluation/index.mjs`

The committed dataset starts empty:

```text
status = NOT_READY
claim_state = UNPROVEN
cases = []
```

That is intentional.

Synthetic demos, generated prompts, benchmark fixtures, and other fabricated work cannot count as real-task cases.

Eligible source types are limited to:

- owner real tasks;
- real external requests;
- real repository issues.

A future report requires at least 20 cases, evidence references, redaction review, environment metadata, complete metric fields, and zero false-successes before it may move to `READY_FOR_REPORT`.

The required metrics include:

- task success;
- evidence completeness;
- false-success;
- human intervention;
- retries;
- duration;
- whether cost is known;
- verification result;
- recovery after failure.

The validator also rejects secret-like content from the redacted task summary.

This does not create or fake the 20 cases. It only makes it difficult to accidentally call synthetic/demo work a published real-task baseline.


## Evaluation doctor

Use one command to inspect whether evaluation data is valid and which live-evidence gaps are still open:

```bash
npm run evaluation:doctor
npm run evaluation:doctor:json
```

The doctor treats honest `NOT_RUN / UNPROVEN` baselines as structurally valid, but **not complete**.

It summarizes:

- Playwright MCP / Browser Use evaluation state;
- Cognee memory-provider evaluation state;
- real-task baseline case count and publication-gate state;
- invalid evidence/claim records;
- concrete next evidence required.

For release or automation workflows that explicitly require all live evaluations to exist, run:

```bash
node scripts/evaluation-doctor.mjs --require-live
```

That strict form exits non-zero while any live browser/memory/real-task evaluation is still unproven.

This intentionally separates two questions:

```text
Are the evaluation records honest and structurally valid?
!=
Have all live evaluations actually been completed?
```
