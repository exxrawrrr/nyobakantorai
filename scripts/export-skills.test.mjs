import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  checkHarnessExports,
  exportHarnessTarget,
  parseCanonicalSkill,
} from "./export-skills.mjs";

const tempRoot = () => mkdtemp(resolve(tmpdir(), "nyoba-harness-test-"));

function frontmatterKeys(text) {
  assert.ok(text.startsWith("---\n"));
  const end = text.indexOf("\n---\n", 4);
  assert.ok(end > 0);
  return text.slice(4, end).split("\n")
    .filter((line) => /^[A-Za-z0-9_-]+:/.test(line))
    .map((line) => line.slice(0, line.indexOf(":")));
}

test("Agent Skills core export is byte-identical to canonical skills", async (t) => {
  const outRoot = await tempRoot();
  t.after(async () => rm(outRoot, { recursive:true, force:true }));

  const result = await exportHarnessTarget({ targetId:"agent-skills-core", outRoot });
  assert.equal(result.skill_count, 40);
  assert.equal(result.manifest.source.id, "agent-skills");
  assert.ok(result.manifest.source.commit);

  const skill = "nyoba-context-prompt-compiler";
  const canonical = await readFile(new URL(`../skills/canonical/${skill}/SKILL.md`, import.meta.url), "utf8");
  const exported = await readFile(resolve(outRoot, "agent-skills-core", "skills", skill, "SKILL.md"), "utf8");
  assert.equal(exported, canonical);
});

for (const target of [
  { id:"codex-cli", root:["codex-cli",".agents","skills"], source:"codex-cli" },
  { id:"gemini-cli", root:["gemini-cli",".agents","skills"], source:"gemini-cli" },
  { id:"github-copilot", root:["github-copilot",".github","skills"], source:"awesome-copilot" },
]) {
  test(`${target.id} export uses conservative name+description frontmatter and preserves body`, async (t) => {
    const outRoot = await tempRoot();
    t.after(async () => rm(outRoot, { recursive:true, force:true }));

    const result = await exportHarnessTarget({ targetId:target.id, outRoot });
    assert.equal(result.skill_count, 40);
    assert.equal(result.manifest.source.id, target.source);
    assert.ok(result.manifest.source.commit);
    assert.equal(result.manifest.runtime_tested, false);

    const skill = "nyoba-context-prompt-compiler";
    const canonical = await readFile(new URL(`../skills/canonical/${skill}/SKILL.md`, import.meta.url), "utf8");
    const exported = await readFile(resolve(outRoot, ...target.root, skill, "SKILL.md"), "utf8");
    const canonicalParsed = parseCanonicalSkill(canonical, skill);
    const exportedParsed = parseCanonicalSkill(exported, skill);

    assert.deepEqual(frontmatterKeys(exported), ["name","description"]);
    assert.equal(exportedParsed.description, canonicalParsed.description);
    assert.equal(exportedParsed.body, canonicalParsed.body);
    assert.equal(exported.includes("nyoba-source-ids"), false);
    assert.equal(exported.includes("compatibility:"), false);
  });
}

test("Hermes native target verifies generated employee skill parity", async (t) => {
  const outRoot = await tempRoot();
  t.after(async () => rm(outRoot, { recursive:true, force:true }));

  const result = await exportHarnessTarget({ targetId:"hermes", outRoot });
  assert.equal(result.skill_count, 0);
  assert.ok(result.assignment_count > 40);
  assert.equal(result.manifest.runtime_tested, true);
  assert.equal(result.manifest.source.id, "project:nyobakantorai");
  for (const item of result.manifest.native_assignments) {
    assert.equal(item.canonical_sha256, item.generated_sha256);
  }
});

test("cross-harness manifests are deterministic across fresh exports", async () => {
  const result = await checkHarnessExports({
    targets:["agent-skills-core","hermes","codex-cli","gemini-cli","github-copilot"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("all adapter exports expose exactly the canonical skill names", async (t) => {
  const outRoot = await tempRoot();
  t.after(async () => rm(outRoot, { recursive:true, force:true }));

  const canonical = (await readdir(new URL("../skills/canonical/", import.meta.url), { withFileTypes:true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  await exportHarnessTarget({ targetId:"codex-cli", outRoot });
  await exportHarnessTarget({ targetId:"gemini-cli", outRoot });
  await exportHarnessTarget({ targetId:"github-copilot", outRoot });

  const codex = (await readdir(resolve(outRoot,"codex-cli",".agents","skills"), { withFileTypes:true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const gemini = (await readdir(resolve(outRoot,"gemini-cli",".agents","skills"), { withFileTypes:true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const copilot = (await readdir(resolve(outRoot,"github-copilot",".github","skills"), { withFileTypes:true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  assert.deepEqual(codex, canonical);
  assert.deepEqual(gemini, canonical);
  assert.deepEqual(copilot, canonical);
});
