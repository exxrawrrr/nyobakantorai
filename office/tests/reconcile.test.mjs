import test from "node:test";
import assert from "node:assert/strict";
import { reconcileClaims } from "../reconcile.mjs";

const official = [{ id: "t_real123", assignee: "praroro", status: "blocked", created_by: "owner:office", created_at: 1 }];
const claim = { id: "local-1", execution_mode: "HERMES", runtime_ref: "t_real123", runtime_state: "blocked", assignee_id: "praroro" };

test("confirms only an exact official board match", () => {
  const [result] = reconcileClaims([claim], official, "2026-09-19T00:00:00.000Z");
  assert.equal(result.provenance, "AUTHORITATIVE_RUNTIME");
  assert.equal(result.quarantined, false);
  assert.equal(result.runtime_evidence.id, "t_real123");
});

test("quarantines fabricated, mismatched, and stale-status claims", () => {
  for (const candidate of [
    { ...claim, runtime_ref: "t_forged" },
    { ...claim, assignee_id: "siti" },
    { ...claim, runtime_state: "completed" },
    { ...claim, runtime_ref: "not-a-task" },
  ]) {
    const [result] = reconcileClaims([candidate], official);
    assert.equal(result.provenance, "LOCAL_CLAIM");
    assert.equal(result.quarantined, true);
  }
});
