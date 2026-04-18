function smokeTest() { return Extractor.smokeTest(); }

function debugWhatsApp() {
  var data = { body: 'remind me to buy milk tomorrow at 10', chat: 'Test', sender: 'Test', is_group: false, received_at: _nowIso() };
  console.log('Triage passes: ' + Triage.passes(data.body, data.sender || data.chat));
  var items = Extractor.extractFromWhatsApp(data);
  console.log('Items: ' + JSON.stringify(items, null, 2));
  var written = Writer.writeAll(items, { source: 'whatsapp', sourceRef: data.chat });
  console.log('Written: ' + written);
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['task', 'event', 'none'] },
          title: { type: 'string' },
          notes: { type: 'string' },
          due: { type: 'string', description: 'ISO 8601 with TZ offset, e.g. 2026-04-20T14:00:00+03:00' },
          duration_minutes: { type: 'integer' },
          confidence: { type: 'number' }
        },
        required: ['kind', 'title', 'confidence']
      }
    }
  },
  required: ['items']
};

const Extractor = {
  _systemPrompt() {
    return [
      'You extract actionable tasks and calendar events from short personal messages.',
      'User timezone: ' + CONFIG.USER_TIMEZONE + '.',
      'Current datetime (user TZ): ' + _nowIso() + '.',
      'Return strict JSON matching the response schema. Do not invent content.',
      'Rules:',
      '- If the message implies a single-point action with an explicit time, produce an "event".',
      '- If it implies a todo without a hard time, produce a "task" (with "due" as a date when inferable).',
      '- If it is chit-chat or not actionable, return a single {"kind":"none", ...} with low confidence.',
      '- Preserve the original language (English or Hebrew) in title and notes.',
      '- Confidence is 0..1. Below 0.6 means uncertain; still include it.',
      '- Never include the raw source text verbatim in "notes" beyond a short excerpt (<= 200 chars).'
    ].join('\n');
  },

  callVertex(systemPrompt, userContent) {
    if (!CONFIG.GCP_PROJECT_ID) {
      throw new Error('CONFIG.GCP_PROJECT_ID is empty. Edit Config.gs.');
    }
    const url = 'https://' + CONFIG.VERTEX_LOCATION + '-aiplatform.googleapis.com/v1/projects/' +
                CONFIG.GCP_PROJECT_ID + '/locations/' + CONFIG.VERTEX_LOCATION +
                '/publishers/google/models/' + CONFIG.VERTEX_MODEL + ':generateContent';

    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    };

    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if (code !== 200) {
      throw new Error('Vertex ' + code + ': ' + resp.getContentText());
    }
    const parsed = JSON.parse(resp.getContentText());
    const text = parsed &&
      parsed.candidates && parsed.candidates[0] &&
      parsed.candidates[0].content && parsed.candidates[0].content.parts &&
      parsed.candidates[0].content.parts[0] && parsed.candidates[0].content.parts[0].text;
    if (!text) throw new Error('Vertex returned no text candidate');
    const obj = JSON.parse(text);
    return (obj && obj.items) || [];
  },

  extractFromWhatsApp(data) {
    if (!Triage.passes(data.body, data.sender || data.chat)) return [];
    const user = [
      'Source: WhatsApp',
      'Chat: ' + (data.chat || ''),
      'Sender: ' + (data.sender || ''),
      'Group: ' + (data.is_group ? 'yes' : 'no'),
      'Received at: ' + (data.received_at || _nowIso()),
      'Message:',
      String(data.body || '').slice(0, 2000)
    ].join('\n');
    return this.callVertex(this._systemPrompt(), user);
  },

  extractFromEmail(meta) {
    if (!Triage.passes(meta.subject + '\n' + meta.snippet, meta.from)) return [];
    const user = [
      'Source: Gmail',
      'From: ' + (meta.from || ''),
      'Subject: ' + (meta.subject || ''),
      'Received at: ' + (meta.received_at || _nowIso()),
      'Body excerpt:',
      String(meta.snippet || '').slice(0, 2000)
    ].join('\n');
    return this.callVertex(this._systemPrompt(), user);
  },

  extractFromCalendar(ev) {
    const user = [
      'Source: Google Calendar (new or changed event)',
      'Title: ' + (ev.summary || ''),
      'Start: ' + (ev.start || ''),
      'End: ' + (ev.end || ''),
      'Location: ' + (ev.location || ''),
      'Description excerpt:',
      String(ev.description || '').slice(0, 1500),
      '',
      'List short prep tasks (if any) the attendee should complete BEFORE this meeting.',
      'Each prep task: kind="task", due=morning of the event in user timezone.',
      'If no prep is needed, return {"kind":"none", ...}.'
    ].join('\n');
    return this.callVertex(this._systemPrompt(), user);
  },

  extractFromDrive(meta) {
    const user = [
      'Source: Google Drive (new or updated file)',
      'File name: ' + (meta.name || ''),
      'Type: ' + (meta.mimeType || ''),
      'Modified at: ' + (meta.modifiedTime || ''),
      'Modified by: ' + (meta.modifiedBy || ''),
      '',
      'If this file implies a follow-up action (review, comment, sign, etc.), create a task.',
      'If no action is needed, return {"kind":"none", ...}.'
    ].join('\n');
    return this.callVertex(this._systemPrompt(), user);
  },

  smokeTest() {
    const items = this.extractFromEmail({
      from: 'Nir <nir@example.com>',
      subject: 'BOM for MM8108',
      snippet: 'Hey, can you send me the MM8108 BOM before Thursday 2pm? Thanks.',
      received_at: _nowIso()
    });
    console.log(JSON.stringify(items, null, 2));
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('smokeTest: no items returned');
    }
    return items;
  },
};
