import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("office server composes the canonical public-demo HTTP boundary", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server,/from "\.\/public-demo-http\.mjs"/);
  assert.match(server,/routePublicDemoRequest\(publicDemo/);
  assert.match(server,/readBoundedJsonBody\(request/);
  assert.match(server,/publicDemoHttpErrorResponse/);
  assert.doesNotMatch(server,/function cookieValue\(/);
  assert.doesNotMatch(server,/function readJsonBody\(/);
  assert.doesNotMatch(server,/session_token/);
  assert.match(server,/\/api\/public\/capabilities/);
});
