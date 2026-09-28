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
