export function createCache(ttlMs, max = 200) {
  const store = new Map();
  const inflight = new Map();

  function get(key) {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) { store.delete(key); return undefined; }
    return hit.value;
  }

  function set(key, value) {
    store.delete(key);
    store.set(key, { value, expires: Date.now() + ttlMs });
    while (store.size > max) store.delete(store.keys().next().value);
  }

  async function wrap(key, fn) {
    const cached = get(key);
    if (cached !== undefined) return cached;
    if (inflight.has(key)) return inflight.get(key);
    const promise = (async () => {
      try {
        const value = await fn();
        set(key, value);
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }

  return { get, set, wrap };
}
