export const USER_OWNED_HERMES_STATE = Object.freeze([".env","auth.json","memories/","sessions/","state.db*","logs/","workspace/","plans/","home/","*_cache/","local/"]);
export function planProfileAction({ mode="install", exists=false, force=false } = {}) {
  if (mode === "check") return "check";
  if (force) return "force-install";
  if (!exists) return "install";
  if (mode === "upgrade") return "native-upgrade";
  if (mode === "update") return "native-update";
  return "skip-existing";
}

export function bootstrapSucceeded({ results = [], profiles = [], boardOk = false, mode = "install" } = {}) {
  const actionsOk = results.every((item) => item?.ok === true);
  const profilesOk = profiles.every((item) => item?.ok === true);
  const boardReady = mode === "check" ? true : boardOk === true;
  return actionsOk && profilesOk && boardReady;
}


export function planSelectedProfileActions({ selectedIds = [], existingIds = [], mode = "install", force = false } = {}) {
  const selected = [...new Set(selectedIds.map((id) => String(id).trim()).filter(Boolean))];
  const existing = new Set(existingIds.map((id) => String(id).trim()).filter(Boolean));
  return Object.freeze(selected.map((id) => Object.freeze({
    profile: id,
    action: planProfileAction({ mode, exists: existing.has(id), force }),
  })));
}
