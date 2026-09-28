export const USER_OWNED_HERMES_STATE = Object.freeze([".env","auth.json","memories/","sessions/","state.db*","logs/","workspace/","plans/","home/","*_cache/","local/"]);
export function planProfileAction({ mode="install", exists=false, force=false } = {}) {
  if (mode === "check") return "check";
  if (force) return "force-install";
  if (!exists) return "install";
  if (mode === "upgrade") return "upgrade-distribution";
  if (mode === "update") return "native-update";
  return "skip-existing";
}
