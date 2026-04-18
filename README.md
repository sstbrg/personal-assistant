# Private AI Automator

A personal AI assistant that turns WhatsApp messages, Gmail, Google Calendar,
and Google Drive activity into Google Tasks and Calendar events, running
end-to-end inside the user's own Google identity. No third-party data exposure.

- Full spec: [DESIGN.md](./DESIGN.md)
- Setup guide: [docs/SETUP.md](./docs/SETUP.md)
- Privacy audit: [docs/PRIVACY.md](./docs/PRIVACY.md)
- Troubleshooting: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

## Architecture

- **OpenClaw gateway** — runs on a GCP free-tier e2-micro VM. Connects to
  WhatsApp (via Baileys/WhatsApp Web), Gmail (Pub/Sub), Google Calendar, and
  Google Drive. Provides two-way WhatsApp messaging including self-reminders.
- **Vertex AI (user's own GCP project)** — `gemini-2.5-flash-lite` with
  structured output for task/event extraction.
- **Google Tasks / Calendar** — output destinations, accessed via Google APIs.

### Legacy (phase 0)

The `apps-script/` and `android/` directories contain the original phase-0
implementation (Apps Script webhook + Android notification listener). This has
been superseded by the OpenClaw-based architecture above.

## Setup

1. GCP project with Vertex AI, Compute Engine, and Google APIs enabled.
2. Free-tier e2-micro VM running OpenClaw gateway as a systemd service.
3. `openclaw onboard` to configure WhatsApp, Gmail, Calendar, Drive channels.
4. Point OpenClaw at Vertex AI on the same GCP project.
