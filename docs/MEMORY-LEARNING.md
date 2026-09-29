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
