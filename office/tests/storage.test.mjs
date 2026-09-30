import test from "node:test";
import assert from "node:assert/strict";
import {
  OFFICE_STORAGE_DEFAULTS,
  createMemoryStorageAdapter,
  createStorageBundle,
  createTimestampedBackupKey,
  importStorageBundle,
  normalizeOfficeSettings,
  readJson,
  writeJson,
} from "../src/storage.mjs";
import { createTask, emptyRegistry, validateRegistry } from "../registry.mjs";

const registryFixture = () => createTask(
  emptyRegistry(),
  { title:"Storage fixture", assignee_id:"fikri", priority:"LOW" },
  () => "task_storage",
  () => "2026-09-29T04:20:00.000Z",
);

test("memory storage adapter provides a pluggable Web-Storage-like persistence boundary", () => {
  const storage = createMemoryStorageAdapter();
  const registry = registryFixture();
  writeJson(storage, OFFICE_STORAGE_DEFAULTS.registry_key, registry);
  const loaded = readJson(storage, OFFICE_STORAGE_DEFAULTS.registry_key);
  assert.deepEqual(loaded, registry);
  assert.equal(validateRegistry(loaded), true);

  storage.remove(OFFICE_STORAGE_DEFAULTS.registry_key);
  assert.equal(readJson(storage, OFFICE_STORAGE_DEFAULTS.registry_key, null), null);
});

test("portable storage bundle round-trips registry and sanitized settings with SHA-256 integrity", async () => {
  const registry = registryFixture();
  const bundle = await createStorageBundle({
    registry,
    settings:{ motion:false, debug:true, unknown:"drop-me" },
    createdAt:"2026-09-29T04:21:00.000Z",
  });

  assert.equal(bundle.schema, 1);
  assert.equal(bundle.format, "nyobakantorai-storage-bundle");
  assert.match(bundle.payload_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(bundle.datasets.settings, { motion:false, debug:true });
  assert.equal("unknown" in bundle.datasets.settings, false);

  const imported = await importStorageBundle(JSON.stringify(bundle), { validateRegistry });
  assert.equal(imported.kind, "storage-bundle");
  assert.deepEqual(imported.registry, registry);
  assert.deepEqual(imported.settings, { motion:false, debug:true });
});

test("storage bundle rejects tampering before registry import", async () => {
  const bundle = await createStorageBundle({
    registry:registryFixture(),
    settings:{ motion:true, debug:false },
    createdAt:"2026-09-29T04:22:00.000Z",
  });
  const tampered = structuredClone(bundle);
  tampered.datasets.registry.tasks[0].title = "Tampered title";

  await assert.rejects(
    () => importStorageBundle(JSON.stringify(tampered), { validateRegistry }),
    /integrity check failed/
  );
});

test("storage bundle rejects invalid registry even when checksum is recomputed by exporter", async () => {
  const registry = registryFixture();
  registry.tasks[0].assignee_id = "not-an-employee";
  const bundle = await createStorageBundle({
    registry,
    settings:{ motion:true, debug:false },
    createdAt:"2026-09-29T04:23:00.000Z",
  });

  await assert.rejects(
    () => importStorageBundle(JSON.stringify(bundle), { validateRegistry }),
    /Invalid task/
  );
});

test("legacy registry JSON is detected without silently treating it as a bundle", async () => {
  const registry = registryFixture();
  const imported = await importStorageBundle(JSON.stringify(registry), { validateRegistry });
  assert.equal(imported.kind, "legacy-registry");
  assert.equal(imported.registry, null);
  assert.equal(imported.settings, null);
  assert.equal(JSON.parse(imported.registry_text).schema, 3);
});

test("settings normalization keeps only supported local preferences", () => {
  assert.deepEqual(normalizeOfficeSettings({ motion:false, debug:true, token:"secret" }), {
    motion:false,
    debug:true,
  });
  assert.deepEqual(normalizeOfficeSettings(null), { motion:true, debug:false });
});

test("timestamped backup keys are deterministic for a supplied clock", () => {
  assert.equal(
    createTimestampedBackupKey("nyobakantorai-registry-v1", new Date("2026-09-29T04:24:00.000Z")),
    "nyobakantorai-registry-v1-backup-2026-09-29T04-24-00.000Z"
  );
  assert.throws(
    () => createTimestampedBackupKey("registry", "not-a-date"),
    /timestamp is invalid/
  );
});
