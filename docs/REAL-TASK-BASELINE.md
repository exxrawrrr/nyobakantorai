# Real-Task Baseline Collection

The real-task baseline is designed to collect **genuine work**, not manufacture a benchmark target.

Current canonical state:

```text
eligible real tasks: 1 / 20
remaining:           19
false-successes:     0
publication gate:    NOT PASSED
```

The one currently eligible historical case is intentionally preserved as a failure: an owner task produced a draft, independent review returned `NEEDS_EVIDENCE`, and the task was not falsely upgraded to verified success.

Machine-readable checkpoints:

```text
benchmarks/real-tasks/collection-status-2026-10-04.json   # current
benchmarks/real-tasks/collection-status-2026-09-29.json   # historical
```

### 2026-10-04 initial-ten evidence campaign

The owner-requested initial batch of ten direct real tasks completed its recorder lifecycle against repository head `67f7686def33af38d412ab07218dfb1b1440a442`. The hash-chained ledger validated with 30 events / 10 closed cases and no integrity errors.

```text
worker successes:        5
worker failures:         5
verification passes:     6
verification failures:   4
false-successes:         2
canonical promoted:      NO
canonical state:         1 / 20
```

The false-success cases are `real-20261004-initial10-03-nara` and `real-20261004-initial10-10-tari`. They are preserved as evidence rather than rerolled or hidden. The campaign snapshot audits successfully, but it is intentionally **not merged into the canonical dataset**, because doing so would violate the zero-false-success publication boundary. GitHub `main` advanced to `862733cd817e366bffad348f4a1b05d25e7d7777` during collection only through the Telegram-office documentation update; the test provenance remains bound to the earlier tested head.

Repository-facing evidence is stored under `benchmarks/real-tasks/evidence/2026-10-04/` with the complete recorder snapshot at `benchmarks/real-tasks/recorder-snapshot-2026-10-04-initial10.json`.

## Collection pipeline

The intended path is:

```text
direct real source
  -> Real Task Recorder
  -> TASK_STARTED
  -> TASK_FINISHED
  -> independent TASK_VERIFIED
  -> recorder export
  -> baseline audit
  -> baseline merge candidate
  -> publication gate
  -> READY_FOR_REPORT
  -> explicit repository review
  -> publication
```

There is no supported shortcut from a synthetic prompt, demo, generated reviewer task, PR body, commit message, or benchmark fixture into the real-task baseline.

## 1. Record genuine work

Use the hash-chained recorder:

```bash
npm run real-task:recorder -- start --input start.json
npm run real-task:recorder -- finish --input finish.json
npm run real-task:recorder -- verify --input verify.json
npm run real-task:recorder -- export --out recorder-snapshot.json
```

See `docs/REAL-TASK-RECORDER.md`.

A valid case requires:

- eligible direct source type;
- non-generated source;
- source reference;
- canonical employee identity;
- redacted task summary;
- complete execution metrics;
- evidence references;
- independent review;
- redaction review.

Failures are valid evidence and must not be filtered out.

## 2. Check canonical collection status

```bash
npm run real-task:baseline -- status
```

The status command reports:

- current eligible case count;
- minimum required count;
- remaining cases;
- successes and failures;
- verification passes/failures;
- false-success count;
- recovery count;
- known-cost count;
- represented employees;
- represented source types;
- non-blocking coverage warnings.

Coverage warnings do not replace the publication gate.

## 3. Audit a recorder snapshot

```bash
npm run real-task:baseline -- audit --snapshot recorder-snapshot.json
```

Multiple snapshots can be audited:

```bash
npm run real-task:baseline -- audit \
  --snapshot snapshot-a.json \
  --snapshot snapshot-b.json
```

Audit is read-only. It does not alter the canonical dataset.

A snapshot is rejected if it contains, among other things:

- synthetic/demo/generated source types;
- `source_generated != false`;
- unknown employee IDs;
- malformed metrics;
- secret-like summaries or source references;
- duplicate source references;
- semantic contradictions such as a verification pass without complete evidence;
- a false-success attached to an already-declared failed task;
- a false-success that simultaneously claims verification passed.

## 4. Merge to a review candidate

```bash
npm run real-task:baseline -- merge \
  --snapshot recorder-snapshot.json \
  --out baseline-candidate.json
```

The merge command:

- validates the existing canonical dataset first;
- validates every snapshot;
- preserves existing failures;
- skips byte-equivalent duplicate cases;
- rejects conflicting case IDs;
- rejects the same direct source appearing under another case ID;
- sorts cases deterministically;
- writes only to the explicit candidate output.

It **refuses** to overwrite:

```text
benchmarks/real-tasks/dataset.json
```

This is deliberate. Local collection cannot silently rewrite the repository's canonical evidence.

## 5. Prepare a report candidate

Only after the canonical publication gate is satisfied:

```bash
npm run real-task:baseline -- prepare \
  --input baseline-candidate.json \
  --out baseline-ready-for-report.json
```

The machine gate requires at least:

```text
20 eligible direct real tasks
0 false-successes
complete evidence
environment metadata
redaction reviewed
direct non-generated source
unique source reference per case
```

A passing prepare produces:

```text
status      = READY_FOR_REPORT
claim_state = EVALUATED_BASELINE
```

It does **not** produce `PUBLISHED`.

## No automatic publish command

This is intentionally forbidden:

```bash
npm run real-task:baseline -- publish
```

The command exits with an error.

Publication requires explicit repository/human review after the prepared evidence is inspected.

## Why PRs and commits are not automatically counted

A commit or PR proves repository activity. It does not necessarily prove that:

- the source request came directly from a human/real external requester;
- the source was not AI-generated;
- a named workforce employee actually executed the task;
- the employee result was independently verified;
- the execution metrics are known.

Therefore the baseline collector does not bulk-import Git history as "real work".

Repository issues may qualify only when they are themselves a genuine direct request and the execution lifecycle satisfies the same evidence rules.

## Coverage recommendations

The collection tool emits warnings when coverage is narrow, for example:

- only one employee represented;
- no successful task represented;
- no failure represented;
- no verification failure represented.

These are **recommendations**, not hidden publication requirements.

The canonical gate remains the machine-readable policy in:

```text
config/real-task-evaluation.json
```

The purpose is to avoid cherry-picking while not inventing arbitrary blockers.

## Trust boundary

```text
recorded != direct
direct != executed
executed != succeeded
succeeded != verified
verified != statistically general
```

A 20-case baseline is an **initial real-task baseline**, not proof of universal reliability.
