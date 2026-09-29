import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, "config/capability-catalog.json");

const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const taxonomy = await readJson("config/capability-taxonomy.json");
const KINDS = Object.freeze([...taxonomy.kinds]);
const DEFAULT_STATES = Object.freeze([...taxonomy.default_states]);
const RISK_CLASSES = Object.freeze([...taxonomy.inventory_risk_classes]);
const PLATFORMS = Object.freeze([...taxonomy.platforms]);
const uniq = (items) => [...new Set(items)];

function sourceRef(source) {
  return {
    source_id: source.id,
    source_commit: source.commit,
    license: source.license,
  };
}

function projectSource() {
  return { source_id:"project:nyobakantorai", source_commit:null, license:"MIT" };
}

function integrationKind(type) {
  const kind = taxonomy.integration_type_kind_map[type];
  if (!kind) throw new Error(`Unknown integration type in capability taxonomy: ${type}`);
  return kind;
}

function integrationRisk(item, runtimeById) {
  if (item.capability && runtimeById.has(item.capability)) return runtimeById.get(item.capability).risk_class;
  if (item.type.includes("memory")) return "MEMORY";
  if (item.type.includes("browser")) return "EXTERNAL_WRITE";
  return "PROCEDURAL";
}

export async function buildCapabilityCatalog() {
  const [employees, runtime, integrations, sources, skillProvenance] = await Promise.all([
    readJson("config/employees.json"),
    readJson("config/capabilities.json"),
    readJson("config/integrations.json"),
    readJson("config/upstream-sources.json"),
    readJson("config/skill-provenance.json"),
  ]);

  const sourceById = new Map(sources.sources.map((item) => [item.id, item]));
  const runtimeById = new Map(runtime.capabilities.map((item) => [item.id, item]));
  const workers = employees.employees;
  const skillDirs = (await readdir(resolve(root, "skills/hermes-custom"), { withFileTypes:true }))
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();

  const capabilities = [];

  for (const skill of skillDirs) {
    const provenance = skillProvenance.skills[skill];
    const refs = provenance
      ? provenance.source_ids.map((id) => {
          const source = sourceById.get(id);
          if (!source) throw new Error(`Unknown upstream source for ${skill}: ${id}`);
          return sourceRef(source);
        })
      : [projectSource()];
    capabilities.push({
      id:`skill.${skill}`,
      kind:taxonomy.canonical_skill_kind,
      description:`Canonical procedural skill: ${skill}`,
      source_refs:refs,
      usage_mode:provenance ? "recreated-concepts" : "original",
      default_state:"BUNDLED",
      risk_class:"PROCEDURAL",
      required_by:workers.filter((worker) => worker.skills.includes(skill)).map((worker) => worker.id),
      optional_for:[],
      platforms:["windows","linux","macos"],
      install_method:"bundled-with-employee-profile",
      verification_method:"workforce:check + packaged-skill parity",
      artifact_ref:`skills/hermes-custom/${skill}/SKILL.md`,
    });
  }

  for (const capability of runtime.capabilities) {
    capabilities.push({
      id:capability.id,
      kind:taxonomy.provider_contract_kind,
      description:capability.description,
      source_refs:[projectSource()],
      usage_mode:"provider-neutral-contract",
      default_state:capability.default_state,
      risk_class:capability.risk_class,
      required_by:[],
      optional_for:workers.filter((worker) => worker.operational_contract?.capability_scope?.includes(capability.id)).map((worker) => worker.id),
      platforms:["unspecified"],
      install_method:"provider-specific; see linked optional integrations",
      verification_method:"provider evidence_ref + employee scope + autonomy/approval router",
      artifact_ref:"config/capabilities.json",
    });
  }

  for (const item of integrations.integrations) {
    const source = sourceById.get(item.source_id);
    if (!source) throw new Error(`Unknown integration source: ${item.id} -> ${item.source_id}`);
    capabilities.push({
      id:`integration.${item.id}`,
      kind:integrationKind(item.type),
      description:item.reason || item.security || `Optional integration: ${item.id}`,
      source_refs:[sourceRef(source)],
      usage_mode:item.default_state === "REFERENCE_ONLY" ? "reference-only" : "optional-upstream-dependency",
      default_state:item.default_state,
      risk_class:integrationRisk(item, runtimeById),
      required_by:[],
      optional_for:[...(item.recommended_for || [])],
      platforms:["unspecified"],
      install_method:item.install || "reference-only; no automatic installation",
      verification_method:item.capability
        ? `prove ${item.capability} CONNECTED with evidence_ref, then apply worker/approval policy`
        : (item.verification_method || "explicit install/evaluation evidence; configured state alone is insufficient"),
      artifact_ref:"config/integrations.json",
    });
  }

  capabilities.push(
    {
      id:"workflow.employee-pack-build", kind:"workflow",
      description:"Build deterministic standalone employee distributions from canonical workforce data.",
      source_refs:[projectSource()], usage_mode:"original", default_state:"BUNDLED", risk_class:"PROCEDURAL",
      required_by:[], optional_for:workers.map((worker)=>worker.id), platforms:["windows","linux","macos"],
      install_method:"npm run employee:pack", verification_method:"pack tests + SHA-256 manifest verification",
      artifact_ref:"scripts/employee-pack.mjs",
    },
    {
      id:"workflow.fikri-context-compile", kind:"workflow",
      description:"Compile source-preserving L2/L1/L0 context with deterministic protected-atom guards.",
      source_refs:[projectSource()], usage_mode:"adapted", default_state:"BUNDLED", risk_class:"PROCEDURAL",
      required_by:["fikri"], optional_for:["siti","alex","dina"], platforms:["windows","linux","macos"],
      install_method:"bundled local module + Fikri skill", verification_method:"context-guard tests + synthetic compaction benchmark",
      artifact_ref:"packages/context-guard/index.mjs",
    },
    {
      id:"workflow.siti-evidence-verification", kind:"workflow",
      description:"Deterministically reject evidence packets with wrong facts, stale/fabricated evidence, partial completion, unauthorized verification/execution claims, or prompt-injection signals.",
      source_refs:[projectSource()], usage_mode:"original", default_state:"BUNDLED", risk_class:"PROCEDURAL",
      required_by:["siti"], optional_for:["praroro","fikri"], platforms:["windows","linux","macos"],
      install_method:"bundled local module + Siti verification procedure", verification_method:"evidence-verifier unit tests + adversarial policy benchmark",
      artifact_ref:"packages/evidence-verifier/index.mjs",
    },
    {
      id:"policy.human-approval", kind:"policy",
      description:"High-impact writes, paid actions, account changes, and destructive operations require scoped human approval unless a narrower delegated envelope exists.",
      source_refs:[projectSource()], usage_mode:"original", default_state:"BUNDLED", risk_class:"PROCEDURAL",
      required_by:workers.map((worker)=>worker.id), optional_for:[], platforms:["windows","linux","macos"],
      install_method:"built into capability router and worker SOUL contracts", verification_method:"capability-router authorization tests",
      artifact_ref:"packages/capability-router/index.mjs",
    },
    {
      id:"policy.profile-memory-isolation", kind:"policy",
      description:"Worker memory defaults to profile scope; shared promotion is explicit and canonical skill mutation remains repository-review work.",
      source_refs:[projectSource()], usage_mode:"adapted", default_state:"BUNDLED", risk_class:"MEMORY",
      required_by:workers.map((worker)=>worker.id), optional_for:[], platforms:["windows","linux","macos"],
      install_method:"built into memory policy and reflective-learning skill", verification_method:"memory policy tests",
      artifact_ref:"config/memory-policy.json",
    },
    {
      id:"adapter.runtime-readonly", kind:"adapter",
      description:"Read-only runtime adapter contract for local runtimes without granting write or dispatch authority.",
      source_refs:[projectSource()], usage_mode:"original", default_state:"BUNDLED", risk_class:"READ_ONLY",
      required_by:[], optional_for:workers.map((worker)=>worker.id), platforms:["windows","linux","macos"],
      install_method:"bundled package", verification_method:"runtime-adapter positive/negative/timeout tests",
      artifact_ref:"packages/runtime-adapter/index.mjs",
    }
  );

  const gemini = sourceById.get("gemini-cli");
  if (gemini) {
    capabilities.push(
      {
        id:"reference.gemini-cli-extension", kind:"extension",
        description:"Reference architecture for packaging skills, MCP servers, hooks, and sub-agents as a host extension.",
        source_refs:[sourceRef(gemini)], usage_mode:"reference-only", default_state:"REFERENCE_ONLY", risk_class:"PROCEDURAL",
        required_by:[], optional_for:["bimo"], platforms:["unspecified"],
        install_method:"reference-only; not installed by nyobakantorai", verification_method:"architecture review only; no runtime compatibility claim",
        artifact_ref:"config/upstream-sources.json",
      },
      {
        id:"reference.gemini-cli-hooks", kind:"hook",
        description:"Reference lifecycle-hook patterns for future pre/post tool policy enforcement.",
        source_refs:[sourceRef(gemini)], usage_mode:"reference-only", default_state:"REFERENCE_ONLY", risk_class:"PROCEDURAL",
        required_by:[], optional_for:["bimo","siti"], platforms:["unspecified"],
        install_method:"reference-only; not installed by nyobakantorai", verification_method:"architecture review only; no runtime hook claim",
        artifact_ref:"config/upstream-sources.json",
      }
    );
  }

  return {
    schema:1,
    generated:true,
    generated_from:[
      "config/capability-taxonomy.json",
      "config/employees.json",
      "config/capabilities.json",
      "config/integrations.json",
      "config/upstream-sources.json",
      "config/skill-provenance.json",
      "skills/hermes-custom/*/SKILL.md"
    ],
    taxonomy:{
      kinds:[...KINDS],
      usage_modes:[...taxonomy.usage_modes],
      default_states:[...DEFAULT_STATES],
      risk_classes:[...RISK_CLASSES],
      platforms:[...PLATFORMS],
    },
    capabilities:capabilities.sort((a,b)=>a.id.localeCompare(b.id)),
  };
}

export function validateCapabilityCatalog(catalog, { employees, sources, runtime, integrations } = {}) {
  const errors=[];
  if (catalog?.schema !== 1 || !Array.isArray(catalog?.capabilities)) errors.push("catalog schema/capabilities invalid");
  const ids=new Set();
  const workerIds=new Set(employees?.employees?.map((item)=>item.id) || []);
  const sourceById=new Map(sources?.sources?.map((item)=>[item.id,item]) || []);
  for (const item of catalog?.capabilities || []) {
    if (!item.id || ids.has(item.id)) errors.push(`duplicate/empty capability id: ${item.id}`);
    ids.add(item.id);
    if (!KINDS.includes(item.kind)) errors.push(`${item.id}: invalid kind ${item.kind}`);
    if (!taxonomy.usage_modes.includes(item.usage_mode)) errors.push(`${item.id}: invalid usage_mode ${item.usage_mode}`);
    if (!DEFAULT_STATES.includes(item.default_state)) errors.push(`${item.id}: invalid default_state ${item.default_state}`);
    if (!RISK_CLASSES.includes(item.risk_class)) errors.push(`${item.id}: invalid risk_class ${item.risk_class}`);
    if (!Array.isArray(item.platforms) || !item.platforms.length || item.platforms.some((p)=>!PLATFORMS.includes(p))) errors.push(`${item.id}: invalid platforms`);
    if (!Array.isArray(item.source_refs) || !item.source_refs.length) errors.push(`${item.id}: source_refs required`);
    for (const ref of item.source_refs || []) {
      if (ref.source_id === "project:nyobakantorai") {
        if (ref.license !== "MIT") errors.push(`${item.id}: project source license must be MIT`);
        continue;
      }
      const source=sourceById.get(ref.source_id);
      if (!source) errors.push(`${item.id}: unknown source ${ref.source_id}`);
      else {
        if (source.commit !== ref.source_commit) errors.push(`${item.id}: source commit drift for ${ref.source_id}`);
        if (source.license !== ref.license) errors.push(`${item.id}: source license drift for ${ref.source_id}`);
        if (source.usage_mode === "excluded-from-copy-or-derivation" && item.usage_mode !== "reference-only") errors.push(`${item.id}: excluded source cannot be derived`);
      }
    }
    for (const worker of [...(item.required_by || []), ...(item.optional_for || [])]) {
      if (!workerIds.has(worker)) errors.push(`${item.id}: unknown worker ${worker}`);
    }
    if (!item.verification_method) errors.push(`${item.id}: verification_method required`);
    if (!item.install_method) errors.push(`${item.id}: install_method required`);
    if (["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"].includes(item.risk_class) && item.default_state === "BUNDLED") errors.push(`${item.id}: unsafe capability cannot default BUNDLED`);
  }

  const skillIds=new Set((catalog?.capabilities || []).filter((x)=>x.kind==="skill").map((x)=>x.id.replace(/^skill\./,"")));
  for (const worker of employees?.employees || []) for (const skill of worker.skills || []) if(!skillIds.has(skill)) errors.push(`${worker.id}: missing catalog skill ${skill}`);
  const runtimeIds=new Set((catalog?.capabilities || []).filter((x)=>x.artifact_ref==="config/capabilities.json").map((x)=>x.id));
  for (const item of runtime?.capabilities || []) if(!runtimeIds.has(item.id)) errors.push(`missing runtime contract ${item.id}`);
  const integrationIds=new Set((catalog?.capabilities || []).filter((x)=>x.id.startsWith("integration.")).map((x)=>x.id.slice("integration.".length)));
  for (const item of integrations?.integrations || []) if(!integrationIds.has(item.id)) errors.push(`missing integration contract ${item.id}`);
  return errors;
}

async function main() {
  const check=process.argv.includes("--check");
  const [employees,sources,runtime,integrations]=await Promise.all([
    readJson("config/employees.json"), readJson("config/upstream-sources.json"), readJson("config/capabilities.json"), readJson("config/integrations.json")
  ]);
  const generated=await buildCapabilityCatalog();
  const errors=validateCapabilityCatalog(generated,{employees,sources,runtime,integrations});
  if(errors.length){ console.error(errors.join("\n")); process.exit(1); }
  const rendered=JSON.stringify(generated,null,2)+"\n";
  if(check){
    const current=await readFile(outputPath,"utf8").catch(()=>null);
    if(current!==rendered){ console.error("Capability catalog drift detected. Run npm run capability-catalog:generate."); process.exit(1); }
    console.log(`Capability catalog check passed for ${generated.capabilities.length} entries.`);
    return;
  }
  await writeFile(outputPath,rendered);
  console.log(`Wrote ${generated.capabilities.length} capability catalog entries.`);
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch((error)=>{console.error(error.stack||error.message);process.exit(1)});
}
