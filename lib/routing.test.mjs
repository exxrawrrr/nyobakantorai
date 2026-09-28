import test from "node:test";
import assert from "node:assert/strict";
import { routeWork } from "./routing.mjs";

test("human assignment always wins over every automatic signal", () => {
  const result = routeWork("fix github action", {
    assignedId:"maya",
    requiredSkills:["nyoba-codebase-verification"],
    workload:{maya:99},
    history:{maya:{failures:99}},
    riskClass:"DESTRUCTIVE",
  });
  assert.equal(result.employee, "maya");
  assert.equal(result.source, "HUMAN_ASSIGNMENT");
});

test("routes representative specialist work by role/expertise", () => {
  assert.equal(routeWork("audit search terms and negative keywords").employee, "gugun");
  assert.equal(routeWork("fix github action ci failure").employee, "subagjo");
  assert.equal(routeWork("verify this result and evidence").employee, "siti");
  assert.ok(["bambang","bimo"].includes(routeWork("automate repetitive task with mcp").employee));
  assert.equal(routeWork("Meta creative campaign performance").employee, "maya");
  assert.equal(routeWork("SEO landing page CRO broken links").employee, "ratri");
});

test("required canonical skill can route work even when text is ambiguous", () => {
  const result = routeWork("please handle this", { requiredSkills:["nyoba-meta-ads-operations"] });
  assert.equal(result.employee, "maya");
  assert.ok(result.factors.skills >= 6);
});

test("workload breaks a genuine specialist tie without overpowering strong role evidence", () => {
  const input = { requiredSkills:["nyoba-mcp-integration"] };
  const base = routeWork("please handle this", input);
  const loaded = routeWork("please handle this", { ...input, workload:{ [base.employee]:12 } });
  assert.notEqual(loaded.employee, base.employee);
  assert.equal(Math.abs(loaded.factors.workload), 0);
});

test("history is a bounded tie-break signal rather than proof of competence", () => {
  const result = routeWork("please handle this", {
    requiredSkills:["nyoba-follow-up"],
    history:{
      dina:{successes:8,failures:0},
      tari:{successes:0,failures:8},
      bambang:{successes:0,failures:0},
    },
  });
  assert.equal(result.employee,"dina");
  assert.ok(result.factors.history > 0);
});

test("high-impact routing only considers employees with an approval policy for that risk", () => {
  const result = routeWork("Meta campaign budget", { riskClass:"PAID_ACTION" });
  assert.equal(result.employee,"maya");
  assert.equal(result.factors.risk,"COMPATIBLE");
  assert.ok(result.reasons.includes("risk-gated:PAID_ACTION"));
});

test("unknown work falls back to Praroro", () => {
  assert.equal(routeWork("something completely unmatched xyz").employee, "praroro");
});
