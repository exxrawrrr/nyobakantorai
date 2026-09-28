// Read-only Hermes snapshot cache: short bounded freshness and in-flight coalescing.
// Failed/incomplete reads NEVER serve an expired successful snapshot.
export function createRuntimeSnapshotCache(load, {
  ttlMs = 1500, now = () => Date.now(), cacheable = () => true,
} = {}) {
  if (typeof load !== "function" || !Number.isInteger(ttlMs) || ttlMs < 0 || ttlMs > 10000)
    throw new TypeError("Invalid runtime cache configuration");
  let last = null;
  let inFlight = null;
  return async function readRuntime() {
    const tick = now();
    if (last && tick >= last.at && tick - last.at < ttlMs)
      return { snapshot: last.data, source: "BOUNDED_CACHE", age_ms: tick - last.at };
    if (inFlight) {
      const snapshot = await inFlight;
      return { snapshot, source: "JOINED_REFRESH", age_ms: 0 };
    }
    const work = (async () => {
      const snapshot = await load();
      last = cacheable(snapshot) ? { data: snapshot, at: now() } : null;
      return snapshot;
    })();
    inFlight = work;
    try {
      const snapshot = await work;
      return { snapshot, source: "LIVE_REFRESH", age_ms: 0 };
    } finally {
      if (inFlight === work) inFlight = null;
    }
  };
}
