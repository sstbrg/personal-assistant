// Apps Script doPost cannot read arbitrary HTTP headers.
// Signature travels inside the JSON body as `sig` (hex of HMAC-SHA256 over the
// canonical JSON of `data` plus `ts` and `nonce`). See Hmac.gs and Android ApiClient.

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return _json({ ok: false, error: 'empty_body' });
    }
    const body = e.postData.contents;
    const payload = JSON.parse(body);

    if (payload.v !== 1) return _json({ ok: false, error: 'bad_version' });
    if (!payload.sig || !payload.nonce || !payload.ts || !payload.data) {
      return _json({ ok: false, error: 'missing_fields' });
    }

    // Replay window: ±5 minutes.
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - Number(payload.ts)) > 300) {
      return _json({ ok: false, error: 'stale_ts' });
    }

    const signingBase = _canonicalSigningBase(payload);
    if (!Hmac.verify(signingBase, payload.sig)) {
      return _json({ ok: false, error: 'bad_sig' });
    }

    if (Dedup.seen('wa:' + payload.nonce)) {
      return _json({ ok: true, dedup: true });
    }
    Dedup.mark('wa:' + payload.nonce);

    const items = Extractor.extractFromWhatsApp(payload.data);
    const written = Writer.writeAll(items, { source: 'whatsapp', sourceRef: payload.data.chat });
    return _json({ ok: true, count: written });
  } catch (err) {
    console.error('doPost error: ' + err + '\n' + (err && err.stack));
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return _json({ ok: true, service: 'private-ai-automator', v: 1 });
}

// Canonical string the Android client signs: v|ts|nonce|source|<json(data) with sorted keys>
function _canonicalSigningBase(p) {
  return [p.v, p.ts, p.nonce, p.source, _stableStringify(p.data)].join('|');
}

function _stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(_stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + _stableStringify(obj[k])).join(',') + '}';
}
