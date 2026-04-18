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

## VM access and in-progress setup

The VM is `openclaw-gw` in `us-central1-a`, project `personalassistant-493705`.

```bash
# SSH into the VM
gcloud compute ssh openclaw-gw --zone=us-central1-a --project=personalassistant-493705

# Run a single command on the VM
gcloud compute ssh openclaw-gw --zone=us-central1-a --project=personalassistant-493705 \
  --command="<your command>"
```

### Current state (2026-04-18)

OpenClaw is being installed via `sudo npm install -g openclaw@latest` on the
e2-micro VM. The install is slow (~5–10 min) due to 0.25 vCPU.

To check if it finished:
```bash
gcloud compute ssh openclaw-gw --zone=us-central1-a --project=personalassistant-493705 \
  --command="which openclaw && openclaw --version || echo 'not installed yet'"
```

### After install completes — remaining setup steps

1. Run `openclaw onboard` on the VM (interactive — needs SSH session).
2. Configure `~/.openclaw/openclaw.json` with:
   - WhatsApp channel (Baileys) with allowlist for the user's contacts.
   - Model provider pointing at Vertex AI (`gemini-2.5-flash-lite`) on
     project `personalassistant-493705`, region `us-central1`.
   - Gmail, Calendar, Drive integrations.
   - Output to Google Tasks (list "Automator") and Google Calendar (primary).
3. Pair WhatsApp by scanning the QR code shown during onboard.
4. Set up OpenClaw as a systemd user service so it survives reboots.
5. Disable the legacy Apps Script triggers (run `uninstallTriggers` in the
   Apps Script editor) to avoid duplicate processing.

### Useful VM commands

```bash
# Check OpenClaw gateway status
openclaw doctor

# View gateway logs
journalctl --user -u openclaw -f

# Restart the gateway
systemctl --user restart openclaw

# Check WhatsApp session
openclaw status
```

## Things not to do

- Don't commit GCP credentials or OpenClaw config files.
- Don't log message content by default.
- Don't switch from Vertex AI to the public Gemini API; the enterprise ToS
  is the reason this architecture exists.
- Don't add third-party AI vendors — adds a data boundary the user wants
  to avoid.
