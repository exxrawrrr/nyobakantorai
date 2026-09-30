import test from "node:test";
import assert from "node:assert/strict";
import { snapshotRuntime } from "./index.mjs";
import { createLoopbackHttpAdapter } from "./http-readonly.mjs";
import { defineAdapterPermissionPolicy } from "./policy.mjs";

test("loopback HTTP adapter rejects remote hosts and embedded credentials", () => {
  assert.throws(() => createLoopbackHttpAdapter({ baseUrl: "https://example.com" }), /http:\/\//);
  assert.throws(() => createLoopbackHttpAdapter({ baseUrl: "http://example.com" }), /localhost/);
  assert.throws(() => createLoopbackHttpAdapter({ baseUrl: "http://user:pass@127.0.0.1:9999" }), /Credentials/);
});

test("loopback HTTP adapter is GET-only and normalizes through SDK", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/health")) {
      return { ok: true, async json() { return { worker_alive: true, secret: "drop-me" }; } };
    }
    return {
      ok: true,
      async json() {
        return { tasks: [
          { id: "t_http1", assignee: "alex", state: "running", title: "Local HTTP task", private_blob: "drop-me" },
        ] };
      },
    };
  };
  const adapter = createLoopbackHttpAdapter({
    id: "local-http",
    baseUrl: "http://127.0.0.1:9999",
    fetchImpl: fakeFetch,
  });
  const snapshot = await snapshotRuntime(adapter);
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.adapter_id, "local-http");
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].state, "RUNNING");
  assert.equal("private_blob" in snapshot.tasks[0], false);
  assert.ok(calls.every((call) => call.init.method === "GET"));
  assert.ok(calls.every((call) => call.init.redirect === "error"));
  assert.equal(snapshot.capabilities.dispatch, false);
  assert.equal(snapshot.capabilities.write, false);
});

test("loopback HTTP adapter fails closed on malformed task responses", async () => {
  const fakeFetch = async (url) => {
    if (String(url).endsWith("/api/health")) return { ok: true, async json() { return { ok: true }; } };
    return { ok: true, async json() { return { nope: true }; } };
  };
  const adapter = createLoopbackHttpAdapter({
    id: "malformed-http",
    baseUrl: "http://localhost:9999",
    fetchImpl: fakeFetch,
  });
  const snapshot = await snapshotRuntime(adapter);
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.state, "ERROR");
  assert.equal(snapshot.error_category, "ADAPTER_ERROR");
  assert.deepEqual(snapshot.tasks, []);
});


test("loopback HTTP adapter enforces supplied permission policy", () => {
  const policy = defineAdapterPermissionPolicy({
    id:"test-http",
    adapter_ids:["local-http"],
    executable_basenames:[],
    allowed_env_keys:[],
    max_timeout_ms:1000,
    max_buffer_bytes:0,
    max_tasks:5,
    loopback_only:true,
    loopback_hosts:["127.0.0.1","localhost","[::1]"],
    allowed_protocols:["http:"],
    allow_redirects:false,
  });

  assert.throws(() => createLoopbackHttpAdapter({
    id:"local-http",
    baseUrl:"http://127.0.0.1:9999",
    timeoutMs:2000,
    permissionPolicy:policy,
  }), /timeout exceeds policy/);

  assert.throws(() => createLoopbackHttpAdapter({
    id:"local-http",
    baseUrl:"http://127.0.0.1:9999",
    timeoutMs:500,
    maxTasks:10,
    permissionPolicy:policy,
  }), /maxTasks exceeds policy/);
});
