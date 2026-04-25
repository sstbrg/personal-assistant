# Private AI Automator — Design Guide

**Status:** Design spec for Claude Code implementation
**Owner:** Stas
**Last updated:** 2026-04-17

## 0. TL;DR

A personal AI assistant that turns WhatsApp messages, Gmail, and Google
Calendar activity into Google Tasks and Calendar events, with two hard
constraints:

- **Near-zero cost.** No paid infra. Only variable cost is Vertex AI inference
  at personal volume (expected $0.05–$0.50/month).
- **No third-party data exposure.** All components run inside the user's own
  Google account and GCP tenant. Vertex AI enterprise ToS guarantees no
  training on inputs.

The design deliberately avoids n8n, Evolution API, Baileys, Docker, and any
rented VM. It is built on three things the user already has or can stand up
inside their own Google identity: an Android phone, a Google Workspace account,
and a GCP project.

## 1. Goals and Non-Goals

### 1.1 Goals

- Capture incoming signals from Gmail (unread), Google Calendar (new/changed
  events), and WhatsApp (on-device notifications).
- Extract actionable tasks/events via LLM with a strict JSON schema.
- Write results to Google Tasks and Google Calendar under the user's own
  account.
- Keep message content inside the user's tenant end-to-end. No third-party AI
  vendor. No community-run relay.
- Be buildable by Claude Code in a single session, with explicit
  human-in-the-loop gates where OAuth and billing decisions require them.

### 1.2 Non-goals

- History backfill. Everything is forward-only from install.
- Replying on the user's behalf. Read-only capture for v1. RemoteInput-based
  reply is a v2 extension.
- Multi-user / SaaS. This is a single-tenant system for one person.
- Cross-platform mobile. Android only. iOS has no equivalent to
  NotificationListenerService.
- Muted WhatsApp chats. Android does not deliver notifications for them; they
  are structurally invisible to this system.

### 1.3 Explicitly rejected alternatives

| Alternative | Why rejected |
|---|---|
| whatsapp-web.js / Baileys / Evolution API | Reverse-engineered WhatsApp Web protocol. ToS gray area regardless of where it's hosted. |
| WhatsApp Business Cloud API | Requires dedicating the number to a Business account; incompatible with personal WhatsApp on the same line. |
| n8n / Zapier / Make | Requires a VM or paid tier. No orchestration value that Apps Script doesn't already provide for three triggers. |
| Gemini API free tier (AI Studio) | Free tier data may be used to improve Google products. Violates privacy constraint. |
| Groq / Cerebras / Mistral free tier | Third-party AI vendor. Adds a data boundary the user explicitly wants to avoid. |
| Local inference on Legion Pro / Pi 5 | User declined. |

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
