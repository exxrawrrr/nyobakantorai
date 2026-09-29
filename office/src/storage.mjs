const DEFAULT_SETTINGS = Object.freeze({ motion:true, debug:false });

const clean = (value, max = 256) => String(value ?? "").trim().slice(0, max);

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function canonicalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Storage bundle forbids non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  throw new TypeError(`Storage bundle forbids type: ${typeof value}`);
}

export function canonicalStorageJson(value) {
  return JSON.stringify(canonicalize(value));
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value, cryptoImpl = globalThis.crypto) {
  assert(cryptoImpl?.subtle?.digest, "Web Crypto SHA-256 is required.");
  const data = new TextEncoder().encode(String(value));
  return bytesToHex(await cryptoImpl.subtle.digest("SHA-256", data));
}

export function normalizeOfficeSettings(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.freeze({
    motion: input.motion !== false,
    debug: input.debug === true,
  });
}

export function defineStorageAdapter(spec = {}) {
  assert(spec && typeof spec === "object" && !Array.isArray(spec), "Storage adapter spec is required.");
  const id = clean(spec.id, 64).toLowerCase();
  assert(/^[a-z][a-z0-9-]{1,63}$/.test(id), "Storage adapter id must be a lowercase slug.");
  assert(typeof spec.get === "function", "Storage adapter get() is required.");
  assert(typeof spec.set === "function", "Storage adapter set() is required.");
  assert(typeof spec.remove === "function", "Storage adapter remove() is required.");

  return Object.freeze({
    id,
    get:key => spec.get(clean(key, 240)),
    set:(key, value) => spec.set(clean(key, 240), String(value)),
    remove:key => spec.remove(clean(key, 240)),
  });
}

export function createWebStorageAdapter(storage, { id = "browser-local", prefix = "" } = {}) {
  assert(storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" && typeof storage.removeItem === "function",
    "A Web Storage-compatible object is required.");
  const namespace = clean(prefix, 120);
  const keyFor = key => namespace ? `${namespace}:${key}` : key;
  return defineStorageAdapter({
    id,
    get:key => storage.getItem(keyFor(key)),
    set:(key, value) => storage.setItem(keyFor(key), value),
    remove:key => storage.removeItem(keyFor(key)),
  });
}

export function createMemoryStorageAdapter(initial = {}, { id = "memory-local", prefix = "" } = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
  const namespace = clean(prefix, 120);
  const keyFor = key => namespace ? `${namespace}:${key}` : key;
  const adapter = defineStorageAdapter({
    id,
    get:key => data.has(keyFor(key)) ? data.get(keyFor(key)) : null,
    set:(key, value) => { data.set(keyFor(key), value); },
    remove:key => { data.delete(keyFor(key)); },
  });
  return Object.freeze({
    ...adapter,
    snapshot:() => Object.freeze(Object.fromEntries([...data.entries()].sort(([a],[b]) => a.localeCompare(b)))),
  });
}

export function readJson(storageAdapter, key, fallback = null) {
  const raw = storageAdapter.get(key);
  if (raw == null || raw === "") return fallback;
  return JSON.parse(raw);
}

export function writeJson(storageAdapter, key, value) {
  storageAdapter.set(key, JSON.stringify(value));
  return value;
}

function bundlePayload({ registry, settings, createdAt }) {
  return {
    schema:1,
    format:"nyobakantorai-storage-bundle",
    created_at:createdAt,
    datasets:{
      registry,
      settings:normalizeOfficeSettings(settings),
    },
  };
}

export async function createStorageBundle({
  registry,
  settings = DEFAULT_SETTINGS,
  createdAt = new Date().toISOString(),
  cryptoImpl = globalThis.crypto,
} = {}) {
  assert(registry && typeof registry === "object" && !Array.isArray(registry), "Registry object is required.");
  assert(!Number.isNaN(Date.parse(createdAt)), "createdAt must be a valid timestamp.");
  const payload = bundlePayload({ registry:structuredClone(registry), settings, createdAt });
  const payloadSha256 = await sha256Hex(canonicalStorageJson(payload), cryptoImpl);
  return Object.freeze({
    ...payload,
    payload_sha256:payloadSha256,
  });
}

export async function importStorageBundle(text, {
  validateRegistry,
  cryptoImpl = globalThis.crypto,
} = {}) {
  assert(typeof validateRegistry === "function", "validateRegistry callback is required.");
  let parsed;
  try { parsed = JSON.parse(String(text ?? "")); }
  catch { throw new Error("Valid JSON required."); }

  if (parsed?.format !== "nyobakantorai-storage-bundle") {
    return Object.freeze({
      kind:"legacy-registry",
      registry_text:String(text),
      registry:null,
      settings:null,
      bundle:null,
    });
  }

  if (parsed.schema !== 1) throw new Error("Unsupported storage bundle schema.");
  if (!parsed.datasets || typeof parsed.datasets !== "object" || Array.isArray(parsed.datasets)) {
    throw new Error("Storage bundle datasets are required.");
  }
  if (!/^[a-f0-9]{64}$/.test(parsed.payload_sha256 || "")) {
    throw new Error("Storage bundle SHA-256 is missing or invalid.");
  }

  const payload = bundlePayload({
    registry:parsed.datasets.registry,
    settings:parsed.datasets.settings,
    createdAt:parsed.created_at,
  });
  const digest = await sha256Hex(canonicalStorageJson(payload), cryptoImpl);
  if (digest !== parsed.payload_sha256) throw new Error("Storage bundle integrity check failed.");

  validateRegistry(payload.datasets.registry);
  const settings = normalizeOfficeSettings(payload.datasets.settings);
  return Object.freeze({
    kind:"storage-bundle",
    registry:structuredClone(payload.datasets.registry),
    settings,
    bundle:Object.freeze({ ...payload, payload_sha256:digest }),
  });
}

export function createTimestampedBackupKey(baseKey, at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) throw new TypeError("Backup timestamp is invalid.");
  return `${clean(baseKey, 200)}-backup-${date.toISOString().replaceAll(":", "-")}`;
}

export const OFFICE_STORAGE_DEFAULTS = Object.freeze({
  registry_key:"nyobakantorai-registry-v1",
  settings_key:"nyobakantorai-settings-v1",
  settings:DEFAULT_SETTINGS,
});
