# Private AI Automator — Design Guide

**Status:** Active — OpenClaw gateway on GCP free-tier VM
**Owner:** Stas
**Last updated:** 2026-04-18

## 0. TL;DR

A personal AI assistant that turns WhatsApp messages, Gmail, Google Calendar,
and Google Drive activity into Google Tasks and Calendar events, with two hard
constraints:

- **Near-zero cost.** GCP free-tier e2-micro VM + Vertex AI inference at
  personal volume (expected $0.05–$0.50/month).
- **No third-party data exposure.** All components run inside the user's own
  GCP tenant. Vertex AI enterprise ToS guarantees no training on inputs.
  Message content only leaves the VM to reach Vertex AI within the same
  GCP project.

The system uses [OpenClaw](https://github.com/openclaw/openclaw) as the
gateway, running on a GCP free-tier e2-micro VM. OpenClaw connects to
WhatsApp (via Baileys/WhatsApp Web), Gmail, Google Calendar, and Google Drive,
providing two-way messaging including self-reminders.

## 1. Goals and Non-Goals

### 1.1 Goals

- Capture incoming signals from Gmail, Google Calendar, Google Drive, and
  WhatsApp (via WhatsApp Web).
- Extract actionable tasks/events via LLM with a strict JSON schema.
- Write results to Google Tasks and Google Calendar under the user's own
  account.
- Two-way WhatsApp messaging, including self-reminders.
- Keep message content inside the user's tenant end-to-end. No third-party AI
  vendor.

### 1.2 Non-goals

- History backfill. Everything is forward-only from install.
- Multi-user / SaaS. This is a single-tenant system for one person.

### 1.3 Architecture decisions

| Decision | Rationale |
|---|---|
| OpenClaw + Baileys for WhatsApp | Full two-way messaging including self-reminders. ToS gray area accepted for personal single-user use. |
| GCP free-tier e2-micro VM | Always-on, no cost. Replaces the need for an Android notification listener. |
| Vertex AI (not public Gemini API) | Enterprise ToS — no training on inputs. Privacy constraint. |
| WhatsApp Business Cloud API rejected | Requires dedicating the number to a Business account. |
| Gemini API free tier rejected | Free tier data may be used to improve Google products. |
| Third-party AI vendors rejected | Adds a data boundary the user wants to avoid. |

## 2. Architecture

See the component diagram and trust boundary discussion in the task brief; the
code in this repository implements it verbatim.

- **Phone → Apps Script:** HTTPS + HMAC-SHA256 signature over a canonical
  signing string; replay-protected by timestamp + nonce.
- **Apps Script → Vertex AI:** OAuth2 bearer token minted by
  `ScriptApp.getOAuthToken()`. No service account JSON key on disk anywhere.
- **Apps Script → Tasks / Calendar:** Same OAuth principal.

## 3. Repository Layout

```
private-ai-automator/
├── README.md
├── DESIGN.md
├── .gitignore
├── .env.example
│
├── apps-script/
│   ├── appsscript.json
│   ├── Config.gs
│   ├── Webhook.gs
│   ├── Ingress.gs
│   ├── Triage.gs
│   ├── Extractor.gs
│   ├── Writer.gs
│   ├── Dedup.gs
│   ├── Hmac.gs
│   └── Setup.gs
│
├── android/
│   ├── settings.gradle.kts
│   ├── build.gradle.kts
│   ├── gradle.properties
│   └── app/
│       ├── build.gradle.kts
│       ├── proguard-rules.pro
│       └── src/main/
│           ├── AndroidManifest.xml
│           ├── kotlin/com/stas/automator/
│           └── res/
│
└── docs/
    ├── SETUP.md
    ├── PRIVACY.md
    └── TROUBLESHOOTING.md
```

## 4. Component Design

See source files. Salient implementation notes:

### Signature transport (Apps Script Webhook.gs)

`doPost` cannot read arbitrary HTTP headers in Apps Script. The signature
travels inside the JSON body as `sig`, computed as
`HMAC_SHA256(signing_base, HMAC_SECRET)` where

```
signing_base = v|ts|nonce|source|<canonical-json(data)>
```

Canonical JSON uses sorted keys with no whitespace. The Kotlin implementation
in `ApiClient.kt` and the JS implementation in `Webhook.gs` must stay in lock
step; their stringifiers are symmetric by design.

### Response schema (Extractor.gs)

`gemini-2.5-flash-lite` is invoked with `responseMimeType: application/json`
and a strict `responseSchema`. Output shape:

```jsonc
{
  "items": [
    {
      "kind": "task" | "event" | "none",
      "title": "string",
      "notes": "string",
      "due": "2026-04-20T14:00:00+03:00",
      "duration_minutes": 30,
      "confidence": 0.82
    }
  ]
}
```

Items with confidence below `CONFIDENCE_THRESHOLD` (0.6) are written to a
`[review]` task so the user can decide.

## 5. Data Flow (end-to-end)

1. WhatsApp notification → `WhatsAppListenerService` → Room.
2. `ForwardingService` drains Room, signs, POSTs to `/exec`.
3. Apps Script `doPost` verifies sig, dedups by nonce, runs Triage → Extractor.
4. Vertex AI returns schema-valid JSON.
5. Writer creates tasks/events under the user's own account.

## 6. Privacy Audit

See [docs/PRIVACY.md](./docs/PRIVACY.md).

## 7. Implementation Plan

- **Phase 0** — scaffold (this commit).
- **Phase 1** — GCP + Apps Script bootstrap (human-in-loop, see SETUP.md).
- **Phase 2** — `Extractor.smokeTest()`.
- **Phase 3** — Gmail + Calendar ingress sanity.
- **Phase 4** — Android build + install.
- **Phase 5** — `./verify.sh` and manual checklist.

## 8. Configuration Reference

### Apps Script ScriptProperties
| Key | Source | Purpose |
|---|---|---|
| `HMAC_SECRET` | `Setup.bootstrap` | Shared with Android |
| `IMPORTANT_SENDERS` | user-edited | Triage bypass list |
| `CALENDAR_SNAPSHOT` | auto | Last-seen event state |
| `DEDUP_MAP` | auto | Seen nonces/IDs |

### Android EncryptedSharedPreferences
| Key | Purpose |
|---|---|
| `webapp_url` | `/exec` URL |
| `hmac_secret` | shared secret |
| `allowlist` | allowed WhatsApp chat titles |

### GCP
- Project: dedicated.
- APIs: `aiplatform.googleapis.com`.
- IAM: `roles/aiplatform.user` on the user.
- Region: `us-central1`.
- Budget alert: $5/mo.

## 9. Failure Modes

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

## 10. Known Limitations

- WhatsApp notification body is truncated (~200 chars).
- Muted WhatsApp chats are invisible.
- Force-stopping the Android app silently breaks WhatsApp ingestion; a banner
  warns if Notification Access is off.
- Apps Script Web Apps have a 6-minute execution limit (not close at one
  message per call).
- Google Tasks API supports `due` date only, not time. Time-specific items are
  routed to Calendar.

## 11. Future Extensions (v2)

- Reply to WhatsApp via `Notification.Action.RemoteInput`.
- Semantic dedup via Vertex embeddings.
- Slack / Signal / Telegram ingestion.
- Weekly Friday digest of unfinished tasks.
- Hebrew-first prompts when input is Hebrew.
