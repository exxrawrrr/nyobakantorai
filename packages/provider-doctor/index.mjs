import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const requireFromHere = createRequire(import.meta.url);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

export function validateProviderCatalog(catalog) {
  const errors=[];
  if (catalog?.schema !== 1) errors.push("catalog schema must be 1");
  if (!catalog?.statuses || typeof catalog.statuses !== "object") errors.push("catalog statuses required");
  if (!Array.isArray(catalog?.providers) || !catalog.providers.length) errors.push("catalog providers must be a non-empty array");
  const providers=Array.isArray(catalog?.providers)?catalog.providers:[];
  const ids=new Set();
  const arrayFields=["commands","python_modules","node_modules","paths","on_demand_commands","env_any"];
  const allowedConfigRequirements=new Set(["none","external-or-oauth","provider"]);

  for (const provider of providers) {
    if (!nonEmpty(provider?.id) || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(provider.id)) {
      errors.push("provider id must be a safe lowercase identifier");
      continue;
    }
    if (ids.has(provider.id)) errors.push(`duplicate provider id ${provider.id}`);
    ids.add(provider.id);
    if (!nonEmpty(provider.label)) errors.push(`${provider.id}: label required`);
    if (!nonEmpty(provider.category)) errors.push(`${provider.id}: category required`);
    if (!catalog?.statuses?.support?.includes(provider.support_state)) errors.push(`${provider.id}: invalid support_state`);
    if (!provider.detection || typeof provider.detection !== "object" || Array.isArray(provider.detection)) {
      errors.push(`${provider.id}: detection object required`);
      continue;
    }
    for (const field of arrayFields) {
      const value=provider.detection[field];
      if (value === undefined) continue;
      if (!Array.isArray(value) || value.some((item)=>!nonEmpty(item))) errors.push(`${provider.id}: detection.${field} must contain non-empty strings`);
      if (Array.isArray(value) && new Set(value).size !== value.length) errors.push(`${provider.id}: detection.${field} contains duplicates`);
    }
    const requirement=provider.detection.config_requirement || "external-or-oauth";
    if (!allowedConfigRequirements.has(requirement)) errors.push(`${provider.id}: invalid config_requirement`);
    for (const name of provider.detection.env_any || []) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) errors.push(`${provider.id}: invalid environment signal name ${name}`);
    }
    if (!nonEmpty(provider.setup_hint)) errors.push(`${provider.id}: setup_hint required`);
    if (!nonEmpty(provider.self_test_hint)) errors.push(`${provider.id}: self_test_hint required`);
  }
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),providers:providers.length});
}

function executableCandidates(command, platform, env) {
  if (platform !== "win32") return [command];
  if (extname(command)) return [command];
  const pathExt = (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [command, ...pathExt.map((suffix) => command + suffix.toLowerCase()), ...pathExt.map((suffix) => command + suffix.toUpperCase())];
}

export function findExecutable(command, { env = process.env, platform = process.platform } = {}) {
  if (!nonEmpty(command)) return null;
  const pathValue = env.PATH || env.Path || env.path || "";
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const candidate of executableCandidates(command, platform, env)) {
      const full = resolve(directory, candidate);
      try {
        accessSync(full, platform === "win32" ? constants.F_OK : constants.X_OK);
        return full;
      } catch {}
    }
  }
  return null;
}

export function pythonModuleAvailable(moduleName, { env = process.env, platform = process.platform } = {}) {
  const candidates = platform === "win32" ? [["python",[]],["py",["-3"]]] : [["python3",[]],["python",[]]];
  for (const [command,prefix] of candidates) {
    if (!findExecutable(command,{env,platform})) continue;
    const script = `import importlib.util; raise SystemExit(0 if importlib.util.find_spec(${JSON.stringify(moduleName)}) else 3)`;
    const result = spawnSync(command,[...prefix,"-c",script],{encoding:"utf8",windowsHide:true,env});
    if (result.status === 0) return true;
  }
  return false;
}

export function nodeModuleAvailable(moduleName, { root = process.cwd() } = {}) {
  try {
    const localRequire = createRequire(join(resolve(root), "package.json"));
    localRequire.resolve(`${moduleName}/package.json`);
    return true;
  } catch {
    try { requireFromHere.resolve(`${moduleName}/package.json`); return true; }
    catch { return false; }
  }
}

export function inspectProvider(provider, {
  env = process.env,
  platform = process.platform,
  root = process.cwd(),
  probes = {},
} = {}) {
  const findCommand = probes.findExecutable || ((command) => findExecutable(command,{env,platform}));
  const pythonProbe = probes.pythonModuleAvailable || ((name) => pythonModuleAvailable(name,{env,platform}));
  const nodeProbe = probes.nodeModuleAvailable || ((name) => nodeModuleAvailable(name,{root}));
  const pathProbe = probes.pathExists || existsSync;

  const detection = provider.detection || {};
  const foundCommands = (detection.commands || []).filter((command) => Boolean(findCommand(command)));
  const foundPythonModules = (detection.python_modules || []).filter((name) => pythonProbe(name));
  const foundNodeModules = (detection.node_modules || []).filter((name) => nodeProbe(name));
  const foundPaths = (detection.paths || []).filter((path) => pathProbe(path));
  const onDemandCommands = (detection.on_demand_commands || []).filter((command) => Boolean(findCommand(command)));
  const envSignals = (detection.env_any || []).filter((name) => nonEmpty(env[name]));

  const directlyInstalled = foundCommands.length > 0 || foundPythonModules.length > 0 || foundNodeModules.length > 0 || foundPaths.length > 0;
  const install_state = directlyInstalled ? "INSTALLED" : onDemandCommands.length ? "AVAILABLE_ON_DEMAND" : "NOT_INSTALLED";
  const configRequirement = detection.config_requirement || "external-or-oauth";
  const configuration_state = configRequirement === "none"
    ? "NOT_REQUIRED"
    : envSignals.length
      ? "CONFIG_SIGNAL_PRESENT"
      : "UNKNOWN";

  let readiness = "NEEDS_INSTALL";
  if (install_state === "AVAILABLE_ON_DEMAND" && configuration_state === "NOT_REQUIRED") readiness = "READY_FOR_SELF_TEST";
  else if (install_state === "INSTALLED" && configuration_state === "NOT_REQUIRED") readiness = "READY_FOR_SELF_TEST";
  else if (install_state === "INSTALLED" && configuration_state === "CONFIG_SIGNAL_PRESENT") readiness = "READY_FOR_SELF_TEST";
  else if (install_state === "INSTALLED") readiness = "NEEDS_AUTH_OR_CONFIG_CHECK";
  else if (install_state === "AVAILABLE_ON_DEMAND") readiness = "NEEDS_AUTH_OR_CONFIG_CHECK";

  return Object.freeze({
    id:provider.id,
    label:provider.label,
    category:provider.category,
    support_state:provider.support_state,
    install_state,
    configuration_state,
    self_test_state:"NOT_RUN",
    readiness,
    evidence:{
      command_detected:foundCommands.length > 0,
      python_module_detected:foundPythonModules.length > 0,
      node_module_detected:foundNodeModules.length > 0,
      path_detected:foundPaths.length > 0,
      on_demand_runtime_detected:onDemandCommands.length > 0,
      configuration_signal_count:envSignals.length,
    },
    setup_hint:provider.setup_hint,
    self_test_hint:provider.self_test_hint,
  });
}

export function inspectProviders({ catalog, selectedIds = null, env, platform, root, probes } = {}) {
  const catalogCheck=validateProviderCatalog(catalog);
  if (!catalogCheck.ok) throw new Error(`invalid provider doctor catalog: ${catalogCheck.errors.join("; ")}`);
  const allIds = new Set(catalog.providers.map((item) => item.id));
  const selected = selectedIds?.length ? selectedIds : catalog.providers.map((item) => item.id);
  const unknown = selected.filter((id) => !allIds.has(id));
  if (unknown.length) throw new Error(`unknown provider id(s): ${unknown.join(", ")}`);
  const providers = catalog.providers
    .filter((item) => selected.includes(item.id))
    .map((provider) => inspectProvider(provider,{env,platform,root,probes}));

  return Object.freeze({
    schema:1,
    generated_at:new Date().toISOString(),
    catalog_valid:true,
    side_effect_free:true,
    credentials_exposed:false,
    providers:Object.freeze(providers),
    summary:Object.freeze({
      total:providers.length,
      installed:providers.filter((item) => item.install_state === "INSTALLED").length,
      available_on_demand:providers.filter((item) => item.install_state === "AVAILABLE_ON_DEMAND").length,
      not_installed:providers.filter((item) => item.install_state === "NOT_INSTALLED").length,
      ready_for_self_test:providers.filter((item) => item.readiness === "READY_FOR_SELF_TEST").length,
      self_tests_run:0,
    }),
  });
}

export function evaluateRequirements(report, { requireInstalled = [], requireReady = [] } = {}) {
  const byId = new Map(report.providers.map((item) => [item.id,item]));
  const errors = [];
  for (const id of requireInstalled) {
    const item = byId.get(id);
    if (!item) errors.push(`${id}: not included in report`);
    else if (!["INSTALLED","AVAILABLE_ON_DEMAND"].includes(item.install_state)) errors.push(`${id}: provider is not installed or available on demand`);
  }
  for (const id of requireReady) {
    const item = byId.get(id);
    if (!item) errors.push(`${id}: not included in report`);
    else if (item.readiness !== "READY_FOR_SELF_TEST") errors.push(`${id}: not ready for self-test (${item.readiness})`);
  }
  return Object.freeze({ ok:errors.length === 0, errors:Object.freeze(errors) });
}
