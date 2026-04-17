#!/usr/bin/env bash
# Local sanity check before a deploy. Does not touch remote resources.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$*"; exit 1; }

echo "[1/4] Repo layout"
for p in apps-script/appsscript.json apps-script/Config.gs apps-script/Webhook.gs \
         apps-script/Extractor.gs apps-script/Writer.gs apps-script/Ingress.gs \
         apps-script/Triage.gs apps-script/Hmac.gs apps-script/Dedup.gs \
         apps-script/Setup.gs android/app/build.gradle.kts \
         android/app/src/main/AndroidManifest.xml docs/SETUP.md docs/PRIVACY.md; do
  [[ -f "$p" ]] && ok "$p" || fail "missing: $p"
done

echo "[2/4] Secrets not committed"
if grep -RnE 'HMAC_SECRET\s*=\s*"[^"]+"' apps-script 2>/dev/null | grep -v 'HMAC_SECRET not set'; then
  fail "looks like a hardcoded HMAC secret landed in apps-script/"
else
  ok "no hardcoded HMAC_SECRET found"
fi
if grep -RnE 'GCP_PROJECT_ID:\s*'"'"'[a-z0-9][a-z0-9-]+'"'"'' apps-script/Config.gs 2>/dev/null; then
  warn "GCP_PROJECT_ID is filled in Config.gs; make sure you actually want to commit this"
else
  ok "GCP_PROJECT_ID placeholder still empty"
fi

echo "[3/4] clasp status"
if command -v clasp >/dev/null; then
  (cd apps-script && clasp status 2>/dev/null || warn "clasp not initialized in apps-script/ (run clasp create)")
else
  warn "clasp not installed; skipping"
fi

echo "[4/4] Android lint (if gradle wrapper present)"
if [[ -x android/gradlew ]]; then
  (cd android && ./gradlew :app:lint)
else
  warn "android/gradlew not present; open the project in Android Studio to generate the wrapper"
fi

echo
echo "Manual end-to-end checklist:"
echo "  [ ] Setup.bootstrap printed a fresh HMAC secret"
echo "  [ ] clasp deploy returned an /exec URL"
echo "  [ ] Android 'Send test event' returns code=200"
echo "  [ ] Test WhatsApp message produces a task within 10s"
echo "  [ ] Test Gmail message produces a task within 5-6m"
