import test from "node:test";
import assert from "node:assert/strict";
import { createHermesRuntimeAdapter } from "../hermes-runtime-adapter.mjs";

function fakeExecFactory() {
  const calls = [];
  const execFileImpl = async (exe, args, options) => {
    calls.push({ exe, args:[...args], options });
    if (args[0] === "--version") return { stdout:"Hermes 9.9.9\n" };
    if (args[0] === "-p") {
      const id = args[1];
      return { stdout:`Profile: ${id}\nModel: test-model\nGateway: running\n` };
    }
    if (args[0] === "kanban") {
      return {
        stdout:JSON.stringify([
          {
            id:"t_abc123",
            assignee:"subagjo",
            status:"blocked",
            title:"Inspect runtime",
            updated_at:"2026-09-29T04:00:00Z",
            created_by:"owner",
            session_id:"secret-session",
            result:"private-result",
          },
        ]),
      };
    }
    throw new Error("unexpected command");
  };
  return { calls, execFileImpl };
}

test("Hermes adapter is read-only and task reads go through generic snapshot normalization", async () => {
  const fake = fakeExecFactory();
  const hermes = createHermesRuntimeAdapter({
    executable:"hermes-test",
    hermesHome:"/tmp/hermes-home",
    board:"nyobakantorai",
    employeeIds:["subagjo","siti"],
    execFileImpl:fake.execFileImpl,
    existsImpl:() => true,
  });

  assert.equal(hermes.configured, true);
  assert.equal(hermes.adapter.id, "hermes-readonly");
  assert.equal(hermes.adapter.capabilities.write, false);
  assert.equal(hermes.adapter.capabilities.dispatch, false);

  const runtime = await hermes.runtimeSnapshot({ timeoutMs:1000 });
  assert.equal(runtime.connected, true);
  assert.equal(runtime.adapter_id, "hermes-readonly");
  assert.equal(runtime.tasks.length, 1);
  assert.deepEqual(Object.keys(runtime.tasks[0]), ["id","assignee","state","title","updated_at","evidence_ref"]);
  assert.equal(runtime.tasks[0].id, "t_abc123");
  assert.equal(runtime.tasks[0].state, "BLOCKED");

  const kanbanCall = fake.calls.find((call) => call.args[0] === "kanban");
  assert.ok(kanbanCall);
  assert.equal(kanbanCall.options.shell, false);
  assert.equal(kanbanCall.options.windowsHide, true);
  assert.equal(kanbanCall.options.env.HERMES_HOME, "/tmp/hermes-home");
});

test("Hermes adapter profile snapshot preserves only public profile state", async () => {
  const fake = fakeExecFactory();
  const hermes = createHermesRuntimeAdapter({
    executable:"hermes-test",
    hermesHome:"/tmp/hermes-home",
    employeeIds:["subagjo","siti"],
    execFileImpl:fake.execFileImpl,
    existsImpl:() => true,
  });

  const snapshot = await hermes.employeeSnapshot();
  assert.equal(snapshot.version, "Hermes 9.9.9");
  assert.equal(snapshot.profiles.length, 2);
  for (const profile of snapshot.profiles) {
    assert.equal(profile.profile_exists, true);
    assert.equal(profile.model_configured, true);
    assert.equal(profile.gateway, "running");
    assert.equal(profile.presence, "UNKNOWN");
    assert.deepEqual(Object.keys(profile), [
      "id","profile_exists","model_configured","gateway","presence",
    ]);
  }
});

test("Hermes adapter offline mode never executes the CLI", async () => {
  let calls = 0;
  const hermes = createHermesRuntimeAdapter({
    executable:"hermes-test",
    hermesHome:"",
    employeeIds:["subagjo"],
    execFileImpl:async () => { calls += 1; throw new Error("must not run"); },
  });

  const [runtime, employees, descriptor] = await Promise.all([
    hermes.runtimeSnapshot(),
    hermes.employeeSnapshot(),
    hermes.describe(),
  ]);

  assert.equal(calls, 0);
  assert.equal(runtime.connected, false);
  assert.equal(runtime.state, "NOT_CONFIGURED");
  assert.equal(employees.version, "not-configured");
  assert.equal(employees.profiles[0].profile_exists, false);
  assert.equal(descriptor.configured, false);
  assert.equal(descriptor.installed, false);
});

test("Hermes task command failure fails closed without leaking child error", async () => {
  const hermes = createHermesRuntimeAdapter({
    executable:"hermes-test",
    hermesHome:"/tmp/hermes-home",
    employeeIds:["subagjo"],
    execFileImpl:async (_exe, args) => {
      if (args[0] === "kanban") throw new Error("token=super-secret");
      if (args[0] === "--version") return { stdout:"Hermes 9.9.9" };
      return { stdout:"Model: test-model\nGateway: running\n" };
    },
  });

  const runtime = await hermes.runtimeSnapshot({ timeoutMs:1000 });
  assert.equal(runtime.connected, false);
  assert.equal(runtime.state, "ERROR");
  assert.equal(runtime.error_category, "ADAPTER_ERROR");
  assert.equal(JSON.stringify(runtime).includes("super-secret"), false);
});

test("Hermes descriptor can reuse a known version without another CLI probe", async () => {
  const fake = fakeExecFactory();
  const hermes = createHermesRuntimeAdapter({
    executable:"hermes-test",
    hermesHome:"/tmp/hermes-home",
    employeeIds:["subagjo"],
    execFileImpl:fake.execFileImpl,
    existsImpl:() => true,
  });

  const descriptor = await hermes.describe("Hermes known-version");
  assert.equal(descriptor.version, "Hermes known-version");
  assert.equal(descriptor.installed, true);
  assert.equal(fake.calls.filter((call) => call.args[0] === "--version").length, 0);
});


test("Hermes adapter rejects malformed employee id configuration", () => {
  assert.throws(
    () => createHermesRuntimeAdapter({
      executable:"hermes-test",
      hermesHome:"/tmp/hermes-home",
      employeeIds:"subagjo",
    }),
    /employeeIds must be an array/
  );
});


test("Hermes adapter rejects executable outside canonical permission policy", () => {
  assert.throws(
    () => createHermesRuntimeAdapter({
      executable:"powershell.exe",
      hermesHome:"/tmp/hermes-home",
      employeeIds:["subagjo"],
    }),
    /executable .* not allowed/
  );
});

test("Hermes adapter rejects timeout above canonical permission policy", () => {
  assert.throws(
    () => createHermesRuntimeAdapter({
      executable:"hermes",
      hermesHome:"/tmp/hermes-home",
      employeeIds:["subagjo"],
      commandTimeoutMs:10_001,
    }),
    /timeout exceeds policy/
  );
});
