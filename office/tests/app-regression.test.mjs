import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("scene roster activation iterates over all matching buttons", async () => {
  const app = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
  assert.match(app,/\$\$\("#scene-roster button"\)\.forEach/);
  assert.doesNotMatch(app,/(?<!\$)\$\("#scene-roster button"\)\.forEach/);
});
