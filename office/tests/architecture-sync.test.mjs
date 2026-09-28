import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (name) => readFile(new URL(name, root), "utf8");
const names = ["praroro", "paijo", "subagjo", "alex", "sumiati", "siti"];

test("public architecture describes local-first fail-closed boundaries", async () => {
  const spec = await read("docs/ARCHITECTURE.md");
  assert.match(spec, /local-first/i);
  assert.match(spec, /localhost/i);
  assert.match(spec, /VERIFIED state requires independent evidence/i);
  assert.match(spec, /Skills define procedures/i);
});

test("read-only runtime snapshot includes all six example employees", async () => {
  const server = await read("server.mjs");
  for (const name of names) assert.match(server, new RegExp('employeeIds = \\[.*"' + name + '"'));
  assert.match(server, /dispatch: \{ enabled: false/);
  assert.match(server, /\/api\/capabilities/);
  assert.match(server, /\/api\/runtime/);
  assert.match(server, /human_approval_gate: true/);
});

test("public UI does not depend on private machine paths or removed legacy docs", async () => {
  const app = await read("src/app.mjs");
  assert.doesNotMatch(app, /D:\\RAFDI_DATA|C:\\Users\\User|03_AI_OFFICE|Office Preview 4310/i);
  assert.match(app, /docs\/ARCHITECTURE\.md/);
});
