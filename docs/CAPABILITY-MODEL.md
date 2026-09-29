# Capability, tool and MCP model

The public capability contract lives in `config/capabilities.json`.

```text
configured ≠ connected ≠ executed ≠ succeeded ≠ verified
```

Capability states are `CONNECTED`, `NOT_CONNECTED`, `PARTIAL`, and `ERROR`. Public defaults fail closed to `NOT_CONNECTED`.

## Authorization is separate

A connected tool does not grant permission. `READ_ONLY` may operate without write approval; `EXTERNAL_WRITE`, `PAID_ACTION`, `ACCOUNT_CHANGE`, and `DESTRUCTIVE` require scoped human approval unless a user explicitly defines a narrower delegated envelope.

External provider capabilities are provider-neutral contracts. Maya and Gugun consume `ads.meta.*` and `ads.google.*`; nyobakantorai does not copy proprietary plugin, connector, or ads-engine source.

Hermes MCP servers generate dynamic toolsets such as `mcp-<server>` at runtime. Credentials and authorization remain in the user's Hermes/provider configuration, never in this repository.


## Negotiation engine

`packages/capability-router/` is the provider-neutral enforcement layer. A provider adapter submits a timestamped capability snapshot. The router refuses `CONNECTED` without an evidence reference, fails missing capabilities closed to `NOT_CONNECTED`, and applies OBSERVE/GUARDED/DELEGATED policy before a caller may proceed.

This router authorizes intent only; it does not execute Meta/Google actions and does not store credentials.


## Worker eligibility

Connection state and human approval are not enough by themselves.

Each employee has a machine-readable `operational_contract.capability_scope` in `config/employees.json`.

The capability router exposes `authorizeForEmployee(...)` and applies this order:

```text
known capability
-> valid employee contract
-> capability is inside worker scope
-> provider proves CONNECTED
-> autonomy/approval policy
-> allowed
```

A worker outside the capability scope receives:

```text
WORKER_CAPABILITY_OUT_OF_SCOPE
```

before provider connection details are resolved.

This prevents role drift. Examples:

- Fikri can own `context.repo.pack` and experimental context compression but not `ads.meta.write`.
- Maya can use Meta Ads capability contracts but not Google Ads write contracts.
- Gugun can use Google Ads contracts but not Meta Ads write contracts.
- Sumiati, Bambang, and Tari have empty external capability scopes by default.

Worker scope is **eligibility**, not permission. An eligible write still needs connected-provider evidence and the relevant approval/delegated policy.


## Machine-readable taxonomy

The capability vocabulary is centralized in `config/capability-taxonomy.json`.

Kinds:

```text
skill
tool
mcp
plugin
extension
workflow
memory
hook
adapter
policy
```

The generated inventory is `config/capability-catalog.json`.

Run:

```bash
npm run capability-catalog:generate
npm run capability-catalog:check
```

The catalog is generated from the employee registry, provider-neutral capability contracts, optional integrations, upstream source registry, skill provenance, and canonical skill directories. It is not a second editing surface.

Each catalog entry records:

- kind;
- origin/usage mode;
- default state;
- risk class;
- required/optional workers;
- platforms;
- install method;
- verification method;
- source commit/license snapshot where external;
- canonical artifact reference.

The current catalog intentionally distinguishes:

```text
cataloged != installed != connected != authorized != executed != verified
```

CI rejects catalog drift, unknown workers/sources, source commit/license drift, invalid kinds/states/risks, missing verification/install methods, and unsafe bundled high-impact capabilities.
