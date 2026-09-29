import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");

const sha256Text = (text) => createHash("sha256").update(text).digest("hex");
const readJson = async (rel) => JSON.parse(await readFile(resolve(root, rel), "utf8"));

function parseScalar(raw) {
  const value = String(raw ?? "").trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch {}
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

export function parseCanonicalSkill(text, expectedName = null) {
  if (!text.startsWith("---\n")) throw new Error("SKILL.md must start with YAML frontmatter");
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("SKILL.md frontmatter is not closed");
  const frontmatter = text.slice(4, end);
  const body = text.slice(end + 5);
  const name = parseScalar(frontmatter.match(/^name:\s*(.+)$/m)?.[1]);
  const description = parseScalar(frontmatter.match(/^description:\s*(.+)$/m)?.[1]);
  if (!name || !description) throw new Error("SKILL.md requires name and description");
  if (expectedName && name !== expectedName) throw new Error(`Skill name mismatch: ${expectedName} != ${name}`);
  return Object.freeze({ name, description, frontmatter, body });
}

export function renderMinimalSkill(parsed) {
  return `---\nname: ${parsed.name}\ndescription: ${JSON.stringify(parsed.description)}\n---\n\n${parsed.body.replace(/^\n+/, "")}`;
}

async function listSkillDirs() {
  return (await readdir(resolve(root, "skills/hermes-custom"), { withFileTypes:true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function walkFiles(dir) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes:true })) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await walk(dir);
  return files.sort();
}

async function copySkillDirectory({ skill, destinationDir, minimalFrontmatter }) {
  const sourceDir = resolve(root, "skills/hermes-custom", skill);
  await mkdir(destinationDir, { recursive:true });
  const sourceFiles = await walkFiles(sourceDir);
  const records = [];
  for (const sourceFile of sourceFiles) {
    const rel = relative(sourceDir, sourceFile).replaceAll("\\", "/");
    const targetFile = resolve(destinationDir, rel);
    await mkdir(dirname(targetFile), { recursive:true });
    if (rel === "SKILL.md") {
      const canonical = await readFile(sourceFile, "utf8");
      const parsed = parseCanonicalSkill(canonical, skill);
      const exported = minimalFrontmatter ? renderMinimalSkill(parsed) : canonical;
      await writeFile(targetFile, exported);
      records.push({
        path: rel,
        canonical_sha256: sha256Text(canonical),
        exported_sha256: sha256Text(exported),
        body_sha256: sha256Text(parsed.body),
        transform: minimalFrontmatter ? "frontmatter:name-description-only" : "identity",
      });
    } else {
      await cp(sourceFile, targetFile);
      const bytes = await readFile(sourceFile);
      const digest = createHash("sha256").update(bytes).digest("hex");
      records.push({
        path: rel,
        canonical_sha256: digest,
        exported_sha256: digest,
        transform: "identity",
      });
    }
  }
  return records;
}

async function verifyHermesAssignments() {
  const employees = await readJson("config/employees.json");
  const results = [];
  for (const employee of employees.employees) {
    for (const skill of employee.skills) {
      const canonicalPath = resolve(root, "skills/hermes-custom", skill, "SKILL.md");
      const generatedPath = resolve(root, "hermes-profiles", employee.id, "skills/nyobakantorai", skill, "SKILL.md");
      const [canonical, generated] = await Promise.all([
        readFile(canonicalPath, "utf8"),
        readFile(generatedPath, "utf8"),
      ]);
      if (canonical !== generated) throw new Error(`Hermes skill drift: ${employee.id}/${skill}`);
      results.push({
        employee_id: employee.id,
        skill,
        canonical_sha256: sha256Text(canonical),
        generated_sha256: sha256Text(generated),
      });
    }
  }
  return results;
}

function resolveTargetRoot(base, target) {
  if (target.id === "agent-skills-core") return resolve(base, target.id, "skills");
  if (target.id === "gemini-cli") return resolve(base, target.id, ".agents/skills");
  if (target.id === "github-copilot") return resolve(base, target.id, ".github/skills");
  return resolve(base, target.id);
}

function sourceSnapshot(sourceId, sources) {
  if (sourceId === "project:nyobakantorai") {
    return { id:sourceId, commit:null, license:"MIT", usage_mode:"original" };
  }
  const source = sources.sources.find((item) => item.id === sourceId);
  if (!source) throw new Error(`Unknown harness source_id: ${sourceId}`);
  return { id:source.id, commit:source.commit, license:source.license, usage_mode:source.usage_mode };
}

export async function exportHarnessTarget({ targetId, outRoot = resolve(root, "dist/harness-skills") } = {}) {
  const [compat, sources] = await Promise.all([
    readJson("config/harness-compatibility.json"),
    readJson("config/upstream-sources.json"),
  ]);
  const target = compat.targets.find((item) => item.id === targetId);
  if (!target) throw new Error(`Unknown harness target: ${targetId}`);
  const targetBase = resolve(outRoot, target.id);
  await rm(targetBase, { recursive:true, force:true });
  await mkdir(targetBase, { recursive:true });

  const source = sourceSnapshot(target.source_id, sources);
  const manifest = {
    schema:1,
    target:target.id,
    claim:target.claim,
    runtime_tested:target.runtime_tested,
    source,
    discovery_root:target.discovery_root,
    export_mode:target.export_mode,
    frontmatter_policy:target.frontmatter_policy,
    truth_boundary:"package-compatible != runtime-activated != behaviorally-equivalent",
    skills:[],
    native_assignments:[],
  };

  if (target.export_mode === "native-generated") {
    manifest.native_assignments = await verifyHermesAssignments();
  } else {
    const skills = await listSkillDirs();
    const skillsRoot = resolveTargetRoot(outRoot, target);
    const minimal = target.export_mode === "minimal-frontmatter-adapter";
    for (const skill of skills) {
      const destinationDir = resolve(skillsRoot, skill);
      const files = await copySkillDirectory({ skill, destinationDir, minimalFrontmatter:minimal });
      manifest.skills.push({ skill, files });
    }
  }

  const manifestPath = resolve(targetBase, "HARNESS-MANIFEST.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return Object.freeze({
    target:target.id,
    path:targetBase,
    skill_count:manifest.skills.length,
    assignment_count:manifest.native_assignments.length,
    manifest,
  });
}

export async function exportHarnessTargets({ targets = ["agent-skills-core","hermes","gemini-cli","github-copilot"], outRoot = resolve(root, "dist/harness-skills") } = {}) {
  const results = [];
  for (const targetId of targets) results.push(await exportHarnessTarget({ targetId, outRoot }));
  return results;
}

export async function checkHarnessExports({ targets = ["agent-skills-core","hermes","gemini-cli","github-copilot"] } = {}) {
  const a = await mkdtemp(resolve(tmpdir(), "nyoba-harness-a-"));
  const b = await mkdtemp(resolve(tmpdir(), "nyoba-harness-b-"));
  try {
    const [first, second] = await Promise.all([
      exportHarnessTargets({ targets, outRoot:a }),
      exportHarnessTargets({ targets, outRoot:b }),
    ]);
    const failures = [];
    for (const item of first) {
      const peer = second.find((candidate) => candidate.target === item.target);
      if (!peer) {
        failures.push({ target:item.target, reason:"missing_second_export" });
        continue;
      }
      const firstManifest = await readFile(resolve(item.path, "HARNESS-MANIFEST.json"), "utf8");
      const secondManifest = await readFile(resolve(peer.path, "HARNESS-MANIFEST.json"), "utf8");
      if (firstManifest !== secondManifest) failures.push({ target:item.target, reason:"manifest_drift" });
    }
    return Object.freeze({ ok:failures.length === 0, targets, failures });
  } finally {
    await Promise.all([
      rm(a, { recursive:true, force:true }),
      rm(b, { recursive:true, force:true }),
    ]);
  }
}

function parseArg(argv, name) {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`--${name} requires a value`);
    return next;
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const targetArg = parseArg(argv, "target") || "all";
  const targets = targetArg === "all"
    ? ["agent-skills-core","hermes","gemini-cli","github-copilot"]
    : targetArg.split(",").map((item) => item.trim()).filter(Boolean);

  if (argv.includes("--check")) {
    const result = await checkHarnessExports({ targets });
    if (!result.ok) {
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`Cross-harness export determinism passed for: ${targets.join(", ")}`);
    return;
  }

  const outRoot = resolve(parseArg(argv, "out") || resolve(root, "dist/harness-skills"));
  const results = await exportHarnessTargets({ targets, outRoot });
  for (const result of results) {
    console.log(`HARNESS  ${result.target} -> ${result.path} (${result.skill_count} exported skills, ${result.assignment_count} native assignments)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
