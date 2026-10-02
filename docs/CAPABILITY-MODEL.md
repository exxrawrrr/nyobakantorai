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


## Capability taxonomy inventory

The broader machine-readable inventory is generated into `config/capability-catalog.json` from canonical project sources. Its taxonomy is defined in `config/capability-taxonomy.json` and documented structurally by `schemas/capability.schema.json`.

Kinds currently represented:

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

Run:

```bash
npm run capability-catalog:generate
npm run capability-catalog:check
npm run test:capability-catalog
```

The catalog is generated, not hand-maintained. CI rejects drift, unknown upstream sources, unsafe bundled defaults, and role mappings that accidentally turn specialist capabilities into universal access.


## Connector Center boundary (CHAT 18)

External integrations now have a separate lifecycle in `packages/connector-center/`.

This does not replace the Capability Router.

The authorization chain is:

```text
connector definition
  -> current connection lifecycle state
  -> exact connector grant
  -> connector route evidence
  -> capability-router employee scope
  -> exact capability/resource grant
  -> runtime binding/execution
```

A connector with state `CONNECTED` proves only that a reviewed connection exists. It does not grant universal employee, capability, action, or resource access.

Connector grants bind exact:

- employee;
- connector;
- capability;
- READ/WRITE mode;
- action;
- resource type + resource ID.

Wildcards are rejected.

Disconnect, terminal revoke, implicit expiry, explicit expiry, grant expiry, and grant revocation all fail closed.

Credential material remains reference-only. Repository and connector-route evidence do not contain raw provider secrets.

The initial practical provider adapter is `google-ads-readonly`, which maps to the existing `ads.google.*` read capabilities and exposes no mutation operation.

See `docs/V0.7-CONNECTOR-CENTER.md`.


## Browser Agent action boundary (CHAT 19)

`browser.structured` remains conservatively classified as `EXTERNAL_WRITE`.

CHAT 19 does not lower that risk classification. Instead it adds an operational browser-action layer that must consume both Connector Center and Capability Router authorization.

```text
browser connector CONNECTED
  -> exact connector route
  -> exact capability route
  -> Browser Scope (employee + exact origin + flow + expiry)
  -> READ or MUTATION action plan
  -> disposable browser profile
  -> provider execution
  -> content-addressed browser action evidence
```

Browser Agent supports three canonical flows:

- `PUBLIC_RESEARCH` — exact public HTTPS origins, READ only;
- `USER_OWNED_AUDIT` — exact owned origin with ownership evidence;
- `LOCALHOST_QA` — exact loopback origin for QA/reproduction.

Page content remains untrusted data and cannot expand scope, approve actions, or request mutations. Injection signals are recordable on READ and block MUTATION.

MUTATION additionally requires a WRITE route, human approval evidence, pre-action state, execution receipt, and post-action state.

Browser profiles are disposable, cannot reuse the user's normal browser profile, cannot inherit cookies, and must be explicitly cleaned up.

See `docs/V0.7-BROWSER-AGENT.md`.


## Skills Store authority boundary (CHAT 21)

Reusable skills are procedural capability, not authority.

```text
skill catalog
  -> owner-reviewed installation
  -> owner-reviewed attachment
  -> effective employee procedures
  != connector/tool/provider permission
```

Skill installation and attachment must preserve the employee's existing:

- capability scope;
- preferred toolsets;
- external capabilities;
- optional integrations;
- approval policy;
- verification policy;
- memory boundary.

The Skills Store rejects attempts to smuggle connector grants, capability grants, toolsets, permissions, autonomy changes, or approval-policy changes into install/attach input.

All 16 current employees have one capability loop and one reviewed upgrade attachment. These upgrades improve procedures without widening the authority graph.

New headcount now requires a documented capability gap after considering whether an existing employee can be upgraded through reusable skills.

See `docs/V0.7-SKILLS-STORE.md`.
