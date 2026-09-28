import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public office exposes risk selection and owner approval controls", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
  assert.match(html, /name="risk_class"/);
  for (const risk of ["READ_ONLY", "LOCAL_WRITE", "EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"]) {
    assert.match(html, new RegExp(risk));
  }
  assert.match(app, /recordApproval/);
  assert.match(app, /data-approval="APPROVED"/);
  assert.match(app, /data-approval="REJECTED"/);
  assert.match(app, /Human approval gate/);
});

test("capability endpoint declares the human approval boundary", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /human_approval_gate: true/);
  assert.match(server, /approval_risk_classes/);
  assert.match(server, /EXTERNAL_WRITE/);
  assert.match(server, /PAID_ACTION/);
  assert.match(server, /ACCOUNT_CHANGE/);
  assert.match(server, /DESTRUCTIVE/);
});
