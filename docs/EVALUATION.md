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
- an explicit cross-profile contamination negative case whose expected result is no access / UNKNOWN;
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

The dataset began empty, but Phase 6 has now started historical collection:

```text
status = COLLECTING
claim_state = COLLECTING
eligible cases = 1 / 20 minimum
false successes = 0
```

This is still **not** a published baseline.

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

An honest release may currently say:

```text
evaluation_records_valid = true
live_evaluation_complete = false
Playwright MCP = COMPLETED / acceptance passed
Browser Use = NOT_RUN
memory provider = NOT_RUN
real tasks = COLLECTING (1 eligible case)
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

The repository now has a deterministic local visibility resolver plus `benchmarks/memory-isolation/` for this policy boundary. That proves the local filtering contract only. Cognee remains `NOT_RUN / UNPROVEN` until the same boundary is demonstrated against a live provider with evidence.

### Personality invariance

Distinct dialogue fingerprints are a UX layer, not a correctness exception. `benchmarks/personality-invariance/` now deterministically applies the same high-impact lifecycle to all 16 baseline personalities and requires identical governance invariants: owner approval, no self-verification, evidence before VERIFIED, and independent reviewer enforcement.

A later live-model evaluation should compare the same task, evidence, and policy under different employee personalities and record:

- factual/task accuracy;
- uncertainty calibration;
- refusal correctness;
- disagreement correctness.

The deterministic benchmark does not claim those semantic qualities. Personality may change expression, but must not weaken approval, evidence, verification, or policy behavior.

### Fikri live benchmark priority

Token reduction is secondary. A live Fikri benchmark succeeds only when downstream task quality and semantic/source fidelity remain acceptable after compilation. Report original-vs-compiled task success together with token reduction; a large reduction with degraded task success is a failure.

### Controlled live Fikri result — 2026-09-29

The first live-model attempt exposed a real regression: the compiler expanded the five fixtures by about 43.5% on average and paraphrased protected constraints. The benchmark was treated as failed, and the compiler/guard were hardened before rerunning.

The accepted controlled run is recorded in:

- `benchmarks/fikri-live/run-2026-09-29.json`
- `benchmarks/fikri-live/README.md`
- `benchmarks/fikri-live/validate.mjs`

Final controlled metrics:

- 5/5 cases pass;
- average estimated token reduction: 41.10%;
- worst case reduction: 32.56%;
- strict protected-atom and exact source/numeric fidelity: 100%;
- compiled required-fact recall: 100%;
- blind original-context downstream pass: 5/5;
- blind compiled-context downstream pass: 5/5;
- compiled-context critical losses: 0.

The blind review was run in a separate isolated live-model session with the two downstream arms labeled only A/B. Model-based review supplements deterministic exact-atom/source checks; it does not replace the future real-task baseline.

This evidence supports only a controlled live-model Fikri claim. The fixtures are synthetic, so the >=20 eligible real-task baseline remains open and must not inherit this result.

### Cross-harness live readiness — 2026-09-29

The machine-level readiness record is `benchmarks/cross-harness/run-2026-09-29.json`.

On the evaluated GROWTH machine:

- Hermes 0.21.3 is installed, but no model/provider credential or active OAuth session is configured;
- Gemini CLI is not installed;
- GitHub Copilot CLI is not installed;
- Codex CLI 0.154.0 was authenticated and used only as the live-model evaluation runtime.

Therefore static packaging claims remain intact, but live Hermes/Gemini/Copilot behavioral parity remains `UNPROVEN`. No target is promoted to runtime parity from this readiness check.

### Cognee/Hermes live readiness — 2026-09-29

Phase 4 performed a live readiness check on GROWTH against the pinned Cognee integration source (`topoteretes/cognee-integrations@3323e30a...`).

Pinned integration requirements:

- `cognee-integration-hermes-agent` 1.3.1;
- `cognee==1.6.0`;
- Python >= 3.10;
- local mode requires an LLM API key and Hermes memory setup;
- remote mode requires `COGNEE_BASE_URL` plus `COGNEE_API_KEY`.

Observed state on GROWTH:

- Hermes 0.21.3 and Python 3.11.16 are available;
- no `cognee` command is installed;
- the Cognee Python module is not installed;
- no Cognee-related environment configuration was detected;
- no local Cognee integration directory was found;
- Hermes has no configured model/provider credential, no active OAuth session, and no `.env` file.

Therefore **none of the eight required memory-provider cases were executed**. The provider record intentionally remains:

```text
status = NOT_RUN
claim_state = UNPROVEN
environment = null
cases = []
```

This is not an evaluation failure. It is a truthful precondition failure. No package was installed and no credential was created during the check.

Evidence is recorded in:

- `benchmarks/provider-evaluations/memory-readiness-2026-09-29.json`;
- `benchmarks/provider-evaluations/memory-results.json`.

The next valid transition is to configure an isolated Cognee evaluation environment and then execute **all eight** contract cases with evidence. Readiness alone must never promote the provider to `PARTIAL`, `COMPLETED`, or `EVALUATED_CANDIDATE`.

### Browser provider Phase 5 — 2026-09-29

Phase 5 used the same six browser evaluation classes defined in the provider contract:

- read navigation;
- structured evidence;
- write guard;
- auth isolation;
- timeout recovery;
- partial-result recovery.

#### Playwright MCP

The pinned source commit maps to `@playwright/mcp` 0.0.83. It was run on GROWTH through Codex CLI 0.154.0 as the MCP client, using a disposable localhost test server, Chrome headless, an isolated browser profile, and a 1000 ms navigation timeout.

The live run completed all six cases:

- 6/6 case success;
- evidence complete for all six cases;
- false successes: 0;
- human intervention: 0;
- write-guard server mutation count: 0;
- auth endpoint received no session cookie;
- the forced navigation timeout was reported as a timeout rather than success, then recovered to a known-good read page;
- the intentional partial result was not reported as complete, then recovered to a known-good read page.

Evidence:

- `benchmarks/provider-evaluations/evidence/playwright-mcp-2026-09-29/agent-result.json`;
- `benchmarks/provider-evaluations/evidence/playwright-mcp-2026-09-29/server-evidence.json`;
- `benchmarks/provider-evaluations/browser-results.json`.

Under the repository's configured acceptance gate this provider record is now:

```text
status = COMPLETED
claim_state = EVALUATED_CANDIDATE
acceptance_passed = true
```

This is **not production approval** and does not prove performance on arbitrary authenticated or hostile websites. It is a controlled live provider result against the contract's disposable task classes.

#### Browser Use

The pinned Browser Use source commit reports package version 0.13.10 and Python >=3.11.

On GROWTH:

- the Browser Use command is not installed;
- the Python module is not installed;
- no Browser Use environment credential is configured;
- Hermes exposes a bundled `browser-browser-use` plugin, but it is disabled;
- Hermes has no configured model/provider credential for an agent-mode run.

No Browser Use benchmark case was executed. Its provider record therefore remains:

```text
status = NOT_RUN
claim_state = UNPROVEN
environment = null
cases = []
```

Readiness evidence is recorded in `benchmarks/provider-evaluations/browser-use-readiness-2026-09-29.json`.

Because the two providers have not both completed the same six cases, **Playwright MCP vs Browser Use head-to-head comparison remains open**. A single provider candidate result must not be presented as a comparison winner.

### Real-task Phase 6 collection audit — 2026-09-29

The historical pilot ledger was inspected rather than blindly imported.

Source ledger integrity:

- 24 historical records inspected;
- ledger SHA-256: `8cdf0a3b4e8f1064324461b0a14ed8d01b5092919323a0887a6c214f5411f75e`;
- 22 records were rejected because the prompts explicitly identified themselves as sandbox, fictional, hypothetical, or sample-only;
- 1 additional Siti review record was rejected as a separate baseline case because its prompt was generated by the pipeline from the owner request;
- only 1 direct owner task was eligible.

The eligible task is preserved as a **failure / NEEDS_EVIDENCE** result, not rewritten as a success. Praroro produced an idea draft; an independent Siti review then identified unsupported market/opportunity claims, unproven specialist-execution attribution, and a self-declared done status. The final truth state remains `NEEDS_EVIDENCE`.

Evidence:

- `benchmarks/real-tasks/evidence/2026-09-22-p122.json`;
- `benchmarks/real-tasks/source-audit-2026-09-29.json`;
- `benchmarks/real-tasks/dataset.json`.

The dataset therefore remains:

```text
status = COLLECTING
claim_state = COLLECTING
cases = 1
minimum required = 20
acceptance_passed = false
```

The anti-synthetic gate was also hardened during collection. Every real-task case must now provide a direct `source_ref`, set `source_generated=false`, and use typed non-negative metrics. A generated pipeline derivative cannot be relabeled as an owner task merely by changing `source_type`.

Twenty cases will be an initial baseline only. Failure cases must stay in the dataset; they must not be filtered out to improve the success rate.

### Real-task baseline interpretation

Twenty eligible cases are an initial baseline, not statistical proof of general reliability. The dataset must include failures and difficult cases, not only tasks selected because the system is likely to win. Keep false-success rate as a separate safety KPI from task success rate.

### Runtime isolation claim limit

Runtime adapter permission policies are application-level configuration sandboxing. They are not OS process isolation, container isolation, filesystem ACL isolation, or a general-purpose security sandbox. Any future expansion into broader write/network authority must revisit process-level isolation explicitly.


## Self-service real-task collection

`packages/real-task-recorder/` and `scripts/real-task-recorder.mjs` provide a local, append-only path for users to grow the real-task baseline from genuine work.

The recorder:

- uses explicit direct-source attestations;
- rejects generated/synthetic source classes;
- persists only redacted summaries + evidence references;
- rejects secret-like payloads and raw transcript/credential fields;
- hash-chains every lifecycle event;
- rejects self-verification and enforces configured reviewer candidates;
- preserves failures and false-success outcomes;
- exports only completed, independently reviewed lifecycles;
- never auto-publishes or mutates the canonical repository baseline.

This changes the operational path from "the author must personally manufacture 20 tests" to "real users can accumulate eligible evidence as they use the system", without changing the >=20 publication threshold or allowing synthetic fixtures to count.

## Unified provider readiness

`packages/provider-doctor/` and `scripts/provider-doctor.mjs` provide read-only setup detection for optional runtimes/providers.

It intentionally separates:

```text
SUPPORTED
!= INSTALLED
!= CONFIGURED
!= READY_FOR_SELF_TEST
!= LIVE_EVALUATED
```

Credential values are never emitted. OAuth-capable providers without an environment-variable signal remain `UNKNOWN`, rather than being falsely labeled unconfigured. Optional provider absence does not fail core CI unless a caller explicitly uses `--require-installed` or `--require-ready`.


## Browser Use self-service adapter

The repository now ships a provider-optional six-case Browser Use runner:

- `config/browser-self-test.json`;
- `packages/browser-self-test/`;
- `scripts/browser-self-test.mjs`;
- `docs/BROWSER-SELF-TEST.md`.

The adapter is pinned to the repository's Browser Use source commit and package version `0.13.10`.

The self-test intentionally uses the Browser Use CLI's direct browser-control surface rather than requiring an LLM. It launches Chrome/Chromium/Edge with a temporary isolated user-data directory, connects through a loopback CDP endpoint, and navigates only to a disposable loopback target.

The same six contract case IDs are exercised:

```text
read-navigation
structured-evidence
write-guard
auth-isolation
timeout-recovery
partial-result-recovery
```

Server-side evidence independently records requests, cookie presence, and mutation POST count. A provider-side claim cannot override contradictory server evidence.

The self-service result states are deliberately separate from canonical provider-evaluation claims:

```text
SELF_TEST_PASSED
SELF_TEST_FAILED
```

A self-test pass proves only that the user's installed Browser Use CLI adapter completed the disposable local contract. It does **not** automatically promote `benchmarks/provider-evaluations/browser-results.json`, prove model/agent quality, or close the Playwright-vs-Browser-Use head-to-head evaluation.

Core CI does not install Browser Use. The runner architecture is tested with injected provider fixtures plus a real loopback target, including a lying-provider mutation test.


## Cognee self-service memory adapter

The repository now ships a provider-optional Cognee/Hermes eight-case runner:

- `config/cognee-self-test.json`;
- `packages/cognee-self-test/`;
- `scripts/cognee-self-test.mjs`;
- `docs/COGNEE-SELF-TEST.md`.

It is pinned to `topoteretes/cognee-integrations@3323e30a...`, `cognee-integration-hermes-agent` 1.3.1, and Cognee 1.6.0.

The runner intentionally targets the HTTP contract used by the pinned Hermes integration rather than auto-installing or bootstrapping embedded Cognee. A user supplies a compatible local or remote endpoint. Remote execution requires both explicit `--allow-remote` and `COGNEE_API_KEY`; the runner never logs in or mints a key.

Every run creates random `nyoba_eval_*` datasets and refuses to reuse a pre-existing generated dataset name. The runner never intentionally targets the user's normal datasets. Cleanup is attempted and verified for every run-owned dataset; incomplete cleanup prevents a green result.

The same eight memory case IDs are exercised:

```text
profile-isolation
cross-profile-contamination-negative
write-read-roundtrip
provenance
export
delete
secret-rejection
shared-promotion-boundary
```

Secret-like material is rejected before a provider write. Shared memory stays empty until an explicit promotion write. Cross-profile leakage, failed deletion, failed cleanup, or evidence gaps force a truthful failure.

The self-service result states are deliberately separate from canonical provider-evaluation claims:

```text
SELF_TEST_PASSED
SELF_TEST_FAILED
```

A self-test pass proves only the configured endpoint's isolated storage/isolation/export/delete behavior under this runner. It does not prove Hermes lifecycle integration, semantic recall quality, LLM quality, or production reliability, and it does not mutate `benchmarks/provider-evaluations/memory-results.json`.

Core CI installs no Cognee package and contacts no external memory service. Instead it runs the eight-case harness against a disposable local Cognee-compatible HTTP target and includes adversarial contamination, deletion failure, cleanup failure, dataset-reuse refusal, wire-contract, and credential non-disclosure tests.
