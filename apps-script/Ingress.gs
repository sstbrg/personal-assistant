const CALENDAR_SNAPSHOT_PROP = 'CALENDAR_SNAPSHOT';

function pollGmail() {
  try {
    const threads = GmailApp.search(CONFIG.GMAIL_QUERY, 0, 25);
    console.log('pollGmail: found ' + threads.length + ' threads matching query');
    for (const thread of threads) {
      const messages = thread.getMessages();
      for (const msg of messages) {
        const id = 'gm:' + msg.getId();
        if (Dedup.seen(id)) continue;

        try {
          const items = Extractor.extractFromEmail({
            from: msg.getFrom(),
            subject: msg.getSubject(),
            snippet: msg.getPlainBody().slice(0, 2000),
            received_at: msg.getDate().toISOString()
          });
          Writer.writeAll(items, { source: 'gmail', sourceRef: msg.getSubject() });
          // Mark dedup ONLY after successful extraction + write. A transient
          // Vertex 5xx or writer failure must not prevent retry next poll.
          Dedup.mark(id);
        } catch (err) {
          console.error('pollGmail item failed: ' + id + ' ' + err + '\n' + (err && err.stack));
        }
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

      // Unchanged event: carry the snapshot forward, nothing to do.
      if (snap[id] === updated) {
        nextSnap[id] = updated;
        continue;
      }

      const dedupKey = 'cal:' + id + ':' + updated;
      if (Dedup.seen(dedupKey)) {
        // Already processed in a prior run; just refresh the snapshot so we
        // don't re-evaluate on every poll.
        nextSnap[id] = updated;
        continue;
      }

      try {
        const items = Extractor.extractFromCalendar({
          summary: ev.getTitle(),
          start: ev.getStartTime().toISOString(),
          end: ev.getEndTime().toISOString(),
          location: ev.getLocation() || '',
          description: ev.getDescription() || ''
        });
        Writer.writeAll(items, { source: 'calendar', sourceRef: ev.getTitle() });
        // Mark + snapshot only after successful write. Failure leaves both
        // unset so the next poll retries this event.
        Dedup.mark(dedupKey);
        nextSnap[id] = updated;
      } catch (err) {
        console.error('pollCalendar item failed: ' + id + ' ' + err + '\n' + (err && err.stack));
      }
    }

    PropertiesService.getScriptProperties().setProperty(CALENDAR_SNAPSHOT_PROP, JSON.stringify(nextSnap));
  } catch (err) {
    console.error('pollCalendar error: ' + err + '\n' + (err && err.stack));
  }
}

function pollDrive() {
  try {
    const props = PropertiesService.getScriptProperties();
    const lastToken = props.getProperty('DRIVE_PAGE_TOKEN');

    var result;
    if (lastToken) {
      result = Drive.Changes.list(lastToken, { spaces: 'drive', fields: 'newStartPageToken,changes(fileId,file(name,mimeType,modifiedTime,lastModifyingUser))' });
    } else {
      // First run: just grab the current token, don't process history.
      var startToken = Drive.Changes.getStartPageToken();
      props.setProperty('DRIVE_PAGE_TOKEN', startToken.startPageToken);
      console.log('pollDrive: initialized page token');
      return;
    }

    var changes = result.changes || [];
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      var file = change.file;
      if (!file) continue;

      var dedupKey = 'drv:' + change.fileId + ':' + file.modifiedTime;
      if (Dedup.seen(dedupKey)) continue;

      try {
        var items = Extractor.extractFromDrive({
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          modifiedBy: file.lastModifyingUser ? file.lastModifyingUser.displayName : ''
        });
        Writer.writeAll(items, { source: 'drive', sourceRef: file.name });
        Dedup.mark(dedupKey);
      } catch (err) {
        console.error('pollDrive item failed: ' + change.fileId + ' ' + err + '\n' + (err && err.stack));
      }
    }

    if (result.newStartPageToken) {
      props.setProperty('DRIVE_PAGE_TOKEN', result.newStartPageToken);
    }
  } catch (err) {
    console.error('pollDrive error: ' + err + '\n' + (err && err.stack));
  }
}

function dailyDedupSweep() {
  const removed = Dedup.sweep();
  console.log('dedup sweep removed ' + removed + ' entries');
}
