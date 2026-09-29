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


## Release claim snapshot

`npm run release:manifest` now embeds a compact evaluation claim snapshot into `release/manifest.json`.

The snapshot includes:

- whether evaluation records are structurally valid;
- whether all live evaluations are actually complete;
- Playwright MCP / Browser Use status and acceptance result;
- Cognee status and acceptance result;
- real-task baseline status, case count, false-success count, and publication-gate result;
- the project truth boundary.

The manifest generator fails closed if evaluation records are invalid.

An honest release may still say:

```text
evaluation_records_valid = true
live_evaluation_complete = false
browser providers = NOT_RUN
memory provider = NOT_RUN
real tasks = NOT_READY
```

That means the release artifacts are internally consistent while optional live claims remain explicitly unproven. It is not converted into a success claim.


## Signed execution receipt layer

`packages/execution-receipt/` adds a cryptographic evidence layer between authorization and independent verification.

It provides:

- canonical normalized execution payloads;
- Ed25519 signatures;
- SHA-256 receipt references;
- task/employee/capability/result-state binding;
- normalized input/output token counts;
- explicit known/unknown cost semantics;
- tamper detection;
- optional receipt chaining.

`packages/evidence-verifier/` can require and verify signed receipts before accepting an execution claim.

The truth boundary remains:

```text
valid signature
!=
external action correctness
!=
independent verification
```

A signed receipt proves that a trusted key signed an exact payload. The evidence verifier still evaluates facts, artifacts, completion, freshness, authorization, and reviewer policy.


## Review-driven evidence gates

These gates exist to prevent implementation work from being mistaken for real-world proof.

### Claim maturity

Use three distinct claim levels:

```text
IMPLEMENTED
-> DETERMINISTICALLY_VERIFIED
-> REAL_WORLD_EVALUATED
```

A structural validator, static export, passing unit test, or signed receipt can move an item through the first two levels only when the relevant deterministic evidence exists. It does not by itself create a real-world evaluation claim. `NOT_RUN / UNPROVEN` is an acceptable truthful state for provider-dependent work.

### Cross-harness behavioral parity

Static export validity is not behavioral portability. A live cross-harness comparison must use the same task, input, constraints, and intended skill across the compared harnesses, then record:

- output/task success;
- evidence completeness;
- tool behavior;
- policy/refusal behavior;
- failure recovery;
- environment and version metadata.

Material differences are reportable findings, not results to hide.

### Signed-receipt adversarial matrix

Cryptographic validity proves payload authenticity, not external-world correctness. The deterministic adversarial benchmark covers:

- valid receipt;
- tampered receipt;
- replayed receipt;
- wrong task binding;
- wrong employee binding;
- wrong capability binding;
- stale receipt;
- receipt from an unauthorized runtime identity.

Unit coverage separately rejects unknown signing keys. Replay is explicitly state-dependent: callers provide previously consumed receipt references, and duplicate receipts inside one evidence packet are treated as replay.

Every case must end in a truthful state. A valid signature must never bypass independent evidence verification.

### Memory contamination

Memory-provider evaluation must test cross-profile contamination in addition to positive recall. Facts written only to one profile must remain unavailable to another profile unless an explicit, policy-valid shared-memory promotion occurred. The benchmark must include negative queries whose expected answer is `UNKNOWN` / no access.

### Personality invariance

Distinct dialogue fingerprints are a UX layer, not a correctness exception. Evaluation should compare the same evidence and policy under different employee personalities and record:

- factual/task accuracy;
- uncertainty calibration;
- refusal correctness;
- disagreement correctness.

Personality may change expression, but must not weaken approval, evidence, verification, or policy behavior.

### Fikri live benchmark priority

Token reduction is secondary. A live Fikri benchmark succeeds only when downstream task quality and semantic/source fidelity remain acceptable after compilation. Report original-vs-compiled task success together with token reduction; a large reduction with degraded task success is a failure.

### Real-task baseline interpretation

Twenty eligible cases are an initial baseline, not statistical proof of general reliability. The dataset must include failures and difficult cases, not only tasks selected because the system is likely to win. Keep false-success rate as a separate safety KPI from task success rate.

### Runtime isolation claim limit

Runtime adapter permission policies are application-level configuration sandboxing. They are not OS process isolation, container isolation, filesystem ACL isolation, or a general-purpose security sandbox. Any future expansion into broader write/network authority must revisit process-level isolation explicitly.
