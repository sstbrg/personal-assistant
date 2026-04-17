// One-shot setup functions. Run these manually from the Apps Script editor.

const Setup = {
  bootstrap() {
    this._ensureHmacSecret();
    this.installTriggers();
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty('HMAC_SECRET');
    console.log('=== Private AI Automator bootstrap complete ===');
    console.log('HMAC_SECRET: ' + secret);
    console.log('(Paste this into the Android app. Do NOT share.)');
    console.log('Next: deploy the Web App via `clasp deploy` (or the editor UI)');
    console.log('and copy the /exec URL into the Android app.');
  },

  _ensureHmacSecret() {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('HMAC_SECRET')) return;
    const bytes = new Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
    // Mix in cryptographic-quality entropy from Utilities.getUuid() too.
    const entropy = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + new Date().getTime();
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, entropy);
    const secret = digest.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
    props.setProperty('HMAC_SECRET', secret);
  },

  rotateSecret() {
    PropertiesService.getScriptProperties().deleteProperty('HMAC_SECRET');
    this._ensureHmacSecret();
    console.log('New HMAC_SECRET: ' + PropertiesService.getScriptProperties().getProperty('HMAC_SECRET'));
    console.log('Update the Android app with this value.');
  },

  installTriggers() {
    const existing = ScriptApp.getProjectTriggers();
    for (const t of existing) ScriptApp.deleteTrigger(t);

    ScriptApp.newTrigger('pollGmail')
      .timeBased().everyMinutes(CONFIG.GMAIL_POLL_MINUTES).create();
    ScriptApp.newTrigger('pollCalendar')
      .timeBased().everyMinutes(CONFIG.CALENDAR_POLL_MINUTES).create();
    ScriptApp.newTrigger('dailyDedupSweep')
      .timeBased().atHour(3).everyDays(1).create();

    console.log('Triggers installed: pollGmail/' + CONFIG.GMAIL_POLL_MINUTES + 'm, ' +
                'pollCalendar/' + CONFIG.CALENDAR_POLL_MINUTES + 'm, dailyDedupSweep@03:00');
  },

  uninstallTriggers() {
    const existing = ScriptApp.getProjectTriggers();
    for (const t of existing) ScriptApp.deleteTrigger(t);
    console.log('Removed ' + existing.length + ' triggers');
  },

  printWebAppInfo() {
    const url = ScriptApp.getService().getUrl();
    console.log('Web App URL: ' + (url || '(not deployed yet)'));
  },
};
