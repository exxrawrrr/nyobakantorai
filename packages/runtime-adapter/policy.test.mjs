import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  authorizeCliAdapterConfig,
  authorizeHttpAdapterConfig,
  defineAdapterPermissionPolicy,
  findAdapterPermissionPolicy,
  validateAdapterPolicyCatalog,
} from "./policy.mjs";

const catalog = JSON.parse(await readFile(new URL("../../config/runtime-adapter-policy.json", import.meta.url), "utf8"));

test("canonical adapter policy catalog is valid and unique", () => {
  const result = validateAdapterPolicyCatalog(catalog);
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.policies.length, 3);
  assert.equal(new Set(result.policies.map((p) => p.id)).size, result.policies.length);
});

test("Hermes policy binds adapter id, executable basename, env, timeout, and buffer", () => {
  const policy = findAdapterPermissionPolicy(catalog, "hermes-readonly");
  const result = authorizeCliAdapterConfig(policy, {
    adapterId:"hermes-readonly",
    executable:"C:\\Tools\\hermes.exe",
    envKeys:["HERMES_HOME","NO_COLOR","PATH"],
    timeoutMs:10_000,
    maxBufferBytes:1024 * 1024,
    shell:false,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.executable_basename, "hermes.exe");

  assert.throws(() => authorizeCliAdapterConfig(policy, {
    adapterId:"hermes-readonly",
    executable:"powershell.exe",
    envKeys:["HERMES_HOME"],
    timeoutMs:1000,
    maxBufferBytes:1024,
    shell:false,
  }), /not allowed/);

  assert.throws(() => authorizeCliAdapterConfig(policy, {
    adapterId:"hermes-readonly",
    executable:"hermes",
    envKeys:["AWS_SECRET_ACCESS_KEY"],
    timeoutMs:1000,
    maxBufferBytes:1024,
    shell:false,
  }), /environment key/);

  assert.throws(() => authorizeCliAdapterConfig(policy, {
    adapterId:"hermes-readonly",
    executable:"hermes",
    envKeys:["PATH"],
    timeoutMs:20_000,
    maxBufferBytes:1024,
    shell:false,
  }), /timeout exceeds/);

  assert.throws(() => authorizeCliAdapterConfig(policy, {
    adapterId:"hermes-readonly",
    executable:"hermes",
    envKeys:["PATH"],
    timeoutMs:1000,
    maxBufferBytes:1024,
    shell:true,
  }), /shell execution is forbidden/);
});

test("loopback HTTP policy rejects remote host, HTTPS, redirects, and excessive task bounds", () => {
  const policy = findAdapterPermissionPolicy(catalog, "loopback-http-readonly");
  const ok = authorizeHttpAdapterConfig(policy, {
    adapterId:"http-local",
    baseUrl:"http://127.0.0.1:9000",
    method:"GET",
    redirect:"error",
    timeoutMs:2000,
    maxTasks:100,
  });
  assert.equal(ok.allowed, true);
  assert.equal(ok.host, "127.0.0.1");

  assert.throws(() => authorizeHttpAdapterConfig(policy, {
    adapterId:"http-local",
    baseUrl:"http://example.com",
    timeoutMs:1000,
    maxTasks:10,
  }), /host .* not allowed/);

  assert.throws(() => authorizeHttpAdapterConfig(policy, {
    adapterId:"http-local",
    baseUrl:"https://localhost:9000",
    timeoutMs:1000,
    maxTasks:10,
  }), /protocol .* not allowed/);

  assert.throws(() => authorizeHttpAdapterConfig(policy, {
    adapterId:"http-local",
    baseUrl:"http://localhost:9000",
    redirect:"follow",
    timeoutMs:1000,
    maxTasks:10,
  }), /redirects are forbidden/);

  assert.throws(() => authorizeHttpAdapterConfig(policy, {
    adapterId:"http-local",
    baseUrl:"http://localhost:9000",
    timeoutMs:1000,
    maxTasks:501,
  }), /maxTasks exceeds/);
});

test("policy catalog fails closed on duplicate IDs and unsafe loopback hosts", () => {
  const duplicate = structuredClone(catalog);
  duplicate.policies.push(structuredClone(duplicate.policies[0]));
  assert.equal(validateAdapterPolicyCatalog(duplicate).ok, false);

  assert.throws(() => defineAdapterPermissionPolicy({
    id:"bad-loopback",
    adapter_ids:["http-local"],
    executable_basenames:[],
    allowed_env_keys:[],
    max_timeout_ms:1000,
    max_buffer_bytes:0,
    max_tasks:10,
    loopback_only:true,
    loopback_hosts:["example.com"],
    allowed_protocols:["http:"],
  }), /non-loopback host forbidden/);
});

test("unknown policy IDs fail closed", () => {
  assert.throws(
    () => findAdapterPermissionPolicy(catalog, "does-not-exist"),
    /unknown adapter permission policy/
  );
});
