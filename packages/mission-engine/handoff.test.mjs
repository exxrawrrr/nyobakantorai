import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildHandoffEnvelope, normalizeHandoffEnvelope, normalizeHandoffResult, renderManualHandoffCompatibilityDraft } from "./handoff.mjs";
import { planMission } from "./planner.mjs";

const root = new URL("../../", import.meta.url);
const envelopeSchema = JSON.parse(await readFile(new URL("schemas/mission-handoff.schema.json", root), "utf8"));
const resultSchema = JSON.parse(await readFile(new URL("schemas/mission-handoff-result.schema.json", root), "utf8"));

const clock = () => "2026-10-01T06:40:00.000Z";
const ids = (kind, index, label) => `${kind === "task" ? "tnode" : kind}-handoff-${index + 1}-${String(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

function plan() {
  return planMission({
    objective:"Audit SEO landing page and verify the resulting brief.",
    constraints:["read-only execution"],
    required_evidence:["source provenance"],
    risk_class:"READ_ONLY",
    work_items:[
      { key:"research", title:"Research sources", objective:"Research competitor sources.", assigned_id:"alex", depends_on:[] },
      { key:"seo", title:"Analyze SEO", objective:"Analyze SEO landing page.", assigned_id:"ratri", depends_on:[] },
      { key:"synthesis", title:"Synthesize result", objective:"Synthesize research and SEO findings.", assigned_id:"praroro", depends_on:["research","seo"] },
      { key:"verify", title:"Verify result", objective:"Verify evidence and synthesis.", assigned_id:"siti", depends_on:["synthesis"] },
    ],
  }, { clock, idFactory:ids });
}

test("handoff schemas expose typed outbound and return contracts", () => {
  assert.equal(envelopeSchema.properties.schema.const, 1);
  assert.equal(resultSchema.properties.schema.const, 1);
  assert.equal(envelopeSchema.additionalProperties, false);
  assert.equal(resultSchema.additionalProperties, false);
});

test("handoff envelope carries dependency sources, bounded scope and artifact inputs", () => {
  const p = plan();
  const task = p.task_nodes.find((item) => item.employee_id === "praroro");
  const meta = p.node_meta.find((item) => item.task_id === task.task_id);
  const sourceTaskIds = [...meta.depends_on];
  const sourceEmployees = sourceTaskIds.map((id) => p.task_nodes.find((item) => item.task_id === id).employee_id);

  const envelope = buildHandoffEnvelope({
    handoff_id:"handoff-synthesis-1",
    mission:p.mission,
    task,
    node_meta:meta,
    source_task_ids:sourceTaskIds,
    source_employee_ids:sourceEmployees,
    input_artifact_refs:["artifact:research","artifact:seo"],
    allowed_capabilities:["model_inference","temporary_workspace","evidence_collection"],
    timeout_ms:2000,
    created_at:clock(),
  });

  assert.equal(normalizeHandoffEnvelope(envelope).destination_employee_id, "praroro");
  assert.deepEqual(envelope.source.task_ids, sourceTaskIds);
  assert.deepEqual(envelope.source.employee_ids.sort(), ["alex","ratri"]);
  assert.deepEqual(envelope.input_artifact_refs, ["artifact:research","artifact:seo"]);
  assert.ok(envelope.required_evidence.includes("source provenance"));
});

test("manual compatibility projection remains NOT SENT / NOT EXECUTED / NOT VERIFIED", () => {
  const p = plan();
  const task = p.task_nodes[0];
  const meta = p.node_meta[0];
  const envelope = buildHandoffEnvelope({
    handoff_id:"handoff-manual-1",
    mission:p.mission,
    task,
    node_meta:meta,
    allowed_capabilities:["model_inference"],
    timeout_ms:1000,
    created_at:clock(),
  });

  const draft = renderManualHandoffCompatibilityDraft(envelope);
  assert.match(draft, /DRAFT_NOT_SENT/);
  assert.match(draft, /NOT_EXECUTED/);
  assert.match(draft, /NOT_VERIFIED/);
  assert.match(draft, /not an operations\/handoff Hermes packet/i);
});

test("handoff validation fails closed on unknown employee, bad timeout and forged success error", () => {
  const p = plan();
  const task = p.task_nodes[0];
  const meta = p.node_meta[0];
  const envelope = buildHandoffEnvelope({
    handoff_id:"handoff-negative-1",
    mission:p.mission,
    task,
    node_meta:meta,
    allowed_capabilities:["model_inference"],
    timeout_ms:1000,
    created_at:clock(),
  });

  assert.throws(() => normalizeHandoffEnvelope({ ...envelope, destination_employee_id:"unknown-worker" }), /unknown/);
  assert.throws(() => normalizeHandoffEnvelope({ ...envelope, timeout_ms:0 }), /1\.\.45000/);
  assert.throws(() => normalizeHandoffResult({
    schema:1,
    handoff_id:envelope.handoff_id,
    mission_id:envelope.mission_id,
    task_id:envelope.task_id,
    employee_id:envelope.destination_employee_id,
    state:"SUCCEEDED",
    artifact_refs:[],
    evidence_refs:[],
    unknowns:[],
    residual_risks:[],
    receipt_ref:null,
    error_category:"FAKE_ERROR",
    finished_at:clock(),
  }), /cannot carry error_category/);
});
