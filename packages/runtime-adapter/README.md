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


## Strict JSON CLI adapter

Use `createCliJsonAdapter()` from `cli-readonly.mjs` for local runtimes that expose JSON via CLI commands.

The adapter never invokes a shell. Health and task commands are passed as executable + argv arrays through `execFile`, stdout must parse as JSON, stderr is ignored as evidence, environment inheritance is minimized, and raw process errors are normalized by `snapshotRuntime()`.

```js
import { snapshotRuntime } from "./index.mjs";
import { createCliJsonAdapter } from "./cli-readonly.mjs";

const adapter = createCliJsonAdapter({
  id: "local-cli",
  executable: "runtime-cli",
  healthArgs: ["health", "--json"],
  tasksArgs: ["tasks", "--json"],
});

console.log(await snapshotRuntime(adapter));
```

Use `allowedExtraEnvKeys` + `extraEnv` only for explicit runtime configuration. Do not pass the whole process environment.


## Permission policies

The hardcoded SDK contract remains read-only. Deployments can add a second, fail-closed configuration layer with `permissionPolicy`.

Canonical project policies are stored in:

`config/runtime-adapter-policy.json`

The policy engine is:

`policy.mjs`

It can constrain adapter identity, executable basename, environment keys, timeout, process buffer, task count, loopback hosts, URL protocols, shell use, and redirects.

For example, a CLI policy can allow only one executable and only `PATH`:

```js
import { defineAdapterPermissionPolicy } from "./policy.mjs";
import { createCliJsonAdapter } from "./cli-readonly.mjs";

const policy = defineAdapterPermissionPolicy({
  id: "example-cli-policy",
  adapter_ids: ["example-cli"],
  executable_basenames: ["example-runtime"],
  allowed_env_keys: ["PATH"],
  max_timeout_ms: 2000,
  max_buffer_bytes: 1048576,
  max_tasks: 100,
  require_shell_false: true,
});

const adapter = createCliJsonAdapter({
  id: "example-cli",
  executable: "example-runtime",
  healthArgs: ["health", "--json"],
  tasksArgs: ["tasks", "--json"],
  permissionPolicy: policy,
});
```

When a CLI policy is active, inherited environment variables outside its allowlist are stripped before process execution. Explicit extra environment keys outside policy are rejected.

Hermes uses the canonical `hermes-readonly` policy automatically.

This is application-level configuration sandboxing, **not OS process isolation**.
