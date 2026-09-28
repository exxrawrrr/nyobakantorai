# Runtime Adapter Contract

A runtime adapter connects nyobakantorai to an external agent runtime without granting the UI implicit authority.

Minimum contract:

- `health()` reports availability without mutating state.
- `capabilities()` declares read/write abilities explicitly.
- `listTasks()` returns bounded, sanitized task metadata.
- Every external task must carry stable provenance.
- Write/dispatch capability must default to disabled.
- Secrets remain runtime-scoped and never enter task text or repository state.
- Failed verification must degrade to UNKNOWN/NOT CONNECTED, never optimistic success.

The current Hermes integration implements only the read-only subset. Future adapters should preserve the same fail-closed behavior and map their output into the existing task/evidence model.

The discovery endpoint is:

```text
GET /api/capabilities
```

It is localhost-only and reports the currently active runtime adapter and safety boundaries.
