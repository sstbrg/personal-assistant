# CLAUDE.md

Repo-specific context for Claude Code. See `DESIGN.md` for the full spec.

## What this is

A personal AI assistant that turns WhatsApp messages, Gmail, Google Calendar,
and Google Drive activity into Google Tasks and Calendar events. Single-tenant,
runs entirely inside the user's own GCP tenant — no third-party operator in
the message-content path.

## Architecture

- **OpenClaw gateway** on a GCP free-tier e2-micro VM (`openclaw-gw`,
  `us-central1-a`, project `personalassistant-493705`).
- **WhatsApp** via Baileys/WhatsApp Web — full two-way including self-reminders.
- **Gmail, Calendar, Drive** monitoring via OpenClaw's built-in integrations.
- **Vertex AI** (`gemini-2.5-flash-lite`) on the same GCP project for
  task/event extraction.
- **Google Tasks / Calendar** as output destinations.

## Repo layout

- `apps-script/` — Legacy Apps Script Web App (V8). Superseded by OpenClaw.
  Kept for reference. Pushed via `clasp`.
- `android/` — Legacy Android notification listener app. Superseded by
  OpenClaw's WhatsApp Web integration.
- `openclaw/` — OpenClaw gateway configuration and deployment scripts.
- `tests/signing-parity.test.mjs` — Legacy Node cross-language guardrail.
- `.github/workflows/ci.yml` — CI runs on published releases.

## Branching model

- `develop` is the integration branch.
- Work goes on `bugfix/<slug>` or `chore/<slug>` or `feature/<slug>`,
  forked from `develop`.
- Each branch is its own PR. PRs target `develop`.
- Do NOT push to `main` directly. Do NOT merge without the user's approval.

## Security model

- **Vertex AI enterprise ToS** is the reason we use Vertex and not the
  public Gemini API; don't switch vendors without re-reading
  `docs/PRIVACY.md`.
- **OpenClaw credentials** live on the VM at `~/.openclaw/credentials/`.
  Never committed.
- **GCP project:** `personalassistant-493705`. Budget alert at 73 ILS/month.
- **WhatsApp session** managed by OpenClaw via Baileys. Session persists
  on the VM. If the VM restarts, the session may need re-pairing.

## Deploy path

1. GCP project with Vertex AI + Compute Engine APIs enabled.
2. Free-tier e2-micro VM (`openclaw-gw`) in `us-central1-a`.
3. Node.js + OpenClaw installed on the VM.
4. `openclaw onboard` to configure channels and model provider.
5. OpenClaw runs as a systemd user service.

## Things not to do

- Don't commit GCP credentials or OpenClaw config files.
- Don't log message content by default.
- Don't switch from Vertex AI to the public Gemini API; the enterprise ToS
  is the reason this architecture exists.
- Don't add third-party AI vendors — adds a data boundary the user wants
  to avoid.
