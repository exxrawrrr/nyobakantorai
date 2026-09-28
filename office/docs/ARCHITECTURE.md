# Architecture

nyobakantorai is a local-first visual office for human-governed multi-agent work.

## Trust boundaries

- The office server binds to localhost by default.
- The browser task registry is local state, not proof of external execution.
- Runtime adapters are read-only unless an explicit future capability says otherwise.
- Skills define procedures; they do not grant accounts, tools, filesystem access, or model access.
- External writes, publishing, messaging, paid actions, deployments, or account changes require scoped human approval.
- VERIFIED state requires independent evidence.

## Main components

- `office/` — visual dashboard and read-only runtime surface.
- `agents/` — six example public agent profiles.
- `skills/hermes-custom/` — reusable procedural skills.
- `operations/taskctl/` — owner-controlled blocked task intake for Hermes.
- `operations/handoff/` — manual handoff, return receipts, and source provenance gates.
- `operations/workflow/` — deterministic routing preview and QA request flow.
- `operations/doctor/` — read-only local environment diagnostics.
- `packages/task-registry/` — standalone evented task-registry prototype.

## Runtime contract

The office exposes localhost-only health, capabilities, runtime, and task views. When Hermes is not configured, it stays in fast offline mode. A configured adapter must fail closed when task identity, status, or freshness cannot be verified.

See `../docs/RUNTIME-ADAPTER-SPEC.md` for the adapter contract.
