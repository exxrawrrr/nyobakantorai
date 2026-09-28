# Runtime Adapter SDK

A tiny, dependency-free contract for exposing runtime state to nyobakantorai without granting write authority.

## v1 guarantees

- read-only capabilities only;
- explicit adapter identity;
- bounded task snapshots;
- normalized task fields;
- no raw exception text in snapshots;
- timeout and adapter failures degrade to disconnected/error state;
- write, dispatch, paid, account-change, external-write, and destructive capabilities are rejected at adapter definition time.

## Example

```js
import { defineRuntimeAdapter, snapshotRuntime } from "./packages/runtime-adapter/index.mjs";

const adapter = defineRuntimeAdapter({
  id: "example",
  async health() {
    return { ok: true, state: "CONNECTED" };
  },
  async listTasks() {
    return [{ id: "t_1", assignee: "siti", state: "BLOCKED", title: "Review" }];
  },
});

console.log(await snapshotRuntime(adapter));
```

This SDK does not authenticate a runtime, grant tool access, or prove that work happened. Adapters still need provenance and reconciliation appropriate to their source.

## Strict loopback HTTP adapter

For local runtimes that already expose JSON over HTTP, use `createLoopbackHttpAdapter()` from `http-readonly.mjs`.

The adapter is deliberately narrow:

- only `http://127.0.0.1`, `http://localhost`, or `http://[::1]`;
- GET requests only;
- redirects disabled;
- credentials are rejected in the base URL;
- health and task responses still pass through the SDK's bounded fail-closed snapshot normalization;
- write, dispatch, paid, account-change, external-write, and destructive capabilities remain false.

Example:

```js
import { snapshotRuntime } from "./index.mjs";
import { createLoopbackHttpAdapter } from "./http-readonly.mjs";

const adapter = createLoopbackHttpAdapter({
  id: "my-local-worker",
  baseUrl: "http://127.0.0.1:9000",
  healthPath: "/api/health",
  tasksPath: "/api/tasks",
});

console.log(await snapshotRuntime(adapter));
```

This adapter is for observation, not control. A runtime that needs writes must use a separate, explicitly reviewed capability model rather than weakening the v1 read-only contract.
