const DEDUP_PROP = 'DEDUP_MAP';
const DEDUP_LOCK_TIMEOUT_MS = 5000;

const Dedup = {
  _load() {
    const raw = PropertiesService.getScriptProperties().getProperty(DEDUP_PROP);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  },

  _save(map) {
    PropertiesService.getScriptProperties().setProperty(DEDUP_PROP, JSON.stringify(map));
  },

  // Apps Script executes Web App requests concurrently. Load-modify-save on
  // ScriptProperties without a lock means two simultaneous posts can both read
  // the same map, both write, and one loses its mark — allowing a duplicate
  // to slip through. Serialize every access through the script lock.
  _withLock(fn) {
    const lock = LockService.getScriptLock();
    lock.waitLock(DEDUP_LOCK_TIMEOUT_MS);
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  },

  seen(key) {
    if (!key) return false;
    return this._withLock(() => {
      const map = this._load();
      return Object.prototype.hasOwnProperty.call(map, key);
    });
  },

  mark(key) {
    if (!key) return;
    this._withLock(() => {
      const map = this._load();
      map[key] = Math.floor(Date.now() / 1000);
      this._save(map);
    });
  },

  sweep() {
    return this._withLock(() => {
      const cutoff = Math.floor(Date.now() / 1000) - CONFIG.DEDUP_TTL_DAYS * 86400;
      const map = this._load();
      let removed = 0;
      for (const k of Object.keys(map)) {
        if (map[k] < cutoff) { delete map[k]; removed++; }
      }
      this._save(map);
      return removed;
    });
  },
};
