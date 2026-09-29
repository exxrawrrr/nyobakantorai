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

Hermes is now encapsulated behind `office/hermes-runtime-adapter.mjs`.

The office server no longer imports `node:child_process` or executes Hermes commands directly. The Hermes adapter owns executable invocation, bounded environment, profile/version parsing, and board access. Board/task reads pass through the generic `snapshotRuntime()` normalization and fail-closed behavior.

The public `/api/runtime` response remains Hermes-aware for compatibility, while command execution stays behind the adapter boundary.

The discovery endpoint is:

```text
GET /api/capabilities
```

It is localhost-only and reports the active adapter label, Runtime Adapter API version, human-approval boundary, and other public safety capabilities. Discovery metadata is not authorization.

## Loopback HTTP adapter

`packages/runtime-adapter/http-readonly.mjs` provides a strict local HTTP bridge for runtimes that expose a health endpoint and a task-list endpoint. It accepts only loopback HTTP origins, performs GET requests only, refuses embedded credentials and redirects, and returns data through the same bounded v1 snapshot normalization.

The bridge does not make a runtime trusted. Runtime-specific provenance and identity reconciliation still apply before any claim can be treated as authoritative.


## Read-only JSON CLI adapter

`packages/runtime-adapter/cli-readonly.mjs` provides a generic CLI bridge for local runtimes that can expose health and task data as JSON.

Safety properties:

- uses `execFile`, never a shell command string;
- `shell:false`;
- health/task arguments must be explicit arrays;
- control characters are rejected from executable/args;
- child environment is allowlisted instead of inheriting all process variables;
- extra environment variables must be explicitly allowlisted;
- stdout must be JSON;
- stderr is never treated as runtime evidence;
- command timeout and max-buffer limits are bounded;
- raw child errors/stdout/stderr are not copied into public snapshots;
- write/dispatch/paid/account/destructive capabilities remain false.

Example:

```js
import { snapshotRuntime } from "../packages/runtime-adapter/index.mjs";
import { createCliJsonAdapter } from "../packages/runtime-adapter/cli-readonly.mjs";

const adapter = createCliJsonAdapter({
  id: "my-runtime",
  executable: "my-runtime",
  healthArgs: ["health", "--json"],
  tasksArgs: ["tasks", "--json"],
});

console.log(await snapshotRuntime(adapter));
```

This adapter does not scrape credentials or infer authorization. If a runtime requires environment configuration, the caller must explicitly pass and allowlist only the required environment keys.


## Adapter permission policy

Machine-readable policy lives in:

`config/runtime-adapter-policy.json`

Enforcement primitives live in:

`packages/runtime-adapter/policy.mjs`

Policies can constrain:

- allowed adapter IDs;
- executable basenames;
- environment keys;
- maximum command timeout;
- maximum process buffer;
- maximum task count;
- shell prohibition;
- loopback-only host lists;
- allowed URL protocols;
- redirect behavior.

Known Hermes runtime reads are automatically checked against the canonical `hermes-readonly` policy before any command is executed.

The generic CLI and loopback HTTP adapters also accept an optional `permissionPolicy` argument. This lets callers bind custom adapters to an explicit project or deployment policy without weakening the hardcoded v1 read-only capability boundary.

Example failure modes:

```text
wrong executable -> reject before spawn
non-allowlisted env -> reject before spawn
timeout > policy -> reject
remote HTTP host under loopback policy -> reject
HTTPS when only http: is allowed -> reject
redirect-follow under no-redirect policy -> reject
```

This is an **application-level configuration sandbox**, not OS process isolation.
