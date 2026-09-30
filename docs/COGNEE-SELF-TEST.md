# Cognee Self-Service Eight-Case Memory Runner

This repository ships a **provider-optional Cognee/Hermes memory self-test** without installing Cognee, installing the Hermes plugin, logging in, minting an API key, or modifying the canonical provider benchmark.

The runner answers:

> "If a user provides a compatible Cognee HTTP endpoint, does the repository adapter preserve the required storage/isolation/export/delete boundaries?"

It does **not** answer:

> "Is Cognee/Hermes memory generally reliable, is a particular LLM good at recall, or is the full Hermes lifecycle integration production-proven?"

Those claims remain separate.

## Pinned upstream contract

The runner is designed against the repository-pinned source:

```text
topoteretes/cognee-integrations
commit: 3323e30a71564eccc1794b8c4a0bac84fc3d2b30

cognee-integration-hermes-agent: 1.3.1
cognee: 1.6.0
transport: HTTP
```

The upstream Hermes integration uses the same HTTP shapes for health, dataset creation/listing, permanent memory writes, recall, raw-data inspection, and dataset-scoped forgetting.

## Why HTTP mode

The self-test intentionally does **not** bootstrap embedded Cognee or a local Cognee server.

That avoids:

- hidden package installation;
- hidden model-provider setup;
- hidden credential creation;
- local database/single-writer assumptions;
- modifying the user's Hermes home;
- silently starting a background memory service.

The user owns the endpoint. It may be a local compatible server or a remote server they explicitly authorize.

## Plan: zero provider calls

```bash
npm run memory:self-test:plan
npm run memory:self-test:plan -- --json
```

The plan only inspects configuration signals.

Default target:

```text
http://127.0.0.1:8011
```

Or configure:

```bash
COGNEE_BASE_URL=http://127.0.0.1:8011
```

The plan reports endpoint **configuration readiness**, not reachability:

```text
endpoint_reachability = NOT_CHECKED
provider_call_performed = false
```

No health check, write, delete, login, key mint, or other Cognee call is made by the plan.

## Remote targets

Remote execution is intentionally two-keyed.

A remote target requires:

1. `--allow-remote`
2. `COGNEE_API_KEY` in the environment.

Example:

```bash
COGNEE_BASE_URL=https://your-cognee.example
COGNEE_API_KEY=...
npm run memory:self-test -- --allow-remote --json --out cognee-self-test.json
```

API keys are **not accepted as command-line arguments** because shell history is not an appropriate credential store.

Credential values are never written into the evidence report. Request evidence contains method/path/status/duration metadata only.

## Isolated datasets

Every run generates random dataset names under:

```text
nyoba_eval_<run>_...
```

The runner refuses to reuse a generated dataset if it already exists.

It never intentionally writes to or deletes:

- the user's normal Cognee dataset;
- `agent_sessions`;
- a named project dataset;
- any dataset not generated for that specific self-test run.

Cleanup is attempted for every dataset created by the run. Cleanup verification is part of the final result; incomplete cleanup prevents a green `SELF_TEST_PASSED`.

## Eight cases

The runner implements the same eight IDs defined by the canonical memory-provider evaluation contract.

### profile-isolation

Creates separate profile A and profile B datasets, writes unique markers, exports both, and verifies each dataset contains only its own marker.

### cross-profile-contamination-negative

Re-inspects the profile datasets as a negative test. Any profile-A marker in profile B, or profile-B marker in profile A, is a failure with:

```text
cross_profile_leak = true
```

### write-read-roundtrip

Writes an exact marker and verifies it through raw dataset inspection.

A `CHUNKS` + `only_context` recall probe is also attempted. The recall probe is reported separately and is not allowed to turn a failed raw roundtrip into a pass.

This keeps the core result independent from model/LLM semantic quality.

### provenance

Writes an explicit provenance envelope containing:

```text
source=owner_self_test
run=<run-id>
scope=isolated
```

The exact envelope must survive export.

### export

Writes two unique records and requires both to appear in the dataset export. The report stores an export SHA-256 rather than dumping unrelated provider data.

### delete

Writes a marker, verifies it exists, performs a dataset-scoped forget, and verifies the marker is absent afterward.

A server merely returning "deleted" is not enough.

### secret-rejection

A deliberately secret-shaped payload is passed to the local safety guard.

It must be rejected **before** a provider write is made. The test then exports the isolated secret-test dataset and verifies the marker never persisted.

### shared-promotion-boundary

Writes a marker to profile A and first proves it is absent from the isolated shared dataset.

Only then does the runner perform an explicit promotion write containing provenance back to profile A.

The marker must:

- appear in shared memory only after explicit promotion;
- remain absent from profile B.

This proves the harness boundary. It does not claim full Hermes M3 promotion semantics; that remains a separate lifecycle claim.

## Result states

```text
SELF_TEST_PASSED
SELF_TEST_FAILED
```

A pass requires:

- all eight cases successful;
- evidence complete for every case;
- zero false-successes;
- zero cross-profile leak;
- deletion verified;
- export verified;
- provenance verified;
- no secret persistence;
- cleanup verified for every run-owned dataset.

A pass means only:

> the configured Cognee HTTP endpoint satisfied the repository's isolated storage/isolation self-test.

It does not automatically edit:

```text
benchmarks/provider-evaluations/memory-results.json
```

The canonical provider record remains `NOT_RUN / UNPROVEN` until a separately reviewed live Cognee/Hermes provider evaluation is intentionally committed.

## Deterministic CI without Cognee

Core CI does not install Cognee or contact an external memory provider.

Tests start a disposable local Cognee-compatible HTTP target implementing the pinned wire shapes. The test suite exercises:

- health;
- dataset create/list;
- multipart permanent write;
- `CHUNKS` recall;
- raw export;
- dataset-scoped forget;
- all eight cases;
- secret pre-write rejection;
- forced cross-profile contamination;
- failed deletion/cleanup;
- pre-existing evaluation dataset refusal;
- API-key non-disclosure.

This proves the runner architecture and failure semantics while keeping Cognee optional.
