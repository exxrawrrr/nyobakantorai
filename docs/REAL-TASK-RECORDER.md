# Real Task Recorder

The Real Task Recorder collects **actual user work** without pretending synthetic fixtures are real-world evidence.

It is intentionally local, append-only, dependency-free, and privacy-conservative.

## What it records

A case moves through three immutable events:

```text
TASK_STARTED
  -> TASK_FINISHED
  -> TASK_VERIFIED
```

Every event is SHA-256 hash-chained to the previous event. A changed, removed, or reordered event makes ledger validation fail.

The recorder stores only:

- direct source type + reference;
- an explicit non-generated source attestation;
- employee ID;
- redacted task summary;
- timestamps;
- evidence references;
- bounded operational metrics;
- independent reviewer outcome.

It rejects raw transcript/credential-style fields and secret-like material.

## Local storage

Default ledger:

```text
.nyobakantorai/real-task-recorder/ledger.jsonl
```

The directory is gitignored and user-owned. Writes use a local lock file and mode-restricted files where the platform supports it.

You can override the ledger:

```bash
npm run real-task:recorder -- status --ledger /path/to/ledger.jsonl
```

## 1. Start a real task

Create `start.json`:

```json
{
  "source_type": "owner_real_task",
  "source_ref": "owner-task://chat/2026-09-29/001",
  "source_generated": false,
  "source_attestation": "OWNER_DIRECT",
  "employee_id": "subagjo",
  "task_summary": "Redacted summary of the actual user request.",
  "redaction_reviewed": true
}
```

Then:

```bash
npm run real-task:recorder -- start --input start.json
```

The command returns the generated `case_id`, event hash, ledger head hash, and collection summary.

Allowed direct-source attestations:

| source_type | source_attestation |
| --- | --- |
| `owner_real_task` | `OWNER_DIRECT` |
| `external_real_request` | `EXTERNAL_DIRECT` |
| `repository_real_issue` | `REPOSITORY_ISSUE` |

`synthetic`, `demo`, `generated`, and benchmark fixtures remain ineligible.

## 2. Finish the work

```json
{
  "case_id": "real-...",
  "success": false,
  "evidence_refs": ["receipt://...", "commit://..."],
  "human_intervention": 1,
  "retries": 0,
  "cost_known": false,
  "recovered_after_failure": false,
  "outcome_note": "The task ended blocked by missing external evidence."
}
```

Run:

```bash
npm run real-task:recorder -- finish --input finish.json
```

`duration_ms` is calculated from the recorded start time unless supplied explicitly.

Failure is a valid result. The recorder must not discard it.

## 3. Add independent verification

```json
{
  "case_id": "real-...",
  "reviewer_employee_id": "siti",
  "verification_passed": false,
  "false_success": false,
  "evidence_complete": true,
  "evidence_refs": ["review://..."],
  "verification_note": "Result remained NEEDS_EVIDENCE."
}
```

Run:

```bash
npm run real-task:recorder -- verify --input verify.json
```

Self-verification is rejected. The reviewer must also satisfy the employee's configured `verification_policy`.

## Integrity and status

```bash
npm run real-task:recorder -- validate
npm run real-task:recorder -- status
```

Status reports:

- started-only cases;
- cases awaiting review;
- verified cases;
- successes;
- failures;
- verification passes;
- false-success count.

## Export

```bash
npm run real-task:recorder -- export --out my-real-task-snapshot.json
```

Only completed + independently verified lifecycles become dataset cases.

Export **never** changes the repository benchmark automatically and never auto-promotes a report to published status. It remains `COLLECTING` until explicitly reviewed through the existing real-task publication gate.

## Trust boundary

The recorder improves provenance and prevents common benchmark theater, but it cannot prove that a human lied honestly about `source_generated=false`.

The intended trust chain is:

```text
direct user/external/repository source
-> source_ref + attestation
-> immutable local event chain
-> evidence refs
-> independent reviewer
-> evaluator publication gate
```

Do not treat recorder presence alone as proof of real-world reliability.
