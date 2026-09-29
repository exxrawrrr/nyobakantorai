import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/,
  /\b(?:password|passwd|api[_ -]?key|secret|token|cookie)\s*[:=]\s*\S+/i,
  /[?&](?:access_token|api[_-]?key|apikey|token|secret|password|passwd|cookie|key)=[^&#\s]+/i,
  /:\/\/[^/\s:@]+:[^@\s/]+@/,
];

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const unique = (items) => [...new Set(items)];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stable(value));
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function containsSecretLike(value) {
  const text = String(value ?? "");
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function assertAllowedKeys(label, value, allowed) {
  const unknown = Object.keys(value || {}).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label}: unsupported field(s): ${unknown.join(", ")}`);
}

function assertSafeText(label, value, maxChars) {
  if (!nonEmpty(value)) throw new Error(`${label} required`);
  if (value.length > maxChars) throw new Error(`${label} exceeds ${maxChars} characters`);
  if (containsSecretLike(value)) throw new Error(`${label} contains secret-like material`);
}

function assertSafeRefs(refs, label = "evidence_refs") {
  if (!Array.isArray(refs)) throw new Error(`${label} must be an array`);
  for (const ref of refs) {
    if (!nonEmpty(ref)) throw new Error(`${label} must contain non-empty strings`);
    if (ref.length > 2048) throw new Error(`${label} entry exceeds 2048 characters`);
    if (/\r|\n/.test(ref)) throw new Error(`${label} entry contains a newline`);
    if (containsSecretLike(ref)) throw new Error(`${label} contains secret-like material`);
  }
}

function assertCaseId(value) {
  if (!nonEmpty(value)) throw new Error("case_id required");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error("case_id must be 1-128 safe identifier characters");
  }
}

function assertSafeSourceRef(value) {
  if (!nonEmpty(value)) throw new Error("source_ref required");
  if (value.length > 2048) throw new Error("source_ref exceeds 2048 characters");
  if (/\r|\n/.test(value)) throw new Error("source_ref contains a newline");
  if (containsSecretLike(value)) throw new Error("source_ref contains secret-like material");
}

function assertTimestamp(label, value) {
  if (!nonEmpty(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO-compatible timestamp`);
}

function assertBoolean(label, value) {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
}

function assertNonNegativeInteger(label, value) {
  if (!nonNegativeInteger(value)) throw new Error(`${label} must be a non-negative integer`);
}

function assertNoForbiddenPayloadFields(payload, recorderPolicy) {
  const forbidden = new Set(recorderPolicy.forbidden_payload_fields || []);
  const hits = Object.keys(payload || {}).filter((key) => forbidden.has(key));
  if (hits.length) throw new Error(`forbidden private/raw field(s): ${hits.join(", ")}`);
}

export function validateStartData({ data, recorderPolicy, evaluationPolicy, employeeIds }) {
  assertNoForbiddenPayloadFields(data, recorderPolicy);
  assertAllowedKeys("TASK_STARTED", data, [
    "source_type","source_ref","source_generated","source_attestation","employee_id",
    "task_summary","redaction_reviewed","started_at",
  ]);
  if (!evaluationPolicy.allowed_source_types.includes(data.source_type)) {
    throw new Error("source_type is not eligible for the real-task baseline");
  }
  if (evaluationPolicy.forbidden_source_types.includes(data.source_type)) {
    throw new Error("synthetic/demo/generated source type is forbidden");
  }
  assertSafeSourceRef(data.source_ref);
  if (data.source_generated !== false) throw new Error("source_generated must be false");
  const expectedAttestation = recorderPolicy.source_attestations?.[data.source_type];
  if (!expectedAttestation || data.source_attestation !== expectedAttestation) {
    throw new Error(`source_attestation must be ${expectedAttestation || "defined"} for ${data.source_type}`);
  }
  if (!employeeIds.includes(data.employee_id)) throw new Error("unknown employee_id");
  assertSafeText("task_summary", data.task_summary, recorderPolicy.max_task_summary_chars);
  if (data.redaction_reviewed !== true) throw new Error("redaction_reviewed must be true before local persistence");
  assertTimestamp("started_at", data.started_at);
}

export function validateFinishData({ data, recorderPolicy }) {
  assertNoForbiddenPayloadFields(data, recorderPolicy);
  assertAllowedKeys("TASK_FINISHED", data, [
    "finished_at","success","evidence_refs","human_intervention","retries",
    "duration_ms","cost_known","recovered_after_failure","outcome_note",
  ]);
  assertTimestamp("finished_at", data.finished_at);
  assertBoolean("success", data.success);
  assertSafeRefs(data.evidence_refs);
  if (!data.evidence_refs.length) throw new Error("TASK_FINISHED requires at least one evidence reference");
  assertNonNegativeInteger("human_intervention", data.human_intervention);
  assertNonNegativeInteger("retries", data.retries);
  assertNonNegativeInteger("duration_ms", data.duration_ms);
  assertBoolean("cost_known", data.cost_known);
  assertBoolean("recovered_after_failure", data.recovered_after_failure);
  assertSafeText("outcome_note", data.outcome_note, recorderPolicy.max_note_chars);
}

export function validateVerifyData({ data, recorderPolicy, employeeIds }) {
  assertNoForbiddenPayloadFields(data, recorderPolicy);
  assertAllowedKeys("TASK_VERIFIED", data, [
    "reviewer_employee_id","verified_at","verification_passed","false_success",
    "evidence_complete","evidence_refs","verification_note",
  ]);
  if (!employeeIds.includes(data.reviewer_employee_id)) throw new Error("unknown reviewer_employee_id");
  assertTimestamp("verified_at", data.verified_at);
  assertBoolean("verification_passed", data.verification_passed);
  assertBoolean("false_success", data.false_success);
  assertBoolean("evidence_complete", data.evidence_complete);
  assertSafeRefs(data.evidence_refs);
  assertSafeText("verification_note", data.verification_note, recorderPolicy.max_note_chars);
}

export function computeEventHash(event) {
  const { event_hash: _ignored, ...unsigned } = event;
  return sha256(stableStringify(unsigned));
}

export function createLedgerEvent({ type, caseId, data, previousHash = null, now = new Date().toISOString(), idFactory = randomUUID }) {
  const event = {
    schema:1,
    event_id:idFactory(),
    type,
    case_id:caseId,
    recorded_at:now,
    previous_hash:previousHash,
    data,
  };
  return Object.freeze({ ...event, event_hash:computeEventHash(event) });
}

export function verifyLedger(events, { recorderPolicy, evaluationPolicy, employees }) {
  const errors = [];
  const employeeIds = employees.employees.map((item) => item.id);
  const employeeMap = new Map(employees.employees.map((item) => [item.id, item]));
  const states = new Map();
  const eventIds = new Set();
  const sourceRefs = new Map();
  let previousHash = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const prefix = `event[${index}]`;
    try {
      if (event?.schema !== 1) throw new Error("schema must be 1");
      if (!nonEmpty(event.event_id)) throw new Error("event_id required");
      if (eventIds.has(event.event_id)) throw new Error("duplicate event_id");
      eventIds.add(event.event_id);
      if (!recorderPolicy.event_types.includes(event.type)) throw new Error("unsupported event type");
      assertCaseId(event.case_id);
      assertTimestamp("recorded_at", event.recorded_at);
      if ((event.previous_hash ?? null) !== previousHash) throw new Error("hash-chain previous_hash mismatch");
      if (event.event_hash !== computeEventHash(event)) throw new Error("event_hash mismatch");

      const current = states.get(event.case_id);
      if (event.type === "TASK_STARTED") {
        if (current) throw new Error("TASK_STARTED may occur only once per case");
        validateStartData({ data:event.data, recorderPolicy, evaluationPolicy, employeeIds });
        const existingCase = sourceRefs.get(event.data.source_ref);
        if (existingCase && existingCase !== event.case_id) throw new Error(`source_ref already recorded by ${existingCase}`);
        sourceRefs.set(event.data.source_ref, event.case_id);
        states.set(event.case_id, { start:event, finish:null, verify:null });
      } else if (event.type === "TASK_FINISHED") {
        if (!current?.start) throw new Error("TASK_FINISHED requires TASK_STARTED");
        if (current.finish) throw new Error("TASK_FINISHED may occur only once per case");
        validateFinishData({ data:event.data, recorderPolicy });
        if (Date.parse(event.data.finished_at) < Date.parse(current.start.data.started_at)) {
          throw new Error("finished_at precedes started_at");
        }
        current.finish = event;
      } else if (event.type === "TASK_VERIFIED") {
        if (!current?.finish) throw new Error("TASK_VERIFIED requires TASK_FINISHED");
        if (current.verify) throw new Error("TASK_VERIFIED may occur only once per case");
        validateVerifyData({ data:event.data, recorderPolicy, employeeIds });
        if (event.data.reviewer_employee_id === current.start.data.employee_id) {
          throw new Error("self-verification is forbidden");
        }
        const worker = employeeMap.get(current.start.data.employee_id);
        const reviewerCandidates = worker?.verification_policy?.reviewer_candidates || [];
        if (reviewerCandidates.length && !reviewerCandidates.includes(event.data.reviewer_employee_id)) {
          throw new Error("reviewer is not allowed by employee verification_policy");
        }
        if (Date.parse(event.data.verified_at) < Date.parse(current.finish.data.finished_at)) {
          throw new Error("verified_at precedes finished_at");
        }
        const combinedEvidence = unique([...current.finish.data.evidence_refs, ...event.data.evidence_refs]);
        if (event.data.evidence_complete && !combinedEvidence.length) {
          throw new Error("evidence_complete cannot be true without evidence references");
        }
        if (event.data.verification_passed && !event.data.evidence_complete) {
          throw new Error("verification_passed requires evidence_complete");
        }
        if (event.data.false_success && !current.finish.data.success) {
          throw new Error("false_success requires an earlier success claim");
        }
        if (event.data.false_success && event.data.verification_passed) {
          throw new Error("false_success cannot also be verification_passed");
        }
        current.verify = event;
      }

      previousHash = event.event_hash;
    } catch (error) {
      errors.push(`${prefix}: ${error.message}`);
      previousHash = event?.event_hash || previousHash;
    }
  }

  return Object.freeze({
    ok:errors.length === 0,
    errors:Object.freeze(errors),
    events:events.length,
    cases:states.size,
    head_hash:events.length ? events.at(-1).event_hash : null,
    states,
  });
}

export function reduceVerifiedCases(events) {
  const states = new Map();
  for (const event of events) {
    const current = states.get(event.case_id) || {};
    if (event.type === "TASK_STARTED") current.start = event;
    if (event.type === "TASK_FINISHED") current.finish = event;
    if (event.type === "TASK_VERIFIED") current.verify = event;
    states.set(event.case_id, current);
  }

  const cases = [];
  for (const [caseId, state] of states) {
    if (!state.start || !state.finish || !state.verify) continue;
    const start = state.start.data;
    const finish = state.finish.data;
    const verify = state.verify.data;
    cases.push({
      case_id:caseId,
      source_type:start.source_type,
      source_ref:start.source_ref,
      source_generated:false,
      source_attestation:start.source_attestation,
      employee_id:start.employee_id,
      task_summary:start.task_summary,
      evidence_refs:unique([...finish.evidence_refs, ...verify.evidence_refs]),
      redaction_reviewed:true,
      started_at:start.started_at,
      finished_at:finish.finished_at,
      metrics:{
        success:finish.success,
        evidence_complete:verify.evidence_complete,
        false_success:verify.false_success,
        human_intervention:finish.human_intervention,
        retries:finish.retries,
        duration_ms:finish.duration_ms,
        cost_known:finish.cost_known,
        verification_passed:verify.verification_passed,
        recovered_after_failure:finish.recovered_after_failure,
      },
      verification:{
        reviewer_employee_id:verify.reviewer_employee_id,
        verified_at:verify.verified_at,
      },
      outcome_note:`${finish.outcome_note} Verification: ${verify.verification_note}`,
    });
  }
  return cases;
}

export function summarizeLedger(events) {
  const states = new Map();
  for (const event of events) {
    const current = states.get(event.case_id) || { start:false, finish:false, verify:false };
    if (event.type === "TASK_STARTED") current.start = true;
    if (event.type === "TASK_FINISHED") current.finish = true;
    if (event.type === "TASK_VERIFIED") current.verify = true;
    states.set(event.case_id, current);
  }
  const verifiedCases = reduceVerifiedCases(events);
  return Object.freeze({
    events:events.length,
    cases:states.size,
    started_only:[...states.values()].filter((s) => s.start && !s.finish).length,
    awaiting_verification:[...states.values()].filter((s) => s.finish && !s.verify).length,
    verified:verifiedCases.length,
    successes:verifiedCases.filter((item) => item.metrics.success).length,
    failures:verifiedCases.filter((item) => !item.metrics.success).length,
    verification_passes:verifiedCases.filter((item) => item.metrics.verification_passed).length,
    false_successes:verifiedCases.filter((item) => item.metrics.false_success).length,
  });
}

export function buildDatasetSnapshot({ events, evaluationPolicy, environment = {} }) {
  const cases = reduceVerifiedCases(events);
  const falseSuccesses = cases.filter((item) => item.metrics.false_success).length;
  const acceptancePassed =
    cases.length >= evaluationPolicy.publication_gate.minimum_cases &&
    falseSuccesses <= evaluationPolicy.publication_gate.false_successes_max &&
    cases.every((item) => item.metrics.evidence_complete) &&
    cases.every((item) => item.redaction_reviewed === true);

  return {
    schema:1,
    status:"COLLECTING",
    claim_state:"COLLECTING",
    note:"Generated by the local Real Task Recorder. This snapshot remains COLLECTING until explicitly reviewed and promoted through the repository publication gate.",
    environment:{
      runtime:"nyobakantorai-real-task-recorder",
      recorder_schema:1,
      collected_at:new Date().toISOString(),
      ...environment,
    },
    cases,
    summary:{
      acceptance_passed:acceptancePassed,
      eligible_cases:cases.length,
      minimum_cases_required:evaluationPolicy.publication_gate.minimum_cases,
      task_successes:cases.filter((item) => item.metrics.success).length,
      verification_passes:cases.filter((item) => item.metrics.verification_passed).length,
      false_successes:falseSuccesses,
      note:"Recorder export does not auto-publish or auto-promote a baseline.",
    },
  };
}

export async function readLedger(ledgerPath) {
  try {
    const text = await readFile(ledgerPath, "utf8");
    if (!text.trim()) return [];
    return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); }
      catch { throw new Error(`invalid JSON at ledger line ${index + 1}`); }
    });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function withLedgerLock(ledgerPath, fn) {
  await mkdir(dirname(ledgerPath), { recursive:true, mode:0o700 });
  const lockPath = `${ledgerPath}.lock`;
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("real-task recorder is busy; another writer holds the ledger lock");
    throw error;
  }
  try {
    return await fn();
  } finally {
    await handle?.close();
    await unlink(lockPath).catch(() => {});
  }
}

async function appendLifecycleEvent({ ledgerPath, type, caseId, data, context, now, idFactory }) {
  return withLedgerLock(ledgerPath, async () => {
    const events = await readLedger(ledgerPath);
    const current = verifyLedger(events, context);
    if (!current.ok) throw new Error(`existing ledger failed integrity validation: ${current.errors.join("; ")}`);
    const event = createLedgerEvent({
      type,
      caseId,
      data,
      previousHash:events.length ? events.at(-1).event_hash : null,
      now,
      idFactory,
    });
    const candidate = [...events, event];
    const verified = verifyLedger(candidate, context);
    if (!verified.ok) throw new Error(verified.errors.at(-1) || "candidate event rejected");
    await appendFile(ledgerPath, JSON.stringify(event) + "\n", { encoding:"utf8", mode:0o600 });
    return Object.freeze({ event, summary:summarizeLedger(candidate), head_hash:event.event_hash });
  });
}

export async function recordStart({ ledgerPath, payload, context, now = new Date().toISOString(), idFactory = randomUUID }) {
  const caseId = payload.case_id || `real-${now.slice(0,10).replaceAll("-", "")}-${idFactory().slice(0,8)}`;
  assertCaseId(caseId);
  const data = {
    source_type:payload.source_type,
    source_ref:payload.source_ref,
    source_generated:payload.source_generated,
    source_attestation:payload.source_attestation,
    employee_id:payload.employee_id,
    task_summary:payload.task_summary,
    redaction_reviewed:payload.redaction_reviewed,
    started_at:payload.started_at || now,
  };
  return appendLifecycleEvent({ ledgerPath, type:"TASK_STARTED", caseId, data, context, now, idFactory });
}

export async function recordFinish({ ledgerPath, payload, context, now = new Date().toISOString(), idFactory = randomUUID }) {
  if (!nonEmpty(payload.case_id)) throw new Error("case_id required");
  const events = await readLedger(ledgerPath);
  const check = verifyLedger(events, context);
  if (!check.ok) throw new Error(`existing ledger failed integrity validation: ${check.errors.join("; ")}`);
  const start = check.states.get(payload.case_id)?.start;
  if (!start) throw new Error("case_id has no TASK_STARTED event");
  const finishedAt = payload.finished_at || now;
  const durationMs = payload.duration_ms ?? Math.max(0, Date.parse(finishedAt) - Date.parse(start.data.started_at));
  const data = {
    finished_at:finishedAt,
    success:payload.success,
    evidence_refs:payload.evidence_refs,
    human_intervention:payload.human_intervention ?? 0,
    retries:payload.retries ?? 0,
    duration_ms:durationMs,
    cost_known:payload.cost_known ?? false,
    recovered_after_failure:payload.recovered_after_failure ?? false,
    outcome_note:payload.outcome_note,
  };
  return appendLifecycleEvent({ ledgerPath, type:"TASK_FINISHED", caseId:payload.case_id, data, context, now, idFactory });
}

export async function recordVerification({ ledgerPath, payload, context, now = new Date().toISOString(), idFactory = randomUUID }) {
  if (!nonEmpty(payload.case_id)) throw new Error("case_id required");
  const data = {
    reviewer_employee_id:payload.reviewer_employee_id,
    verified_at:payload.verified_at || now,
    verification_passed:payload.verification_passed,
    false_success:payload.false_success,
    evidence_complete:payload.evidence_complete,
    evidence_refs:payload.evidence_refs || [],
    verification_note:payload.verification_note,
  };
  return appendLifecycleEvent({ ledgerPath, type:"TASK_VERIFIED", caseId:payload.case_id, data, context, now, idFactory });
}

export async function writeDatasetSnapshot({ ledgerPath, outputPath, context, environment = {} }) {
  const events = await readLedger(ledgerPath);
  const verified = verifyLedger(events, context);
  if (!verified.ok) throw new Error(`ledger integrity validation failed: ${verified.errors.join("; ")}`);
  const dataset = buildDatasetSnapshot({ events, evaluationPolicy:context.evaluationPolicy, environment });
  await mkdir(dirname(outputPath), { recursive:true });
  const temporary = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(dataset, null, 2) + "\n", { encoding:"utf8", mode:0o600 });
  await import("node:fs/promises").then(({ rename }) => rename(temporary, outputPath));
  return dataset;
}

export function resolveDefaultLedgerPath(root, recorderPolicy) {
  return resolve(root, recorderPolicy.store_dir, recorderPolicy.ledger_file);
}
