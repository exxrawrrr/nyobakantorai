# Architecture

nyobakantorai is a local-first visual office for human-governed multi-agent work.

## Trust boundaries

- The office server binds to localhost by default.
- The browser task registry is local state, not proof of external execution.
- Runtime adapters are read-only unless an explicit future capability says otherwise.
- Skills define procedures; they do not grant accounts, tools, filesystem access, or model access.
- External writes, publishing, messaging, paid actions, deployments, account changes, or destructive work require scoped human approval.
- High-impact tasks remain PENDING and cannot enter execution until the owner records APPROVED.
- VERIFIED state requires independent evidence.

## v0.6 architecture ownership

The v0.6 Live Workforce implementation must follow [../../docs/V0.6-ARCHITECTURE-LOCK.md](../../docs/V0.6-ARCHITECTURE-LOCK.md) and [../../docs/ADR-0001-LIVE-WORKFORCE-DOMAIN-OWNERSHIP.md](../../docs/ADR-0001-LIVE-WORKFORCE-DOMAIN-OWNERSHIP.md).

The current browser-local `office/registry.mjs` is a compatibility/UI projection pending a reviewed migration. The canonical future task-domain core is `packages/task-registry/`; v0.6 must not introduce a third task lifecycle. The localhost office server remains a local/read-only runtime trust boundary and is not the future public execution service.

## Main components

- `office/` — visual dashboard and read-only runtime surface.
- `config/employees.json` — canonical workforce registry (16 baseline employees, extensible through the safe generator).
- `config/capabilities.json` — provider-neutral capability/autonomy contract.
- `agents/` — registry-derived public employee SOUL/profile definitions.
- `hermes-profiles/` — generated native Hermes profile distributions with role-scoped skills and fresh-install toolset defaults.
- `skills/canonical/` — reusable procedural skills.
- `operations/taskctl/` — owner-controlled blocked task intake for Hermes.
- `operations/handoff/` — manual handoff, return receipts, and source provenance gates.
- `operations/workflow/` — deterministic routing preview and QA request flow.
- `operations/doctor/` — read-only local environment diagnostics.
- `packages/task-registry/` — standalone evented task-registry prototype.
- `packages/runtime-adapter/` — dependency-free runtime contract plus strict loopback HTTP and JSON CLI read-only adapters.
- `office/hermes-runtime-adapter.mjs` — Hermes-specific read-only adapter boundary; the office server does not execute Hermes commands directly.

## Runtime contract

The office exposes localhost-only health, capabilities, runtime, and task views. When Hermes is not configured, it stays in fast offline mode. A configured adapter must fail closed when task identity, status, or freshness cannot be verified.

See `../docs/RUNTIME-ADAPTER-SPEC.md` for the adapter contract.


## v0.3 workforce invariants

- The registry is the source of truth; generated SOUL/profile/toolset packaging must not drift.
- Six original workers keep owner-authored sprites; additional workers may use explicit `pending-original-art` placeholders.
- Routing is deterministic and advisory; a human assignment always wins.
- `OBSERVE`, `GUARDED`, and `DELEGATED` describe autonomy policy, not tool availability.
- External ads capabilities default to `NOT_CONNECTED`.
- Self-verification is forbidden; VERIFIED requires independent evidence.
- Native Hermes profile updates preserve user-owned runtime state and existing config by default.
