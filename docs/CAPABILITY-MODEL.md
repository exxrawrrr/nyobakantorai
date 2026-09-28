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
