import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const COMMON = ["nyoba-task-truth","nyoba-manual-chatgpt-handoff","nyoba-approval-and-evidence","nyoba-safe-tool-use"];
const SAFE_TOOLSETS = new Set(["browser","clarify","code_execution","connections","coding","cronjob","delegation","file","image_gen","kanban","memory","safe","search","session_search","skills","terminal","vision","web"]);
const ALLOWED = new Set(["id","name","role","department","personality","expertise","skills","toolsets","aliases","write"]);

const csv = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
const unique = (items) => [...new Set(items)];

export function parseOptions(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg === "--write") { out.write = true; continue; }
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (!match || !ALLOWED.has(match[1])) throw new Error(`Unknown or malformed option: ${arg}`);
    out[match[1]] = match[2];
  }
  return out;
}

export function draftEmployee(options, registry) {
  const id = String(options.id || "").trim().toLowerCase();
  const name = String(options.name || "").trim();
  const role = String(options.role || "").trim();
  const department = String(options.department || "").trim();
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new Error("Use --id with a lowercase slug.");
  if (registry.employees.some((employee) => employee.id === id)) throw new Error(`Employee already exists: ${id}`);
  if (!name || !role || !department) throw new Error("--name, --role, and --department are required.");

  const skills = unique([...COMMON, ...csv(options.skills)]);
  const toolsets = unique(csv(options.toolsets).length ? csv(options.toolsets) : ["skills","web","search","clarify"]);
  for (const toolset of toolsets) if (!SAFE_TOOLSETS.has(toolset)) throw new Error(`Unknown/unapproved core Hermes toolset: ${toolset}`);
  const expertise = csv(options.expertise).length ? csv(options.expertise) : [role];
  const aliases = unique([id, name.toLowerCase(), ...csv(options.aliases)]);
  const slot = registry.employees.length;

  return {
    id, name, role, department,
    summary: `${role} specialist added by the repository owner; customize this summary before publishing.`,
    aliases,
    personality: {
      traits: csv(options.personality).length ? csv(options.personality) : ["practical","evidence-aware"],
      communication_style: "Clear, role-appropriate, and explicit about uncertainty.",
      catchphrases: [],
      dialogue_profile: {
        default_register: "Clear Indonesian-first communication with role-appropriate technical terms.",
        opening_behavior: "Start with the most useful role-specific conclusion or state.",
        response_shape: "Conclusion -> evidence/reason -> action -> verification.",
        sentence_rhythm: "Concise and role-appropriate.",
        question_style: "Ask only questions that materially unblock the task.",
        disagreement_style: "Challenge unsupported claims with evidence and a safer alternative.",
        uncertainty_style: "Label unknowns and assumptions explicitly.",
        humor_style: "Use humor sparingly and never when risk, safety, or evidence is unclear.",
        closing_behavior: "End with the next action and verification condition.",
        signature_moves: ["make role-specific evidence visible","leave a verifiable next action"],
        avoid: ["generic assistant filler","catchphrase spam"],
      },
    },
    habits: {
      idle_habit: "Reviews the task queue.",
      thinking_habit: "Checks scope, evidence, and permissions.",
      working_habit: "Works from a scoped brief and records evidence.",
      stress_habit: "Escalates blockers instead of inventing progress.",
      success_habit: "Closes with artifact, evidence, and next action.",
    },
    work_style: {
      decision_style: "Evidence and reversibility before speed.",
      handoff: "Scope + artifact + evidence + receipt.",
      escalation: "Escalate missing approval, capability, evidence, or ownership.",
    },
    reasoning_profile: {
      mental_models: ["role-specific evidence","reversibility","authority boundary"],
      default_questions: ["What outcome matters?","What evidence changes the decision?","What requires approval?"],
      failure_modes: ["over-generalizing from one task","claiming success without evidence"],
    },
    learning_profile: {
      memory_mode: "PROFILE_SCOPED_HERMES_FIRST",
      focus: "repeated lessons, corrections, and evidence-backed workflow improvements",
      reflection_questions: ["What changed because of this task?","What evidence makes the lesson reusable?","Is this memory or a skill candidate?"],
      promotion_rule: "Promote only after repeated evidence or an explicit human rule, then human review.",
    },
    expertise,
    skills,
    preferred_toolsets: toolsets,
    external_capabilities: [],
    optional_integrations: [],
    operational_contract: {
      inputs: ["role-scoped request","relevant source material","constraints and acceptance criteria"],
      outputs: ["role-scoped artifact","evidence-backed result","clear next action or blocker"],
      capability_scope: [],
      forbidden_actions: ["claiming unavailable capabilities","external writes without scoped approval","claiming completion without evidence"],
      evidence_requirements: ["source or artifact reference","verification condition","explicit unknowns/blockers"],
      failure_policy: "If capability, evidence, approval, or source truth is missing, mark the task blocked/incomplete instead of inventing progress.",
      verification_method: "Use role-appropriate evidence and an independent reviewer for consequential completion claims.",
      cost_policy: "Prefer the smallest safe workflow and require approval before paid actions.",
    },
    routing: { keywords: unique([...aliases, ...expertise]).slice(0, 24), collaborators: ["praroro","siti"] },
    visual: {
      color: "#777777",
      asset_status: "pending-original-art",
      asset_id: null,
      scene_position: [80 + (slot % 8) * 145, 360 + Math.floor(slot / 8) * 90],
      desk_slot: slot,
      initials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    },
    memory_boundary: "PROFILE_SCOPED",
    approval_policy: {
      autonomy: "GUARDED",
      read_only_without_approval: true,
      requires_approval: ["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"],
      delegated_policy_required: true,
    },
    verification_policy: {
      independent_required: true,
      self_verify: false,
      reviewer_candidates: ["siti","fikri"],
    },
    profile: { distribution_version: "0.3.0" },
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const registryPath = resolve(root, "config/employees.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const employee = draftEmployee(options, registry);
  for (const skill of employee.skills) {
    if (!existsSync(resolve(root, "skills/hermes-custom", skill, "SKILL.md"))) throw new Error(`Unknown canonical skill: ${skill}`);
  }

  const preview = {
    mode: options.write ? "WRITE" : "PREVIEW",
    employee,
    notice: "No secret, credential, MCP authorization, provider token, or finished artwork is generated.",
  };
  if (!options.write) { console.log(JSON.stringify(preview, null, 2)); return; }

  const original = JSON.stringify(registry, null, 2) + "\n";
  registry.employees.push(employee);
  registry.employee_count = registry.employees.length;
  await writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");

  const generated = spawnSync(process.execPath, ["scripts/generate-workforce.mjs"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (generated.status !== 0) {
    await writeFile(registryPath, original, "utf8");
    throw new Error("Workforce generation failed; registry was restored.\n" + String(generated.stderr || generated.stdout));
  }
  console.log(JSON.stringify({ ...preview, employee_count: registry.employee_count }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
