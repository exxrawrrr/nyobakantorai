import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { findEmployeeSelectionArg, resolveEmployeeSelection } from "./employee-selection.mjs";
import { materializeConfiguredUpgrades } from "../packages/skills-store/index.mjs";

const root = resolve(import.meta.dirname, "..");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function walkFiles(dir) {
  const out = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  await walk(dir);
  return out.sort();
}

async function sha256(path) {
  const data = await readFile(path);
  return createHash("sha256").update(data).digest("hex");
}

function safeText(value) {
  return String(value ?? "").replaceAll("\r", " ").trim();
}

export async function buildEmployeePack({ employeeId, outRoot = resolve(root, "dist/employees") } = {}) {
  const registry = await readJson(resolve(root, "config/employees.json"));
  const integrations = await readJson(resolve(root, "config/integrations.json"));
  const upstream = await readJson(resolve(root, "config/upstream-sources.json"));
  const employee = registry.employees.find((item) => item.id === employeeId);
  if (!employee) throw new Error(`Unknown employee: ${employeeId}`);
  const skillStore = await materializeConfiguredUpgrades({ root });
  const effectiveEmployee = skillStore.upgraded.find((item) => item.id === employeeId);
  const skillAttachments = skillStore.attachments.filter((item) => item.employee_id === employeeId);
  if (!effectiveEmployee) throw new Error(`Skills Store effective employee missing: ${employeeId}`);

  const source = resolve(root, "hermes-profiles", employee.id);
  const target = resolve(outRoot, employee.id);
  await stat(resolve(source, "distribution.yaml"));

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });

  // Skills Store is an overlay: keep the canonical employee profile/authority unchanged,
  // then attach only owner-reviewed procedural skills into the distributable pack.
  for (const attachment of skillAttachments) {
    const sourceSkill = resolve(root, "skills", "canonical", attachment.skill_id);
    const targetSkill = resolve(target, "skills", "nyobakantorai", attachment.skill_id);
    await mkdir(resolve(target, "skills", "nyobakantorai"), { recursive: true });
    await cp(sourceSkill, targetSkill, { recursive: true });
  }

  const optionalIds = new Set(employee.optional_integrations || []);
  const optionalIntegrations = integrations.integrations.filter((item) => optionalIds.has(item.id));
  const integrationSourceIds = new Set(optionalIntegrations.map((item) => item.source_id).filter(Boolean));
  const relevantSources = upstream.sources.filter((item) => integrationSourceIds.has(item.id));
  const reviewedSkillSources = upstream.sources.filter((item) => item.usage_mode !== "excluded-from-copy-or-derivation");

  await mkdir(resolve(target, "provenance"), { recursive: true });
  await mkdir(resolve(target, "integrations"), { recursive: true });
  await writeFile(
    resolve(target, "integrations/optional-integrations.json"),
    JSON.stringify({ schema: 1, default_state: "NOT_INSTALLED", integrations: optionalIntegrations }, null, 2) + "\n",
  );
  await writeFile(
    resolve(target, "provenance/SOURCES.json"),
    JSON.stringify({
      schema: 1,
      employee_id: employee.id,
      policy: upstream.policy,
      relevant_integration_sources: relevantSources,
      reviewed_skill_source_catalog: reviewedSkillSources,
      note: "Bundled nyobakantorai skills remain the canonical rewritten/adapted project skills; inspect each SKILL.md plus the project source catalog for procedure-level attribution.",
    }, null, 2) + "\n",
  );

  const manifest = {
    schema: 1,
    pack_id: `nyobakantorai.${employee.id}`,
    employee_id: employee.id,
    employee_name: employee.name,
    role: employee.role,
    department: employee.department,
    workforce_version: registry.version,
    distribution_version: employee.profile.distribution_version,
    runtime: {
      primary: "hermes",
      install_command: "hermes profile install . -y",
    },
    personality: {
      traits: employee.personality.traits,
      dialogue_profile: employee.personality.dialogue_profile,
    },
    operational_contract: employee.operational_contract,
    baseline_skills: employee.skills,
    skills: effectiveEmployee.skills,
    skill_store_attachments: skillAttachments.map((item) => ({
      skill_id: item.skill_id,
      version: item.version,
      install_ref: item.install_ref,
      attachment_ref: item.attachment_ref,
      evidence_ref: item.evidence_ref,
      authority_effect: item.authority_effect,
    })),
    preferred_toolsets: employee.preferred_toolsets,
    optional_integrations: employee.optional_integrations,
    memory_boundary: employee.memory_boundary,
    learning_policy: employee.learning_profile,
    approval_policy: employee.approval_policy,
    verification_policy: employee.verification_policy,
    truth_boundary: "configured != connected != executed != succeeded != verified",
    credentials_bundled: false,
  };
  await writeFile(resolve(target, "employee-pack.json"), JSON.stringify(manifest, null, 2) + "\n");

  const readme = `# ${employee.name} — ${employee.role}

Standalone nyobakantorai employee pack.

${safeText(employee.summary)}

## Install

From this directory:

\`\`\`bash
hermes profile install . -y
\`\`\`

This pack includes the employee's generated SOUL/profile, baseline canonical role skills, owner-reviewed Skills Store attachments, optional-integration metadata, provenance metadata, and checksums.

Skills Store attachments are **procedural only**. They do not modify connector grants, capability scope, toolsets, approval policy, or external-account authority.

Optional integration metadata is **not permission and is not automatically installed or connected**.

Memory boundary: \`${employee.memory_boundary}\`.

Truth boundary: \`configured != connected != executed != succeeded != verified\`.
`;
  await writeFile(resolve(target, "README.md"), readme);

  const files = (await walkFiles(target)).filter((path) => !path.endsWith("checksums.json"));
  const hashes = {};
  for (const path of files) hashes[relative(target, path).replaceAll("\\", "/")] = await sha256(path);
  await writeFile(
    resolve(target, "checksums.json"),
    JSON.stringify({ algorithm: "sha256", files: hashes }, null, 2) + "\n",
  );

  return {
    employee_id: employee.id,
    path: target,
    files: Object.keys(hashes).length + 1,
    skills: effectiveEmployee.skills.length,
    optional_integrations: optionalIntegrations.length,
  };
}

export async function verifyEmployeePack(target) {
  const checksumPath = resolve(target, "checksums.json");
  const manifest = await readJson(checksumPath);
  const failures = [];
  for (const [rel, expected] of Object.entries(manifest.files || {})) {
    const full = resolve(target, rel);
    let actual = null;
    try { actual = await sha256(full); } catch { actual = null; }
    if (actual !== expected) failures.push({ file: rel, expected, actual });
  }
  return { ok: failures.length === 0, failures };
}

export async function buildSelectedEmployeePacks({ selection = "all", outRoot = resolve(root, "dist/employees") } = {}) {
  const registry = await readJson(resolve(root, "config/employees.json"));
  const allIds = registry.employees.map((item) => item.id);
  const ids = resolveEmployeeSelection(selection, allIds);
  const built = [];
  for (const employeeId of ids) built.push(await buildEmployeePack({ employeeId, outRoot }));
  return built;
}

export async function checkSelectedEmployeePacks({ selection = "all" } = {}) {
  const firstRoot = await mkdtemp(resolve(tmpdir(), "nyoba-pack-check-a-"));
  const secondRoot = await mkdtemp(resolve(tmpdir(), "nyoba-pack-check-b-"));
  try {
    const first = await buildSelectedEmployeePacks({ selection, outRoot:firstRoot });
    const second = await buildSelectedEmployeePacks({ selection, outRoot:secondRoot });
    const failures = [];
    for (const item of first) {
      const peer = second.find((candidate) => candidate.employee_id === item.employee_id);
      if (!peer) {
        failures.push({ employee_id:item.employee_id, reason:"missing_second_build" });
        continue;
      }
      const [a, b, verifiedA, verifiedB] = await Promise.all([
        readFile(resolve(firstRoot, item.employee_id, "checksums.json"), "utf8"),
        readFile(resolve(secondRoot, item.employee_id, "checksums.json"), "utf8"),
        verifyEmployeePack(resolve(firstRoot, item.employee_id)),
        verifyEmployeePack(resolve(secondRoot, item.employee_id)),
      ]);
      if (a !== b) failures.push({ employee_id:item.employee_id, reason:"checksum_manifest_drift" });
      if (!verifiedA.ok) failures.push({ employee_id:item.employee_id, reason:"first_build_failed_verification", details:verifiedA.failures });
      if (!verifiedB.ok) failures.push({ employee_id:item.employee_id, reason:"second_build_failed_verification", details:verifiedB.failures });
    }
    return { ok: failures.length === 0, selection, employee_count:first.length, failures };
  } finally {
    await Promise.all([
      rm(firstRoot, { recursive:true, force:true }),
      rm(secondRoot, { recursive:true, force:true }),
    ]);
  }
}

function parseOut(argv) {
  const eq = argv.find((arg) => arg.startsWith("--out="));
  if (eq) return resolve(eq.slice("--out=".length));
  const index = argv.indexOf("--out");
  if (index >= 0) {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error("--out requires a directory.");
    return resolve(next);
  }
  return resolve(root, "dist/employees");
}

async function main() {
  const argv = process.argv.slice(2);
  const employeeEq = argv.find((arg) => arg.startsWith("--employee="));
  const employeeIndex = argv.indexOf("--employee");
  let selection = findEmployeeSelectionArg(argv);
  if (employeeEq) selection = employeeEq.slice("--employee=".length);
  else if (employeeIndex >= 0) {
    const next = argv[employeeIndex + 1];
    if (!next || next.startsWith("--")) throw new Error("--employee requires an employee ID.");
    selection = next;
  }
  if (argv.includes("--check")) {
    const result = await checkSelectedEmployeePacks({ selection });
    if (!result.ok) {
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`Employee pack determinism check passed for ${result.employee_count} employee(s).`);
    return;
  }
  const outRoot = parseOut(argv);
  const built = await buildSelectedEmployeePacks({ selection, outRoot });
  for (const item of built) console.log(`PACK  ${item.employee_id} -> ${item.path} (${item.files} files)`);
  console.log(`Built ${built.length} employee pack(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
