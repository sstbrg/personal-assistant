# Private AI Automator

A personal AI assistant that turns WhatsApp messages, Gmail, and Google Calendar
activity into Google Tasks and Calendar events, running end-to-end inside the
user's own Google identity. No third-party data exposure, no rented infra.

- Full spec: [DESIGN.md](./DESIGN.md)
- Setup guide: [docs/SETUP.md](./docs/SETUP.md)
- Privacy audit: [docs/PRIVACY.md](./docs/PRIVACY.md)
- Troubleshooting: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

## Architecture

- **Android app** — a `NotificationListenerService` that captures WhatsApp
  notifications and forwards HMAC-signed payloads to the user's Apps Script.
- **Apps Script Web App** — runs as the user, polls Gmail and Calendar,
  calls Vertex AI with a strict JSON schema, and writes to Tasks/Calendar.
- **Vertex AI (user's own GCP project)** — `gemini-2.5-flash-lite` with
  `responseSchema` for deterministic structured output.

## Build

- `apps-script/` — deployed via [`clasp`](https://github.com/google/clasp).
- `android/` — open in Android Studio, build a debug APK, sideload.
