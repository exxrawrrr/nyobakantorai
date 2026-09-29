import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

const RECEIPT_ALG = "Ed25519";
const HIGH_IMPACT = new Set(["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);
const RESULT_STATES = new Set(["SUCCEEDED","FAILED","PARTIAL","BLOCKED"]);
const RISK_CLASSES = new Set(["READ_ONLY","LOCAL_WRITE","EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);
const AUTONOMY_MODES = new Set(["OBSERVE","GUARDED","DELEGATED"]);
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/,
  /\b(?:password|passwd|api[_ -]?key|secret|token)\s*[:=]\s*\S+/i,
];

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const clean = (value, max) => String(value ?? "").trim().slice(0, max);
const uniq = (items) => [...new Set((Array.isArray(items) ? items : []).map((item) => clean(item, 1000)).filter(Boolean))];

function normalizeForCanonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON forbids non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeForCanonical);
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined) continue;
      output[key] = normalizeForCanonical(item);
    }
    return output;
  }
  throw new Error(`canonical JSON forbids type: ${typeof value}`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalizeForCanonical(value));
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return createHash("sha256").update(bytes).digest("hex");
}

export function containsSecretLikeContent(value) {
  const text = typeof value === "string" ? value : canonicalJson(value);
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizedUsage(input = {}) {
  const intOrNull = (value, label) => {
    if (value === null || value === undefined) return null;
    if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer or null`);
    return value;
  };
  const costKnown = input.cost_known === true;
  let amount = input.cost_amount ?? null;
  let currency = input.currency ?? null;

  if (costKnown) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) throw new Error("known cost requires non-negative finite cost_amount");
    currency = clean(currency, 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("known cost requires ISO-like 3-letter currency");
  } else {
    if (amount !== null && amount !== undefined) throw new Error("unknown cost must not claim cost_amount");
    if (currency !== null && currency !== undefined && String(currency).trim()) throw new Error("unknown cost must not claim currency");
    amount = null;
    currency = null;
  }

  return Object.freeze({
    input_tokens:intOrNull(input.input_tokens, "input_tokens"),
    output_tokens:intOrNull(input.output_tokens, "output_tokens"),
    cost_known:costKnown,
    cost_amount:amount,
    currency,
  });
}

export function createExecutionReceiptPayload(input = {}) {
  const payload = {
    schema:1,
    receipt_id:clean(input.receipt_id, 128),
    task_id:clean(input.task_id, 160),
    employee_id:clean(input.employee_id, 40).toLowerCase(),
    action:clean(input.action, 240),
    capability_id:input.capability_id == null ? null : clean(input.capability_id, 160),
    risk_class:clean(input.risk_class, 40).toUpperCase(),
    autonomy:clean(input.autonomy, 40).toUpperCase(),
    authorization:{
      allowed:input.authorization?.allowed === true,
      reason:clean(input.authorization?.reason, 240),
      approval_ref:input.authorization?.approval_ref == null ? null : clean(input.authorization.approval_ref, 512),
    },
    started_at:clean(input.started_at, 80),
    finished_at:clean(input.finished_at, 80),
    result:{
      state:clean(input.result?.state, 40).toUpperCase(),
      summary:clean(input.result?.summary, 4000),
      artifact_refs:uniq(input.result?.artifact_refs),
      evidence_refs:uniq(input.result?.evidence_refs),
    },
    runtime:{
      provider:clean(input.runtime?.provider, 120),
      runtime_ref:clean(input.runtime?.runtime_ref, 512),
      provider_version:input.runtime?.provider_version == null ? null : clean(input.runtime.provider_version, 120),
    },
    usage:normalizedUsage(input.usage),
    previous_receipt_sha256:input.previous_receipt_sha256 == null ? null : clean(input.previous_receipt_sha256, 64).toLowerCase(),
  };

  const errors = validateExecutionReceiptPayload(payload);
  if (errors.length) throw new Error(errors.join("; "));
  return Object.freeze(payload);
}

export function validateExecutionReceiptPayload(payload, { now = new Date(), maxFutureSkewMs = 5 * 60 * 1000 } = {}) {
  const errors = [];
  if (payload?.schema !== 1) errors.push("schema must be 1");
  if (!/^[a-z0-9][a-z0-9._-]{5,127}$/.test(payload?.receipt_id || "")) errors.push("invalid receipt_id");
  if (!nonEmpty(payload?.task_id)) errors.push("task_id required");
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(payload?.employee_id || "")) errors.push("invalid employee_id");
  if (!nonEmpty(payload?.action)) errors.push("action required");
  if (payload?.capability_id !== null && !nonEmpty(payload?.capability_id)) errors.push("capability_id must be null or non-empty");
  if (!RISK_CLASSES.has(payload?.risk_class)) errors.push("invalid risk_class");
  if (!AUTONOMY_MODES.has(payload?.autonomy)) errors.push("invalid autonomy");

  if (!payload?.authorization || typeof payload.authorization !== "object" || Array.isArray(payload.authorization)) {
    errors.push("authorization required");
  } else {
    if (typeof payload.authorization.allowed !== "boolean") errors.push("authorization.allowed must be boolean");
    if (!nonEmpty(payload.authorization.reason)) errors.push("authorization.reason required");
    if (HIGH_IMPACT.has(payload?.risk_class) && payload.authorization.allowed === true && !nonEmpty(payload.authorization.approval_ref)) {
      errors.push("high-impact authorized receipt requires approval_ref");
    }
  }

  const started = Date.parse(payload?.started_at);
  const finished = Date.parse(payload?.finished_at);
  if (!nonEmpty(payload?.started_at) || Number.isNaN(started)) errors.push("invalid started_at");
  if (!nonEmpty(payload?.finished_at) || Number.isNaN(finished)) errors.push("invalid finished_at");
  if (!Number.isNaN(started) && !Number.isNaN(finished) && finished < started) errors.push("finished_at precedes started_at");
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (Number.isFinite(nowMs) && !Number.isNaN(finished) && finished - nowMs > maxFutureSkewMs) errors.push("finished_at is too far in the future");

  if (!payload?.result || typeof payload.result !== "object" || Array.isArray(payload.result)) {
    errors.push("result required");
  } else {
    if (!RESULT_STATES.has(payload.result.state)) errors.push("invalid result.state");
    if (!nonEmpty(payload.result.summary)) errors.push("result.summary required");
    if (!Array.isArray(payload.result.artifact_refs)) errors.push("result.artifact_refs must be an array");
    if (!Array.isArray(payload.result.evidence_refs)) errors.push("result.evidence_refs must be an array");
    if (payload.result.state !== "BLOCKED" && payload?.authorization?.allowed !== true) {
      errors.push("non-blocked execution result requires authorization.allowed=true");
    }
  }

  if (!payload?.runtime || typeof payload.runtime !== "object" || Array.isArray(payload.runtime)) {
    errors.push("runtime required");
  } else {
    if (!nonEmpty(payload.runtime.provider)) errors.push("runtime.provider required");
    if (!nonEmpty(payload.runtime.runtime_ref)) errors.push("runtime.runtime_ref required");
  }

  try { normalizedUsage(payload?.usage || {}); } catch (error) { errors.push(error.message); }

  if (payload?.previous_receipt_sha256 !== null && !/^[a-f0-9]{64}$/.test(payload?.previous_receipt_sha256 || "")) {
    errors.push("invalid previous_receipt_sha256");
  }

  if (containsSecretLikeContent({
    receipt_id:payload?.receipt_id,
    task_id:payload?.task_id,
    action:payload?.action,
    capability_id:payload?.capability_id,
    authorization:payload?.authorization,
    result:payload?.result,
    runtime:payload?.runtime,
  })) errors.push("secret-like content prohibited");

  return errors;
}

export function generateReceiptKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return Object.freeze({
    public_key_pem:publicKey.export({ type:"spki", format:"pem" }).toString(),
    private_key_pem:privateKey.export({ type:"pkcs8", format:"pem" }).toString(),
  });
}

export function signExecutionReceipt(payload, { privateKeyPem, keyId }) {
  const errors = validateExecutionReceiptPayload(payload);
  if (errors.length) throw new Error(errors.join("; "));
  if (!nonEmpty(keyId)) throw new Error("keyId required");
  if (!nonEmpty(privateKeyPem)) throw new Error("privateKeyPem required");
  const canonical = canonicalJson(payload);
  const digest = sha256(canonical);
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = cryptoSign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");
  return Object.freeze({
    schema:1,
    alg:RECEIPT_ALG,
    key_id:clean(keyId, 128),
    payload,
    payload_sha256:digest,
    signature_base64:signature,
  });
}

export function executionReceiptRef(envelope) {
  if (!/^[a-f0-9]{64}$/.test(envelope?.payload_sha256 || "")) throw new Error("receipt envelope missing valid payload_sha256");
  return `receipt:sha256:${envelope.payload_sha256}`;
}

export function verifyExecutionReceipt(envelope, {
  publicKeys = {},
  now = new Date(),
  maxFutureSkewMs = 5 * 60 * 1000,
  maxReceiptAgeMs = null,
  consumedReceiptRefs = [],
  allowedRuntimeProviders = null,
  allowedRuntimeRefPrefixes = null,
  requiredTaskId = null,
  requiredEmployeeId = null,
  requiredCapabilityId = undefined,
  requiredResultStates = null,
} = {}) {
  const reasons = [];
  if (envelope?.schema !== 1) reasons.push("ENVELOPE_SCHEMA_INVALID");
  if (envelope?.alg !== RECEIPT_ALG) reasons.push("UNSUPPORTED_ALGORITHM");
  if (!nonEmpty(envelope?.key_id)) reasons.push("KEY_ID_MISSING");
  if (!/^[a-f0-9]{64}$/.test(envelope?.payload_sha256 || "")) reasons.push("PAYLOAD_HASH_INVALID");
  if (!nonEmpty(envelope?.signature_base64)) reasons.push("SIGNATURE_MISSING");

  const payloadErrors = validateExecutionReceiptPayload(envelope?.payload, { now, maxFutureSkewMs });
  if (payloadErrors.length) reasons.push(...payloadErrors.map((item) => `PAYLOAD_INVALID:${item}`));

  let canonical = null;
  try { canonical = canonicalJson(envelope?.payload); } catch (error) { reasons.push(`CANONICALIZATION_FAILED:${error.message}`); }
  if (canonical && sha256(canonical) !== envelope?.payload_sha256) reasons.push("PAYLOAD_HASH_MISMATCH");

  const publicKeyPem = publicKeys?.[envelope?.key_id];
  if (!nonEmpty(publicKeyPem)) {
    reasons.push("UNTRUSTED_KEY_ID");
  } else if (canonical && nonEmpty(envelope?.signature_base64)) {
    try {
      const publicKey = createPublicKey(publicKeyPem);
      const valid = cryptoVerify(
        null,
        Buffer.from(canonical, "utf8"),
        publicKey,
        Buffer.from(envelope.signature_base64, "base64"),
      );
      if (!valid) reasons.push("SIGNATURE_INVALID");
    } catch {
      reasons.push("PUBLIC_KEY_OR_SIGNATURE_INVALID");
    }
  }

  if (requiredTaskId !== null && envelope?.payload?.task_id !== requiredTaskId) reasons.push("TASK_BINDING_MISMATCH");
  if (requiredEmployeeId !== null && envelope?.payload?.employee_id !== requiredEmployeeId) reasons.push("EMPLOYEE_BINDING_MISMATCH");
  if (requiredCapabilityId !== undefined && envelope?.payload?.capability_id !== requiredCapabilityId) reasons.push("CAPABILITY_BINDING_MISMATCH");
  if (Array.isArray(requiredResultStates) && !requiredResultStates.includes(envelope?.payload?.result?.state)) reasons.push("RESULT_STATE_NOT_ALLOWED");

  const receiptRef = /^[a-f0-9]{64}$/.test(envelope?.payload_sha256 || "") ? executionReceiptRef(envelope) : null;
  if (maxReceiptAgeMs !== null && maxReceiptAgeMs !== undefined) {
    if (typeof maxReceiptAgeMs !== "number" || !Number.isFinite(maxReceiptAgeMs) || maxReceiptAgeMs < 0) {
      reasons.push("RECEIPT_FRESHNESS_POLICY_INVALID");
    } else {
      const finishedAt = Date.parse(envelope?.payload?.finished_at);
      const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
      if (!Number.isNaN(finishedAt) && Number.isFinite(nowMs) && nowMs - finishedAt > maxReceiptAgeMs) {
        reasons.push("RECEIPT_STALE");
      }
    }
  }

  const consumed = consumedReceiptRefs instanceof Set
    ? [...consumedReceiptRefs]
    : (Array.isArray(consumedReceiptRefs) ? consumedReceiptRefs : []);
  if (receiptRef && consumed.map((item) => String(item).trim()).includes(receiptRef)) reasons.push("RECEIPT_REPLAYED");

  const runtimeProvider = clean(envelope?.payload?.runtime?.provider, 120);
  const runtimeRef = clean(envelope?.payload?.runtime?.runtime_ref, 512);
  const allowedProviders = (Array.isArray(allowedRuntimeProviders) ? allowedRuntimeProviders : [])
    .map((item) => clean(item, 120))
    .filter(Boolean);
  const allowedRefPrefixes = (Array.isArray(allowedRuntimeRefPrefixes) ? allowedRuntimeRefPrefixes : [])
    .map((item) => clean(item, 512))
    .filter(Boolean);
  if (allowedProviders.length && !allowedProviders.includes(runtimeProvider)) reasons.push("RUNTIME_PROVIDER_NOT_ALLOWED");
  if (allowedRefPrefixes.length && !allowedRefPrefixes.some((prefix) => runtimeRef.startsWith(prefix))) reasons.push("RUNTIME_REF_NOT_ALLOWED");

  const uniqueReasons = [...new Set(reasons)];
  return Object.freeze({
    ok:uniqueReasons.length === 0,
    decision:uniqueReasons.length === 0 ? "VALID" : "INVALID",
    receipt_ref:receiptRef,
    reasons:Object.freeze(uniqueReasons),
    payload_sha256:envelope?.payload_sha256 || null,
    key_id:envelope?.key_id || null,
  });
}
