# Human approval model

nyobakantorai separates **permission** from **capability**.

A model, runtime adapter, installed tool, or available API can be technically capable of an action without being authorized to perform it.

## Risk classes

| Risk class | Default approval |
| --- | --- |
| `READ_ONLY` | not required |
| `LOCAL_WRITE` | not required unless explicitly requested |
| `EXTERNAL_WRITE` | required |
| `PAID_ACTION` | required |
| `ACCOUNT_CHANGE` | required |
| `DESTRUCTIVE` | required |

High-impact tasks start with:

```text
approval_required = true
approval_status   = PENDING
```

They cannot enter execution states until the owner records an explicit approval.

## Decisions

Only the human owner may record:

- `APPROVED`
- `REJECTED`

An approval creates an append-only event and stores a bounded evidence reference. A rejected task may later be approved through a new owner event; the history remains visible.

The office also exposes a dedicated **Approvals** view that collects approval-required local tasks, surfaces pending count, and records owner decisions through the same registry primitive. The queue does not bypass lifecycle or evidence rules.

## What approval does not mean

Approval does **not** prove that:

- an external tool is actually connected;
- a model ran;
- a message was delivered;
- money was spent;
- a deployment completed;
- the result is correct.

Those claims still require runtime/execution evidence and, where applicable, independent QA.

## Hermes/runtime claims

Read-only Hermes claims cannot be approved or mutated from the local office registry. Runtime state remains owned by the runtime adapter and must be reconciled separately.

This design keeps three concepts separate:

```text
human permission
      ≠
technical capability
      ≠
verified execution
```


## Signed execution receipts

Approval answers **may this action happen?** A scoped capability route additionally binds that permission to a concrete employee, capability, action, READ/WRITE mode, and exact resource target. A signed execution receipt answers **what does this trusted runtime key claim happened?**

Approval status without its required approval evidence reference does not authorize a v0.6 GUARDED write route.

See [V0.6-CAPABILITY-POLICY.md](V0.6-CAPABILITY-POLICY.md) for the resource-grant and route-evidence layer.

These concepts are intentionally separate.

For high-impact authorized actions, the normalized receipt requires an approval reference. The receipt is signed with Ed25519 and can be bound to the expected task, employee, capability, and result state.

A valid signature does not make the outcome correct. Independent evidence and reviewer policy still control `VERIFIED`.

See [EXECUTION-RECEIPTS.md](EXECUTION-RECEIPTS.md).
