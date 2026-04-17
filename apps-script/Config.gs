// Non-secret config. Secrets live in PropertiesService.getScriptProperties().
const CONFIG = {
  GCP_PROJECT_ID: '',                    // filled by user during setup
  VERTEX_LOCATION: 'us-central1',
  VERTEX_MODEL: 'gemini-2.5-flash-lite',
  USER_TIMEZONE: 'Asia/Jerusalem',
  GMAIL_QUERY: 'is:unread newer_than:1h -category:promotions -category:social',
  GMAIL_POLL_MINUTES: 5,
  CALENDAR_POLL_MINUTES: 15,
  CALENDAR_LOOKAHEAD_DAYS: 14,
  TASKS_LIST_NAME: 'Automator',          // auto-created if missing
  CALENDAR_NAME: 'primary',
  DEDUP_TTL_DAYS: 30,
  CONFIDENCE_THRESHOLD: 0.6,
  LOG_CONTENT: false                     // never set true outside debugging
};

function _json(obj, code) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script ContentService ignores status codes; clients should inspect body.
  return out;
}

function _nowIso() {
  return Utilities.formatDate(new Date(), CONFIG.USER_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
