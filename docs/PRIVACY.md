# Privacy audit

The design goal is that no message content leaves the user's own Google/GCP
tenant. This document walks through every hop a byte takes.

| Hop | Destination | Controller | Trust basis |
|-----|-------------|------------|-------------|
| WhatsApp server → phone | Phone | User | WhatsApp E2EE; out of scope here |
| Phone RAM → our Room DB | Phone internal storage | User | Room files are in the app's private directory, FBE-encrypted on modern Android |
| Phone → Apps Script Web App | Google | User's Google account | TLS to `*.googleusercontent.com` endpoint; HMAC prevents forgery and replay |
| Apps Script → Vertex AI | Google | User's GCP project | OAuth bearer minted by `ScriptApp.getOAuthToken()` with the running user's identity |
| Vertex AI inference | Google | User's GCP project | Not used for training per Google's Vertex AI data governance terms |
| Apps Script → Tasks / Calendar | Google | User's Google account | Same OAuth principal; the user's own data |

There is no third-party operator anywhere in this flow. Every service is either
the user's own phone, the user's own Google account, or the user's own GCP
project.

## Residual risks

1. **Account compromise.** If the user's Google account is compromised, the
   entire pipeline is compromised. This is true of any integration built on
   the user's Google identity.
2. **Vertex AI request logs.** Vertex AI retains request logs for abuse
   detection per Google's standard retention terms. These logs are covered by
   the same enterprise contract and are not used for model training.
3. **Notification content on the lock screen.** Android notifications for
   unmuted WhatsApp chats show message bodies on the lock screen and in the
   shade. This is the user's existing exposure; this project reads the same
   bytes Android is already rendering.
4. **Web App `ANYONE_ANONYMOUS` access.** The Web App is callable without Google
   auth because the Android client cannot mint a Google token for the user.
   Every request is authenticated by HMAC-SHA256 over a canonical signing
   string with a timestamp window of ±5 minutes and a nonce-based dedup layer.
   A leaked secret can be rotated in one command (`Setup.rotateSecret`).

## References to pin in the implementation

Before release, Claude Code must fetch and cite retrieval dates for:

- Vertex AI generative AI data governance page (Google Cloud docs).
- Vertex AI pricing page, specifically confirming `gemini-2.5-flash-lite`.
- Google Workspace / Apps Script OAuth consent behavior for `cloud-platform`.
- Android `NotificationListenerService` documentation.
- Apps Script `UrlFetchApp` quotas.
