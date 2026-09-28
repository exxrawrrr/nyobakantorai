import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WORKFORCE, EMPLOYEE_IDS } from "../workforce.mjs";

const root = new URL("../", import.meta.url);
const read = (name) => readFile(new URL(name, root), "utf8");

test("public architecture describes local-first fail-closed boundaries", async () => {
  const spec = await read("docs/ARCHITECTURE.md");
  assert.match(spec, /local-first/i);
  assert.match(spec, /localhost/i);
  assert.match(spec, /VERIFIED state requires independent evidence/i);
  assert.match(spec, /Skills define procedures/i);
});

test("canonical workforce exposes sixteen employees and server consumes generated IDs", async () => {
  assert.equal(WORKFORCE.length,16);
  assert.equal(new Set(EMPLOYEE_IDS).size,16);
  const server = await read("server.mjs");
  assert.match(server,/from ".\/workforce\.mjs"/);
  assert.doesNotMatch(server,/const employeeIds = \[/);
  assert.match(server,/dispatch: \{ enabled: false/);
  assert.match(server,/\/api\/capabilities/);
  assert.match(server,/\/api\/workforce/);
  assert.match(server,/\/api\/runtime/);
  assert.match(server,/human_approval_gate: true/);
});

test("every employee forbids self verification and has a Hermes distribution version", () => {
  for (const person of WORKFORCE) {
    assert.equal(person.verification_policy.self_verify,false,person.id);
    assert.match(person.profile.distribution_version,/^0\.3\./);
  }
});

test("public UI does not depend on private machine paths or removed legacy docs", async () => {
  const app = await read("src/app.mjs");
  assert.doesNotMatch(app, /D:\\RAFDI_DATA|C:\\Users\\User|03_AI_OFFICE|Office Preview 4310/i);
  assert.match(app, /docs\/ARCHITECTURE\.md/);
});
