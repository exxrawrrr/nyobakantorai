# Runtime Adapter Contract

A runtime adapter connects nyobakantorai to an external agent runtime without granting the UI implicit authority.

The canonical v1 implementation lives in `packages/runtime-adapter/` and exports:

- `defineRuntimeAdapter(spec)`
- `createNullAdapter(id)`
- `snapshotRuntime(adapter, options)`
- `RUNTIME_ADAPTER_API = 1`

## v1 safety contract

- `health()` reports availability without mutating state.
- `listTasks()` returns bounded task metadata.
- Task snapshots are normalized to a small public schema.
- Raw adapter exceptions are never copied into the public snapshot.
- Timeout/error conditions fail closed as disconnected/error state.
- Secrets remain runtime-scoped and never enter task text or repository state.
- The SDK rejects adapters that declare write, dispatch, external-write, paid-action, account-change, or destructive capability.
- Runtime state never grants human permission.
- Human approval never proves execution.
- VERIFIED still requires independent evidence.

## Minimal adapter

```js
import { defineRuntimeAdapter, snapshotRuntime } from "../packages/runtime-adapter/index.mjs";

const adapter = defineRuntimeAdapter({
  id: "example",
  async health() {
    return { ok: true, state: "CONNECTED" };
  },
  async listTasks() {
    return [
      { id: "t_1", assignee: "siti", state: "BLOCKED", title: "Review artifact" },
    ];
  },
});

console.log(await snapshotRuntime(adapter));
```

## Current runtime integration

The existing Hermes integration predates the generic SDK and remains read-only/fail-closed. Migrating it onto this adapter interface is tracked separately so the public release does not silently change the working Hermes behavior.

The discovery endpoint is:

```text
GET /api/capabilities
```

It is localhost-only and reports the active adapter label, Runtime Adapter API version, human-approval boundary, and other public safety capabilities. Discovery metadata is not authorization.

## Loopback HTTP adapter

`packages/runtime-adapter/http-readonly.mjs` provides a strict local HTTP bridge for runtimes that expose a health endpoint and a task-list endpoint. It accepts only loopback HTTP origins, performs GET requests only, refuses embedded credentials and redirects, and returns data through the same bounded v1 snapshot normalization.

The bridge does not make a runtime trusted. Runtime-specific provenance and identity reconciliation still apply before any claim can be treated as authoritative.
