const Writer = {
  _cachedTaskListId: null,

  _ensureTaskList() {
    if (this._cachedTaskListId) return this._cachedTaskListId;
    const lists = Tasks.Tasklists.list().items || [];
    const existing = lists.find(l => l.title === CONFIG.TASKS_LIST_NAME);
    if (existing) { this._cachedTaskListId = existing.id; return existing.id; }
    const created = Tasks.Tasklists.insert({ title: CONFIG.TASKS_LIST_NAME });
    this._cachedTaskListId = created.id;
    return created.id;
  },

  writeAll(items, ctx) {
    if (!items || items.length === 0) return 0;
    let count = 0;
    for (const item of items) {
      try {
        if (this._write(item, ctx || {})) count++;
      } catch (err) {
        console.error('Writer error for item ' + JSON.stringify(item) + ': ' + err);
      }
    }
    return count;
  },

  _write(item, ctx) {
    if (!item || !item.kind || item.kind === 'none') return false;
    const conf = Number(item.confidence || 0);
    const sourceLabel = ctx.source ? '[' + ctx.source + (ctx.sourceRef ? ': ' + ctx.sourceRef : '') + ']' : '';

    if (conf < CONFIG.CONFIDENCE_THRESHOLD) {
      const listId = this._ensureTaskList();
      Tasks.Tasks.insert({
        title: '[review] ' + (item.title || 'uncertain item'),
        notes: [sourceLabel, 'confidence=' + conf, item.notes || ''].filter(Boolean).join('\n')
      }, listId);
      return true;
    }

    if (item.kind === 'task') {
      const listId = this._ensureTaskList();
      const task = {
        title: item.title,
        notes: [sourceLabel, item.notes || ''].filter(Boolean).join('\n')
      };
      if (item.due) {
        const d = new Date(item.due);
        if (!isNaN(d.getTime())) {
          // Tasks API requires RFC3339 and only honors the date portion.
          task.due = Utilities.formatDate(d, 'UTC', "yyyy-MM-dd'T'00:00:00.000'Z'");
        }
      }
      Tasks.Tasks.insert(task, listId);
      return true;
    }

    if (item.kind === 'event') {
      if (!item.due) return false;
      const start = new Date(item.due);
      if (isNaN(start.getTime())) return false;
      const durationMin = Number(item.duration_minutes) > 0 ? Number(item.duration_minutes) : 30;
      const end = new Date(start.getTime() + durationMin * 60000);
      Calendar.Events.insert({
        summary: item.title,
        description: [sourceLabel, item.notes || ''].filter(Boolean).join('\n'),
        start: { dateTime: start.toISOString(), timeZone: CONFIG.USER_TIMEZONE },
        end:   { dateTime: end.toISOString(),   timeZone: CONFIG.USER_TIMEZONE }
      }, CONFIG.CALENDAR_NAME);
      return true;
    }

    return false;
  },
};
