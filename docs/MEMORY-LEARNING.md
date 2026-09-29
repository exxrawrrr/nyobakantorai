# Memory and learning model

nyobakantorai workers can learn from prior work, but runtime learning is deliberately separated from authority and canonical repository mutation.

The machine-readable policy is `config/memory-policy.json`.

## Layers

| Layer | Name | Scope | Durable | Promotion |
| --- | --- | --- | --- | --- |
| M0 | Turn scratch | current task | no | none |
| M1 | Profile episodic | one employee | yes | evidence-backed task outcome/correction |
| M2 | Profile semantic | one employee | yes | supported reusable pattern |
| M3 | Shared project knowledge | explicit shared scope | yes | explicit promotion + provenance + human review |
| M4 | Canonical skill candidate | repository candidate | yes | evidence + human review + repository PR + tests |

## Default boundary

All 16 employees default to:

```text
memory_boundary = PROFILE_SCOPED
learning_profile.memory_mode = PROFILE_SCOPED_HERMES_FIRST
```

A worker does not get access to another worker's memory just because the context would be convenient.

Cross-profile knowledge requires an explicit handoff or M3 promotion.

## Memory is not authority

Remembered information may be useful context, but it is not proof that:

- an external provider is connected;
- a task executed;
- a task succeeded;
- a result is verified;
- a permission exists;
- an approval was granted.

Time-sensitive and consequential facts must be rechecked.

## What workers may learn

Useful durable lessons include:

- a verified correction;
- a recurring failure mode;
- a workaround that passed verification;
- a metric-definition correction;
- a project-specific workflow constraint;
- a user-approved operating preference relevant to that role;
- an evidence-backed pattern that reduces retries.

Store atomic lessons, not whole transcripts.

## What must not be promoted

The memory policy rejects:

- credentials;
- API tokens;
- passwords;
- private keys;
- raw transcripts by default;
- unnecessary private client data;
- speculative personality judgments.

Runtime learning also cannot widen permissions, change approval policy, or change verification authority.

## Skill growth

A worker may propose an M4 **skill candidate**.

That is not the same thing as modifying a canonical skill.

The normal promotion path is:

```text
verified task
-> atomic lesson
-> repeated supported pattern
-> skill candidate
-> human review
-> repository PR
-> tests
-> merge
```

The normal evidence threshold is 3+ independent observations, unless an explicit human rule provides a stronger direct basis.

This keeps "the agent learns" from silently becoming "the agent rewrote its own constitution."


## Learning event and skill candidate contracts

The repository now has explicit schemas for governed learning:

- `schemas/learning-event.schema.json`
- `schemas/skill-candidate.schema.json`

Runtime validation helpers live in:

`packages/memory-learning/index.mjs`

### Learning events

Durable learning events require:

- employee/profile ID;
- M1/M2/M3/M4 layer;
- timestamp;
- concise summary;
- evidence references;
- source references;
- sensitivity classification.

Secret-like content is rejected. `SECRET_PROHIBITED` cannot be persisted.

M3 shared knowledge requires an explicit shared scope and human review. Profile memory does not become shared merely because another worker could benefit from it.

### Skill candidates

A runtime worker may propose a skill candidate, but the candidate is not canonical.

Normal evidence basis:

- 3+ independent observations, or
- an explicit human rule.

The allowed transition is:

```text
CANDIDATE
-> REVIEW_REQUIRED
-> MERGED_VIA_REPOSITORY_PR
```

A candidate cannot claim a repository PR before review, and cannot become canonical without explicit human approval plus a repository PR reference.

This makes "skills grow" auditable without allowing hidden self-modification.


## Profile export and deletion

The local memory-learning module exposes explicit profile portability primitives:

- `exportProfileLearningState(...)`
- `deleteProfileLearningState(...)`

Default behavior is intentionally conservative.

A profile export includes only that employee's learning state. Shared M3 knowledge is excluded unless `includeShared=true`.

A profile deletion removes private/profile-scoped learning and non-merged skill candidates for that employee while leaving unrelated workers untouched.

By default, deletion preserves:

- M3 shared/project knowledge that was explicitly promoted;
- skill candidates already merged through a repository PR.

Deleting shared M3 knowledge requires an explicit `deleteShared=true` request.

This prevents "delete Maya memory" from silently erasing project knowledge or Fikri/Siti state.
