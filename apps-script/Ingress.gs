const CALENDAR_SNAPSHOT_PROP = 'CALENDAR_SNAPSHOT';

function pollGmail() {
  try {
    const threads = GmailApp.search(CONFIG.GMAIL_QUERY, 0, 25);
    for (const thread of threads) {
      const messages = thread.getMessages();
      for (const msg of messages) {
        const id = 'gm:' + msg.getId();
        if (Dedup.seen(id)) continue;
        Dedup.mark(id);

        const items = Extractor.extractFromEmail({
          from: msg.getFrom(),
          subject: msg.getSubject(),
          snippet: msg.getPlainBody().slice(0, 2000),
          received_at: msg.getDate().toISOString()
        });
        Writer.writeAll(items, { source: 'gmail', sourceRef: msg.getSubject() });
      }
    }
  } catch (err) {
    console.error('pollGmail error: ' + err + '\n' + (err && err.stack));
  }
}

function pollCalendar() {
  try {
    const cal = CalendarApp.getDefaultCalendar();
    const now = new Date();
    const end = new Date(now.getTime() + CONFIG.CALENDAR_LOOKAHEAD_DAYS * 86400000);
    const events = cal.getEvents(now, end);

    const snapRaw = PropertiesService.getScriptProperties().getProperty(CALENDAR_SNAPSHOT_PROP);
    let snap = {};
    if (snapRaw) { try { snap = JSON.parse(snapRaw); } catch (e) { snap = {}; } }

    const nextSnap = {};
    for (const ev of events) {
      const id = ev.getId();
      const updated = ev.getLastUpdated().toISOString();
      nextSnap[id] = updated;
      const prev = snap[id];
      if (prev === updated) continue;

      const dedupKey = 'cal:' + id + ':' + updated;
      if (Dedup.seen(dedupKey)) continue;
      Dedup.mark(dedupKey);

      const items = Extractor.extractFromCalendar({
        summary: ev.getTitle(),
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        location: ev.getLocation() || '',
        description: ev.getDescription() || ''
      });
      Writer.writeAll(items, { source: 'calendar', sourceRef: ev.getTitle() });
    }

    PropertiesService.getScriptProperties().setProperty(CALENDAR_SNAPSHOT_PROP, JSON.stringify(nextSnap));
  } catch (err) {
    console.error('pollCalendar error: ' + err + '\n' + (err && err.stack));
  }
}

function dailyDedupSweep() {
  const removed = Dedup.sweep();
  console.log('dedup sweep removed ' + removed + ' entries');
}
