const DEDUP_PROP = 'DEDUP_MAP';

const Dedup = {
  _load() {
    const raw = PropertiesService.getScriptProperties().getProperty(DEDUP_PROP);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  },

  _save(map) {
    PropertiesService.getScriptProperties().setProperty(DEDUP_PROP, JSON.stringify(map));
  },

  seen(key) {
    if (!key) return false;
    const map = this._load();
    return Object.prototype.hasOwnProperty.call(map, key);
  },

  mark(key) {
    if (!key) return;
    const map = this._load();
    map[key] = Math.floor(Date.now() / 1000);
    this._save(map);
  },

  sweep() {
    const cutoff = Math.floor(Date.now() / 1000) - CONFIG.DEDUP_TTL_DAYS * 86400;
    const map = this._load();
    let removed = 0;
    for (const k of Object.keys(map)) {
      if (map[k] < cutoff) { delete map[k]; removed++; }
    }
    this._save(map);
    return removed;
  },
};
