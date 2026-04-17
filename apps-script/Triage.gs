const ACTION_VERBS = [
  'remind', 'send', 'review', 'call', 'need', 'can you', 'could you',
  'please', 'schedule', 'book', 'confirm', 'buy', 'pick up', 'fetch',
  'prepare', 'draft', 'follow up', 'follow-up', 'ping',
  // Hebrew
  'תזכיר', 'שלח', 'צריך', 'תבדוק', 'תתקשר', 'תכין', 'תאשר', 'תקנה',
  'אפשר', 'בבקשה', 'תוודא'
];

const TIME_MARKERS = [
  /\btoday\b/i, /\btomorrow\b/i, /\btonight\b/i, /\bnext (week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b\d{1,2}:\d{2}\b/, /\b\d{1,2}(am|pm)\b/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
  /מחר/, /היום/, /הערב/, /שבוע הבא/, /החודש הבא/, /ביום (ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/
];

const Triage = {
  passes(text, sender) {
    if (!text) return false;
    const lower = String(text).toLowerCase();

    if (ACTION_VERBS.some(v => lower.indexOf(v) !== -1)) return true;
    if (TIME_MARKERS.some(rx => rx.test(text))) return true;

    if (sender) {
      const important = this._importantSenders();
      if (important.some(s => String(sender).toLowerCase().indexOf(s.toLowerCase()) !== -1)) {
        return true;
      }
    }
    return false;
  },

  _importantSenders() {
    const raw = PropertiesService.getScriptProperties().getProperty('IMPORTANT_SENDERS');
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
  },
};
