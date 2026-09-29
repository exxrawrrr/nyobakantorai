import test from "node:test";
import assert from "node:assert/strict";
import { snapshotRuntime } from "./index.mjs";
import { createCliJsonAdapter } from "./cli-readonly.mjs";
import { defineAdapterPermissionPolicy } from "./policy.mjs";

test("CLI adapter rejects unsafe configuration before execution", () => {
  assert.throws(() => createCliJsonAdapter({ executable:"" }), /executable is required/);
  assert.throws(() => createCliJsonAdapter({ executable:"tool\nboom" }), /control characters/);
  assert.throws(() => createCliJsonAdapter({ executable:"tool", healthArgs:"--json" }), /healthArgs must be an array/);
  assert.throws(() => createCliJsonAdapter({
    executable:"tool",
    extraEnv:{ SUPER_SECRET:"nope" },
  }), /not allowlisted/);
  assert.throws(() => createCliJsonAdapter({
    executable:"tool",
    commandTimeoutMs:20_000,
  }), /1..10000/);
});

test("CLI adapter executes explicit argv with shell disabled and bounded env", async () => {
  const calls = [];
  const fakeExec = async (executable, args, options) => {
    calls.push({ executable, args, options });
    if (args[0] === "health") return { stdout:JSON.stringify({ ok:true, state:"connected", token:"drop-me" }), stderr:"" };
    return {
      stdout:JSON.stringify({
        tasks:[
          {
            id:"t_cli1",
            assignee:"bimo",
            status:"running",
            title:"Inspect integration",
            updated_at:"2026-09-29T03:00:00Z",
            private_blob:"drop-me",
          },
        ],
      }),
      stderr:"",
    };
  };

  const adapter = createCliJsonAdapter({
    id:"cli-test",
    executable:"fake-runtime",
    healthArgs:["health","--json"],
    tasksArgs:["tasks","--json"],
    allowedExtraEnvKeys:["NYOBA_TEST_HOME"],
    extraEnv:{ NYOBA_TEST_HOME:"/tmp/nyoba-test" },
    execFileImpl:fakeExec,
  });

  const snapshot = await snapshotRuntime(adapter);
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.adapter_id, "cli-test");
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].id, "t_cli1");
  assert.equal(snapshot.tasks[0].state, "RUNNING");
  assert.equal("private_blob" in snapshot.tasks[0], false);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ["health","--json"]);
  assert.deepEqual(calls[1].args, ["tasks","--json"]);
  for (const call of calls) {
    assert.equal(call.executable, "fake-runtime");
    assert.equal(call.options.shell, false);
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.env.NYOBA_TEST_HOME, "/tmp/nyoba-test");
    assert.equal("SUPER_SECRET" in call.options.env, false);
    assert.ok(call.options.maxBuffer <= 4 * 1024 * 1024);
  }
});

test("CLI adapter fails closed on malformed JSON without leaking stdout", async () => {
  const adapter = createCliJsonAdapter({
    id:"cli-malformed",
    executable:"fake-runtime",
    healthArgs:["health"],
    tasksArgs:["tasks"],
    execFileImpl:async () => ({ stdout:"token=super-secret not-json", stderr:"password=also-secret" }),
  });
  const snapshot = await snapshotRuntime(adapter);
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.state, "ERROR");
  assert.equal(snapshot.error_category, "ADAPTER_ERROR");
  assert.equal(JSON.stringify(snapshot).includes("super-secret"), false);
  assert.equal(JSON.stringify(snapshot).includes("also-secret"), false);
});

test("CLI adapter fails closed when child process rejects with secret text", async () => {
  const adapter = createCliJsonAdapter({
    id:"cli-error",
    executable:"fake-runtime",
    healthArgs:["health"],
    tasksArgs:["tasks"],
    execFileImpl:async () => { throw new Error("api_key=supersecretvalue123456789"); },
  });
  const snapshot = await snapshotRuntime(adapter);
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.state, "ERROR");
  assert.equal(JSON.stringify(snapshot).includes("supersecret"), false);
});

test("CLI tasks shape must be array or {tasks:[]}", async () => {
  const fakeExec = async (_exe, args) => {
    if (args[0] === "health") return { stdout:'{"ok":true}' };
    return { stdout:'{"not_tasks":true}' };
  };
  const adapter = createCliJsonAdapter({
    id:"cli-shape",
    executable:"fake-runtime",
    healthArgs:["health"],
    tasksArgs:["tasks"],
    execFileImpl:fakeExec,
  });
  const snapshot = await snapshotRuntime(adapter);
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.state, "ERROR");
  assert.deepEqual(snapshot.tasks, []);
});

test("CLI adapter does not treat stderr as structured runtime evidence", async () => {
  const fakeExec = async (_exe, args) => {
    if (args[0] === "health") return { stdout:'{"ok":true}', stderr:'{"tasks":[{"id":"forged"}]}' };
    return { stdout:'[]', stderr:'{"secret":"ignore-me"}' };
  };
  const adapter = createCliJsonAdapter({
    id:"cli-stderr",
    executable:"fake-runtime",
    healthArgs:["health"],
    tasksArgs:["tasks"],
    execFileImpl:fakeExec,
  });
  const snapshot = await snapshotRuntime(adapter);
  assert.equal(snapshot.connected, true);
  assert.deepEqual(snapshot.tasks, []);
});


test("CLI adapter enforces supplied permission policy before execution", () => {
  const policy = defineAdapterPermissionPolicy({
    id:"test-cli",
    adapter_ids:["cli-test"],
    executable_basenames:["allowed-runtime"],
    allowed_env_keys:["PATH"],
    max_timeout_ms:1000,
    max_buffer_bytes:2048,
    max_tasks:10,
    require_shell_false:true,
  });

  assert.throws(() => createCliJsonAdapter({
    id:"cli-test",
    executable:"forbidden-runtime",
    commandTimeoutMs:500,
    maxBufferBytes:1024,
    permissionPolicy:policy,
  }), /executable .* not allowed/);

  assert.throws(() => createCliJsonAdapter({
    id:"cli-test",
    executable:"allowed-runtime",
    commandTimeoutMs:1500,
    maxBufferBytes:1024,
    permissionPolicy:policy,
  }), /timeout exceeds policy/);
});
