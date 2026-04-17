# Setup guide

This is a human-followable checklist. Do not try to automate the OAuth and GCP
steps — Google requires you to click through them yourself.

## Phase 1 — GCP + Apps Script bootstrap

1. **Create a dedicated GCP project.**
   - Console → *IAM & Admin → Create a project*.
   - Name it something like `private-ai-automator`.
   - Note the **Project ID** (not the number).

2. **Enable billing on the project.**
   - Vertex AI requires a billing account attached. Expected spend at personal
     volume is well under $1/month. Set a budget alert at $5 for safety.

3. **Enable the Vertex AI API.**
   - Console → *APIs & Services → Library* → search for `Vertex AI API` →
     Enable.

4. **Grant yourself the Vertex AI user role.**
   - Console → *IAM & Admin → IAM* → Grant your Google account
     `roles/aiplatform.user` on the project.

5. **Install `clasp` and log in.**
   ```bash
   npm install -g @google/clasp
   clasp login
   ```

6. **Create the Apps Script project.**
   ```bash
   cd apps-script
   clasp create --type webapp --title "Private AI Automator"
   ```
   This produces `apps-script/.clasp.json` (git-ignored).

7. **Link Apps Script to your GCP project.**
   - Open the Apps Script editor (`clasp open`).
   - Project Settings → *Google Cloud Platform (GCP) Project* → *Change project*.
   - Paste the **project number** (not ID — get it from the GCP console home).
   - This is what lets `ScriptApp.getOAuthToken()` authorize Vertex AI calls.

8. **Fill the project ID into `Config.gs`.**
   - Edit `apps-script/Config.gs` and set `GCP_PROJECT_ID` to the **project ID**
     (not number).

9. **Push the code.**
   ```bash
   clasp push
   ```

10. **Run the bootstrap function.**
    - In the Apps Script editor, select `Setup.bootstrap` and click Run.
    - It will prompt for OAuth consent on all declared scopes — grant them.
    - The execution log will print:
      - The generated HMAC secret (save this — you'll paste it into the Android app).
      - Confirmation that the Gmail/Calendar/dedup triggers are installed.

11. **Deploy the Web App.**
    ```bash
    clasp deploy --description v1
    ```
    Record the `/exec` URL from the output. This is the webhook URL the Android
    app posts to.

    Alternatively: in the editor, *Deploy → New deployment → Web App*. Set
    access to *Anyone*. The Web App is not open to the world; HMAC verification
    gates every request.

## Phase 2 — Vertex AI smoke test

In the Apps Script editor, run `Extractor.smokeTest`. It sends a hardcoded email
snippet to Vertex AI and logs the parsed items. Confirm you see a non-empty
array.

## Phase 3 — Gmail + Calendar ingress sanity check

Send yourself an email containing something like
*"remind me to call Nir tomorrow at 3pm"*. Wait up to 5 minutes. A task should
appear in the `Automator` task list.

## Phase 4 — Android app

1. Open `android/` in Android Studio (Hedgehog+).
2. Let Gradle sync. Build and install the debug APK on your phone (USB or adb).
3. Launch **Private AI Automator**.
4. Paste the Web App URL (the `/exec` one) and the HMAC secret from Phase 1.
5. Set the allowlist to comma-separated chat titles you want captured. Leave
   empty to disable WhatsApp ingestion entirely (Gmail/Calendar still work via
   Apps Script).
6. Tap **Grant Notification Access** → find *Private AI Automator* and flip it
   on.
7. Tap **Start forwarding service**. A persistent low-priority notification
   should appear.
8. Tap **Send test event**. You should see `code=200 ok=true` in the toast.
9. In an allowlisted WhatsApp chat, send yourself *"remind me to buy milk
   tomorrow"*. Wait a few seconds — the task appears in the Automator list.

## Phase 5 — Verification

Run `./verify.sh` at the repo root for a checklist and static checks.

## Rotating secrets

Run `Setup.rotateSecret()` in the Apps Script editor. Copy the new value into
the Android app.
