import { resolveHermesHome } from "./hermes-home.mjs";
import { createHermesRuntimeAdapter } from "./hermes-runtime-adapter.mjs";

export function createConfiguredRuntimeProvider({
  env = process.env,
  employeeIds = [],
  board = env.NYOBAKANTORAI_BOARD || "nyobakantorai",
  existsImpl,
  execFileImpl,
} = {}) {
  const executable = env.NYOBAKANTORAI_HERMES_EXE || env.HERMES_EXE || "hermes";
  const disabled = /^(1|true|yes)$/i.test(env.NYOBAKANTORAI_DISABLE_HERMES || "");
  const hermesHome = disabled ? "" : resolveHermesHome({ env, exists:existsImpl });
  const implementation = createHermesRuntimeAdapter({
    executable,
    hermesHome,
    board,
    employeeIds,
    disabled,
    ...(execFileImpl ? { execFileImpl } : {}),
    ...(existsImpl ? { existsImpl } : {}),
  });

  return Object.freeze({
    provider_id:"hermes",
    configured:implementation.configured,
    adapter:implementation.adapter,
    employeeSnapshot:() => implementation.employeeSnapshot(),
    runtimeSnapshot:(options) => implementation.runtimeSnapshot(options),
    async describe(knownVersion = null) {
      const descriptor = await implementation.describe(knownVersion);
      return Object.freeze({
        provider_id:"hermes",
        configured:descriptor.configured,
        installed:descriptor.installed,
        version:descriptor.version,
        resource:descriptor.board,
      });
    },
  });
}
