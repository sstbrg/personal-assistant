# CLAUDE.md

Repo-specific context for Claude Code. See `DESIGN.md` for the full spec.

## What this is

A personal AI assistant that turns WhatsApp notifications, Gmail, and Google
Calendar activity into Google Tasks and Calendar events. Single-tenant, runs
entirely inside the user's own Google/GCP account — no third-party operator
in the message-content path.

## Repo layout

- `apps-script/` — Apps Script Web App (V8). Pushed via `clasp`.
  - `Webhook.gs` is the entry point (`doPost`) for WhatsApp forwards.
  - `Ingress.gs` has the time-triggered `pollGmail` / `pollCalendar`.
  - `Extractor.gs` wraps Vertex AI (`gemini-2.5-flash-lite`) with a strict
    `responseSchema`.
  - `Writer.gs` routes extracted items to Tasks / Calendar.
  - `Setup.gs` is human-invoked from the Apps Script editor to mint the
    HMAC secret and install triggers.
- `android/` — Android app. Open in Android Studio; no wrapper committed.
  - `WhatsAppListenerService` captures WhatsApp notifications.
  - `ForwardingService` drains the Room queue and HMAC-signs each payload.
  - `ApiClient` + `SigningUtil` build the signed envelope.
  - `MainActivity` is the one-screen config UI.
- `tests/signing-parity.test.mjs` — Node cross-language guardrail (see below).
- `.github/workflows/ci.yml` — Node parity + Kotlin unit tests + verify.sh.

## Branching model

- `develop` is the integration branch.
- Work goes on `bugfix/<slug>` or `chore/<slug>` or `feature/<slug>`,
  forked from `develop`.
- Each branch is its own PR. PRs target `develop`.
- Do NOT push to `main` directly. Do NOT merge without the user's approval.

## Signing parity — the core invariant

The Android client and the Apps Script server must produce bit-identical
HMAC-SHA256 signatures over the same payload. The signing base is:

```
v | ts | nonce | source | canonical_json(data)
```

…joined with the literal `|` character. `canonical_json` is sorted-key,
no-whitespace JSON, implemented on both sides:

- Kotlin: `ApiClient.Companion.stableStringify`
- JS: `Webhook.gs :: _stableStringify`

**Hard rules, enforced by `tests/signing-parity.test.mjs`:**

1. Both stringifiers must emit identical output for the same input.
2. HMAC-SHA256 of the signing base must equal the baked-in reference hex
   (`a4d46cb3…`) for the fixed test vector.
3. **No floats or doubles in payload `data`.** Kotlin's `Double.toString`
   emits `"1.5E100"`; JS's `JSON.stringify` emits `"1.5e+100"` for the same
   value. Signatures would diverge silently. Keep numeric fields integral.

If you add a field to the payload, the parity test must still pass. If it
doesn't, the client and server disagree on the signing string — fix one
side to match the other, don't suppress the test.

## Security model

- **HMAC_SECRET** lives in Apps Script `PropertiesService` (server-side) and
  Android `EncryptedSharedPreferences` (client-side). Never committed.
  Minted by `Setup.bootstrap()` on first run. Rotate via `Setup.rotateSecret()`.
- **GCP_PROJECT_ID** is filled into `Config.gs` by the user post-clone.
  `verify.sh` guards against committing a real value.
- **Apps Script Web App** is `ANYONE_ANONYMOUS`-accessible because the
  Android client can't mint a Google token; every request is authenticated
  by HMAC + ±5 min timestamp + nonce dedup. Never relax this to `ANYONE`
  without HMAC.
- **Apps Script → Vertex AI** uses `ScriptApp.getOAuthToken()` — no service
  account JSON key exists anywhere on disk.
- **Vertex AI enterprise ToS** is the reason we use Vertex and not the
  public Gemini API; don't switch vendors without re-reading
  `docs/PRIVACY.md`.

## Apps Script quirks worth remembering

- `doPost` **cannot read HTTP headers**, only the JSON body. The signature
  therefore travels in the JSON envelope as `sig`, not as an
  `X-Signature` header.
- `ContentService.createTextOutput` **cannot set HTTP status codes**.
  Every response is wire-level 200. The client checks `body.ok === true`,
  not `resp.isSuccessful` alone (see PR #1).
- `ScriptProperties` has a 500 KB cap and concurrent access races. All
  Dedup reads/writes are serialized through `LockService.getScriptLock()`
  (see PR #5).
- Triggers are installed by `Setup.installTriggers()`, not by manifest.
- The Web App URL changes when you deploy; re-deploying with `clasp deploy`
  creates a new URL by default. Use the editor's "Manage deployments" UI
  (or `clasp deploy -i <deploymentId>`) to update an existing deployment
  in place.

## Android quirks worth remembering

- `NotificationListenerService` callbacks run on the main thread. Do the
  minimum synchronous work possible (filter + enqueue), then return.
- On API 26+, background `startService` calls to a foreground-service class
  must go through `ContextCompat.startForegroundService` (see PR #3).
- `onCreate` in `ForwardingService` **must** call `startForeground(...)`
  within 5 seconds of the service being started.
- `EncryptedSharedPreferences` requires user-unlock (keystore is FBE-locked
  pre-unlock), so `BootReceiver` can't read it until `BOOT_COMPLETED`
  (not `LOCKED_BOOT_COMPLETED`).
- `POST_NOTIFICATIONS` is runtime-requested on API 33+; don't start a
  foreground service before the grant result is known (see PR #7).
- The persistent "Service enabled" pref (`SettingsRepository.serviceEnabled`)
  gates the listener's start call. Stop button must flip it false or the
  next incoming notification will re-launch the service (see PR #6).

## Deploy path (human-in-loop, not automated)

1. GCP project creation + billing + `aiplatform.googleapis.com` enable.
2. `clasp create --type webapp` + link the GCP project number in the
   Apps Script editor (Project Settings).
3. Run `Setup.bootstrap()` once from the editor — grants OAuth consent,
   mints HMAC secret, installs triggers.
4. `clasp deploy --description ...` for the `/exec` URL.
5. Android Studio → build debug APK → sideload → grant Notification
   Access → paste URL + secret.

Full walkthrough in `docs/SETUP.md`. Do not try to automate the OAuth or
Notification Access steps; Google requires a human click-through.

## Testing

- `tests/signing-parity.test.mjs` — Node 20, no deps, loads `*.gs` files
  in a sandboxed VM. Run: `node --test tests/signing-parity.test.mjs`.
- `android/app/src/test/kotlin/` — pure-JVM unit tests, no Android SDK
  needed at test time (the main source set still needs SDK to compile).
  `hmacSha256Hex` lives in `SigningUtil` (not `ApiClient`) so the test
  has no OkHttp / org.json deps.
- CI runs both on every push. `gradle :app:testDebugUnitTest` needs
  Android SDK + JDK 17; CI uses `android-actions/setup-android@v3` +
  `setup-gradle@v4` with gradle 8.9.

## When editing the payload or signing logic

Every change must pass `node --test tests/signing-parity.test.mjs` locally
before pushing. If the reference hex changes legitimately (new field in the
test vector), regenerate it with the one-liner in the test file and update
both the Kotlin and Node reference constants in one commit.

## Things not to do

- Don't add analytics, crash reporting, or any "helpful" SDK to the Android
  app — the whole point is that nothing leaves the user's tenant.
- Don't commit the GCP project ID or HMAC secret. `verify.sh` greps for
  them; CI runs `verify.sh`.
- Don't log message content by default. `CONFIG.LOG_CONTENT = false` is the
  production setting; flip only for debugging and flip back.
- Don't bypass `LockService` in `Dedup` — the race has teeth under
  concurrent `doPost` retries.
- Don't switch from Vertex AI to the public Gemini API; the enterprise ToS
  is the reason this architecture exists.
