// Cross-language parity test.
//
// The Android client (Kotlin) and the Apps Script server (GAS/V8) must produce
// bit-identical HMAC signatures over the same payload. This test:
//   1. Evals Apps Script source in a sandboxed VM (since it's just V8 JS),
//   2. Runs _stableStringify and _canonicalSigningBase on a fixed vector,
//   3. Computes HMAC-SHA256 via node's crypto,
//   4. Asserts the hex matches the same constant used in the Kotlin unit test
//      (android/app/src/test/kotlin/.../SigningTest.kt).
//
// Run: node --test tests/signing-parity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

// Shared test vector. Keep in sync with SigningTest.kt.
const VECTOR = {
  v: 1,
  ts: 1713367200,
  nonce: 'test-nonce-1',
  source: 'whatsapp',
  data: {
    body: 'hello',
    chat: 'Test',
    is_group: false,
    received_at: '2026-04-17T14:00:00+03:00',
    sender: 'Alice',
  },
};

const SECRET = 'testsecret';
const EXPECTED_CANONICAL =
  '{"body":"hello","chat":"Test","is_group":false,"received_at":"2026-04-17T14:00:00+03:00","sender":"Alice"}';
const EXPECTED_SIGNING_BASE =
  '1|1713367200|test-nonce-1|whatsapp|' + EXPECTED_CANONICAL;
const EXPECTED_HEX =
  'a4d46cb36ea3cc707b9ea41382133905d55c52ca519bc44ff913911352a04fdf';

function loadAppsScriptSandbox() {
  // Apps Script .gs files are V8 JavaScript with a handful of Google globals.
  // Stub just enough of them to run the pure functions we care about.
  const stubs = {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'HMAC_SECRET' ? SECRET : null),
        setProperty: () => {},
        deleteProperty: () => {},
      }),
    },
    Utilities: {
      computeHmacSha256Signature: (msg, key) => {
        const buf = crypto.createHmac('sha256', String(key))
          .update(String(msg), 'utf8').digest();
        // Apps Script returns signed-byte array; mimic that shape.
        return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
      },
    },
  };
  const ctx = vm.createContext(stubs);
  for (const f of ['Config.gs', 'Hmac.gs', 'Webhook.gs']) {
    const src = fs.readFileSync(path.join(REPO, 'apps-script', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx;
}

test('GAS _stableStringify produces expected canonical JSON', () => {
  const ctx = loadAppsScriptSandbox();
  const canonical = vm.runInContext('_stableStringify(' + JSON.stringify(VECTOR.data) + ')', ctx);
  assert.equal(canonical, EXPECTED_CANONICAL);
});

test('GAS _stableStringify is order-independent', () => {
  const ctx = loadAppsScriptSandbox();
  const a = vm.runInContext('_stableStringify({b:1,a:2,c:3})', ctx);
  const b = vm.runInContext('_stableStringify({a:2,b:1,c:3})', ctx);
  const c = vm.runInContext('_stableStringify({c:3,a:2,b:1})', ctx);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a, '{"a":2,"b":1,"c":3}');
});

test('GAS _canonicalSigningBase matches expected string', () => {
  const ctx = loadAppsScriptSandbox();
  const base = vm.runInContext(
    '_canonicalSigningBase(' + JSON.stringify(VECTOR) + ')',
    ctx
  );
  assert.equal(base, EXPECTED_SIGNING_BASE);
});

test('GAS Hmac.sign returns expected hex for reference vector', () => {
  const ctx = loadAppsScriptSandbox();
  const hex = vm.runInContext('Hmac.sign(' + JSON.stringify(EXPECTED_SIGNING_BASE) + ')', ctx);
  assert.equal(hex, EXPECTED_HEX);
});

test('GAS Hmac.verify accepts matching signature and rejects mismatched', () => {
  const ctx = loadAppsScriptSandbox();
  const good = vm.runInContext(
    'Hmac.verify(' + JSON.stringify(EXPECTED_SIGNING_BASE) + ', ' + JSON.stringify(EXPECTED_HEX) + ')',
    ctx
  );
  const bad = vm.runInContext(
    'Hmac.verify(' + JSON.stringify(EXPECTED_SIGNING_BASE) + ', ' + JSON.stringify('0'.repeat(64)) + ')',
    ctx
  );
  const prefixed = vm.runInContext(
    'Hmac.verify(' + JSON.stringify(EXPECTED_SIGNING_BASE) + ', ' + JSON.stringify('sha256=' + EXPECTED_HEX) + ')',
    ctx
  );
  assert.equal(good, true);
  assert.equal(bad, false);
  assert.equal(prefixed, true);
});

test('Node-crypto reference matches baked-in expected hex (guards fixture)', () => {
  const hex = crypto.createHmac('sha256', SECRET).update(EXPECTED_SIGNING_BASE).digest('hex');
  assert.equal(hex, EXPECTED_HEX);
});
