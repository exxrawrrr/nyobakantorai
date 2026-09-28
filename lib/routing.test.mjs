import test from "node:test";
import assert from "node:assert/strict";
import { routeWork } from "./routing.mjs";

test("human assignment always wins", () => {
  assert.equal(routeWork("fix github action", { assignedId: "maya" }).employee, "maya");
});

test("routes representative specialist work", () => {
  assert.equal(routeWork("audit search terms and negative keywords").employee, "gugun");
  assert.equal(routeWork("fix github action ci failure").employee, "subagjo");
  assert.equal(routeWork("verify this result and evidence").employee, "siti");
  assert.ok(["bambang", "bimo"].includes(routeWork("automate repetitive task with mcp").employee));
  assert.equal(routeWork("Meta creative campaign performance").employee, "maya");
  assert.equal(routeWork("SEO landing page CRO broken links").employee, "ratri");
});

test("unknown work falls back to Praroro", () => {
  assert.equal(routeWork("something completely unmatched xyz").employee, "praroro");
});
