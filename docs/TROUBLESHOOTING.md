# Troubleshooting

## The Android "Send test event" button returns `code=401 body={"ok":false,"error":"bad_sig"}`

- Confirm the HMAC secret in the Android app exactly matches the one printed
  by `Setup.bootstrap()`. Copy it fresh; there is no trailing whitespace.
- If you recently ran `Setup.rotateSecret()`, update the app.
- Confirm you are posting to the `/exec` URL, not `/dev`. The signing path is
  the same, but a `/dev` URL requires Google auth.

## `code=400 error="stale_ts"`

- The phone's clock is more than five minutes off the Apps Script server clock.
  Enable auto time on the phone and retry.

## `code=-1 body="SocketTimeoutException…"`

- The phone has no network, or Apps Script is cold-starting. The foreground
  service schedules a `WorkManager` retry automatically.

## Nothing happens when I send a WhatsApp message

Check in order:
1. App → *Grant Notification Access* — is the toggle on?
2. The allowlist field — is there an entry that matches the chat title? Titles
   for 1:1 chats are the contact name. Group titles are the group name.
3. The chat is not muted. Muted chats do not fire notifications; this project
   cannot see them.
4. The foreground notification (*"Private AI Automator is running"*) is
   present. If it vanishes, the OEM battery optimizer killed the service;
   whitelist the app under *Settings → Battery → Battery optimization*.

## Gmail polling stopped firing

- Apps Script emails the project owner when a trigger fails repeatedly. Check
  inbox.
- `Setup.installTriggers()` re-creates them from scratch.

## `Vertex 403: Permission 'aiplatform.endpoints.predict' denied`

- You did not grant your Google account `roles/aiplatform.user` on the GCP
  project.
- Or the Apps Script project is linked to a *different* GCP project than the
  one with Vertex enabled. Project Settings → change the linked project.

## `Vertex 429`

- Unlikely at personal volume. Retry with jitter (`Extractor.callVertex`
  already bubbles the error; `pollGmail`/`pollCalendar` continue on the next
  trigger).

## Room DB keeps growing

- `ForwardingService.drainLoop` purges entries older than 24h. If drain never
  succeeds (misconfigured URL/secret), the queue can grow up to a day's worth
  and then starts dropping. Fix configuration first.

## I want to disable the pipeline temporarily

- Apps Script: `Setup.uninstallTriggers()` to stop Gmail/Calendar polling.
- Android: *Stop forwarding service* button.
- WhatsApp: remove entries from the allowlist — notifications stop being
  enqueued at the source.
