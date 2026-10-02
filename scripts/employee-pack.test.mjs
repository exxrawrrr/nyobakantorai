import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildEmployeePack, buildSelectedEmployeePacks, checkSelectedEmployeePacks, verifyEmployeePack } from "./employee-pack.mjs";

async function tempRoot() {
  return await mkdtemp(resolve(tmpdir(), "nyoba-pack-"));
}

test("a single employee exports as a self-contained secret-free Hermes pack", async (t) => {
  const outRoot = await tempRoot();
  t.after(async () => { await rm(outRoot, { recursive:true, force:true }); });

  const result = await buildEmployeePack({ employeeId:"siti", outRoot });
  assert.equal(result.employee_id, "siti");

  const manifest = JSON.parse(await readFile(resolve(outRoot, "siti", "employee-pack.json"), "utf8"));
  assert.equal(manifest.employee_id, "siti");
  assert.equal(manifest.credentials_bundled, false);
  assert.equal(manifest.memory_boundary, "PROFILE_SCOPED");
  assert.ok(manifest.personality.dialogue_profile.opening_behavior);
  assert.ok(manifest.operational_contract.inputs.length > 0);
  assert.ok(manifest.operational_contract.outputs.length > 0);
  assert.ok(manifest.operational_contract.verification_method);
  assert.ok(manifest.skills.length >= 4);
  assert.ok(Array.isArray(manifest.baseline_skills));
  assert.ok(Array.isArray(manifest.skill_store_attachments));
  assert.equal(manifest.skill_store_attachments.length, 1);
  assert.equal(manifest.skill_store_attachments[0].skill_id, "nyoba-research-synthesis");
  assert.equal(manifest.skill_store_attachments[0].authority_effect, "NONE");
  assert.match(manifest.skill_store_attachments[0].install_ref, /^skill-install:sha256:[a-f0-9]{64}$/);
  assert.match(manifest.skill_store_attachments[0].attachment_ref, /^skill-attachment:sha256:[a-f0-9]{64}$/);
  assert.equal(manifest.baseline_skills.includes("nyoba-research-synthesis"), false);
  assert.equal(manifest.skills.includes("nyoba-research-synthesis"), true);

  const installedSkills = await readdir(resolve(outRoot, "siti", "skills", "nyobakantorai"));
  assert.ok(installedSkills.includes("nyoba-research-synthesis"));

  const entries = await readdir(resolve(outRoot, "siti"));
  for (const forbidden of [".env","auth.json","credentials.json","state.db","memories","sessions","logs"]) {
    assert.equal(entries.includes(forbidden), false, `pack must not include ${forbidden}`);
  }

  const verification = await verifyEmployeePack(resolve(outRoot, "siti"));
  assert.equal(verification.ok, true);
});

test("arbitrary subset exports only the requested workers", async (t) => {
  const outRoot = await tempRoot();
  t.after(async () => { await rm(outRoot, { recursive:true, force:true }); });

  const built = await buildSelectedEmployeePacks({ selection:"praroro,siti", outRoot });
  assert.deepEqual(built.map((item) => item.employee_id), ["praroro","siti"]);
  assert.deepEqual((await readdir(outRoot)).sort(), ["praroro","siti"]);
});

test("preset exports preserve specialization", async (t) => {
  const outRoot = await tempRoot();
  t.after(async () => { await rm(outRoot, { recursive:true, force:true }); });

  const built = await buildSelectedEmployeePacks({ selection:"engineering", outRoot });
  assert.deepEqual(built.map((item) => item.employee_id), ["subagjo","siti","bimo"]);
  assert.equal(built.some((item) => item.employee_id === "maya"), false);
});

test("checksum verification catches a modified pack artifact", async (t) => {
  const outRoot = await tempRoot();
  t.after(async () => { await rm(outRoot, { recursive:true, force:true }); });

  await buildEmployeePack({ employeeId:"fikri", outRoot });
  const target = resolve(outRoot, "fikri");
  const soul = await readFile(resolve(target, "SOUL.md"), "utf8");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(resolve(target, "SOUL.md"), soul + "\nmodified\n");
  const verification = await verifyEmployeePack(target);
  assert.equal(verification.ok, false);
  assert.ok(verification.failures.some((item) => item.file === "SOUL.md"));
});


test("determinism check rebuilds the selected pack twice with identical manifests", async () => {
  const result = await checkSelectedEmployeePacks({ selection:"siti" });
  assert.equal(result.ok, true);
  assert.equal(result.employee_count, 1);
  assert.deepEqual(result.failures, []);
});

test("determinism check supports arbitrary subsets without pulling unrelated workers", async () => {
  const result = await checkSelectedEmployeePacks({ selection:"praroro,siti" });
  assert.equal(result.ok, true);
  assert.equal(result.employee_count, 2);
  assert.deepEqual(result.failures, []);
});


test("Skills Store pack overlay does not alter employee authority fields", async (t) => {
  const outRoot = await tempRoot();
  t.after(async () => { await rm(outRoot, { recursive:true, force:true }); });

  await buildEmployeePack({ employeeId:"gugun", outRoot });
  const manifest = JSON.parse(await readFile(resolve(outRoot, "gugun", "employee-pack.json"), "utf8"));
  assert.equal(manifest.skill_store_attachments.length, 1);
  assert.equal(manifest.skill_store_attachments[0].skill_id, "nyoba-experiment-design");
  assert.equal(manifest.skill_store_attachments[0].authority_effect, "NONE");
  assert.ok(manifest.operational_contract.capability_scope.includes("ads.google.write"));
  assert.equal(manifest.operational_contract.capability_scope.includes("ads.meta.write"), false);
  assert.ok(manifest.skills.includes("nyoba-experiment-design"));
});
