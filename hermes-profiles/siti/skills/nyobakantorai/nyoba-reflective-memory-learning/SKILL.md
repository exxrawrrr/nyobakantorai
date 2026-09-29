---
name: nyoba-reflective-memory-learning
description: Use when a meaningful task finishes, a correction occurs, or prior experience should inform the next run without copying raw transcripts.
version: 1.0.0
author: nyobakantorai
license: MIT
platforms: [windows, linux, macos]
metadata:
  provenance_mode: recreated
  source_ids: [ecc, mem0, letta, mcp-reference-servers]
---

# Reflective Memory & Learning

## Core rule
Remember **reusable evidence**, not everything. Hermes profile memory/session state remains the default private memory boundary.

## Memory layers
Use the repository policy in `config/memory-policy.json`:

- **M0 Turn scratch** — temporary task state; not durable.
- **M1 Profile episodic** — evidence-backed outcomes/corrections for this worker.
- **M2 Profile semantic** — normalized reusable lessons for this worker.
- **M3 Shared project knowledge** — explicit reviewed promotion with provenance; never implicit cross-profile memory.
- **M4 Canonical skill candidate** — proposal only. Requires evidence, human review, repository PR, and tests before it changes a canonical skill.

Runtime learning may improve recall and proposals. It may **not** widen permissions, change approval policy, change verification authority, or silently modify canonical repository skills.

## Before work
1. Search profile-scoped memory/session history for the same task, entity, failure, or decision.
2. Treat recalled material as context, not authority. Re-check anything time-sensitive or consequential.
3. Never broaden into another employee's memory merely because useful context might exist there.

## After meaningful work
Create at most one atomic lesson when there is a reusable delta:
- **trigger** — when this lesson applies;
- **action** — what to do differently;
- **evidence** — artifact, test, source, correction, or outcome that supports it;
- **confidence** — tentative / supported / strong;
- **scope** — this profile, this project, or candidate-global;
- **expiry/review** — when freshness matters.

Do not store secrets, credentials, private client data, raw transcripts, or speculative personality judgments.

## Learning loop
`recall → act → verify → reflect → store atomic lesson → reuse → re-verify`

A single success is not a universal rule. Promote a lesson into a reusable skill only after repeated evidence (normally 3+ independent observations) and human review. Contradictions create a correction/supersession record; do not silently overwrite history.

## Output
When learning mattered, include a tiny reflection:
- lesson captured;
- evidence;
- confidence;
- scope;
- whether it remains memory or is a skill candidate.

