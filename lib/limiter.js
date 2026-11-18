// Counts wrong tries (wrong passwords, wrong booking codes) and locks that person out for a while.
export function makeLimiter({ max = 5, lockSeconds = 60, now = () => Date.now() } = {}) {
  const tries = new Map();                                   // key -> { fails, until }
  return {
    // seconds left on the lock (0 = free to try)
    wait(key) { const t = tries.get(key); return t && now() < t.until ? Math.ceil((t.until - now()) / 1000) : 0; },
    fail(key) {
      const t = tries.get(key) || { fails: 0, until: 0 };
      t.fails++;
      if (t.fails >= max) { t.until = now() + lockSeconds * 1000; t.fails = 0; }
      tries.set(key, t);
    },
    ok(key) { tries.delete(key); }
  };
}
