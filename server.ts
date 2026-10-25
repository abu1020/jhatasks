import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CalendarEvent, Task } from './src/db/schema.ts';
import {
  classifyGmailMessage,
  type GmailNotificationItem,
} from './src/lib/nlpParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server-side in-memory store with optional PostgreSQL Pool fallback when DATABASE_URL is configured
const tasksStore = new Map<string, Task>();
const eventsStore = new Map<string, CalendarEvent>();
const gmailNotificationsByUser = new Map<string, GmailNotificationItem[]>();

function decodeGmailBase64Url(data?: string): string {
  if (!data) return '';
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractGmailBodyText(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeGmailBase64Url(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeGmailBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractGmailBodyText(part);
      if (nested) return nested;
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeGmailBase64Url(part.body.data)
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
  }
  if (payload.body?.data) {
    return decodeGmailBase64Url(payload.body.data)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

function formatLocalDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, offset: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return formatLocalDay(d);
}

function buildSeedEvents(now: Date = new Date()): CalendarEvent[] {
  const today = formatLocalDay(now);
  return [
    {
      id: 'evt_exec_sync',
      title: 'Product & Design Architecture Review',
      date: today,
      start_time: '09:30',
      end_time: '10:30',
      source: 'google',
      color: '#4F46E5',
      meet_link: 'https://meet.google.com/cad-ence-os',
      location: 'Google Meet · Studio A',
    },
    {
      id: 'evt_deep_work_hold',
      title: '1:1 Engineering Leadership Sync',
      date: today,
      start_time: '11:30',
      end_time: '12:15',
      source: 'google',
      color: '#06B6D4',
      meet_link: 'https://meet.google.com/eng-sync-q4',
      location: 'Google Meet',
    },
    {
      id: 'evt_client_qbr',
      title: 'Q4 Roadmap & OKR Alignment',
      date: today,
      start_time: '14:00',
      end_time: '15:00',
      source: 'google',
      color: '#8B5CF6',
      meet_link: 'https://meet.google.com/okr-align',
      location: 'Boardroom 4B / Google Meet',
    },
    {
      id: 'evt_wellness',
      title: 'Evening Mobility & Strength Session',
      date: today,
      start_time: '17:30',
      end_time: '18:15',
      source: 'google',
      color: '#10B981',
      meet_link: null,
      location: 'Equinox Downtown',
    },
    {
      id: 'evt_tmrw_standup',
      title: 'Weekly Sprint Kickoff & Triage',
      date: addDays(now, 1),
      start_time: '10:00',
      end_time: '11:00',
      source: 'google',
      color: '#4F46E5',
      meet_link: 'https://meet.google.com/sprint-kick',
      location: 'Google Meet',
    },
    {
      id: 'evt_tmrw_design',
      title: 'Customer Advisory Board Call',
      date: addDays(now, 1),
      start_time: '15:00',
      end_time: '16:00',
      source: 'google',
      color: '#F59E0B',
      meet_link: 'https://meet.google.com/cab-review',
      location: 'Google Meet',
    },
    {
      id: 'evt_plus2_lunch',
      title: 'Founder Coffee & Strategy Catch-up',
      date: addDays(now, 2),
      start_time: '12:30',
      end_time: '13:30',
      source: 'google',
      color: '#10B981',
      meet_link: null,
      location: 'Blue Bottle Coffee',
    },
    {
      id: 'evt_prev1_retro',
      title: 'Design Systems Guild Retro',
      date: addDays(now, -1),
      start_time: '13:00',
      end_time: '14:00',
      source: 'google',
      color: '#4F46E5',
      meet_link: 'https://meet.google.com/ds-guild',
      location: 'Google Meet',
    },
  ];
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // GET /api/health -> { ok: true }
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, query: 'select 1' });
  });

  // GET /api/tasks -> { tasks, events }
  app.get('/api/tasks', (_req, res) => {
    const tasks = Array.from(tasksStore.values()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const events = Array.from(eventsStore.values()).sort((a, b) =>
      `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`)
    );
    res.json({ tasks, events });
  });

  // POST /api/tasks -> accept { tasks: Task[] }
  app.post('/api/tasks', (req, res) => {
    const incoming: Task[] = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
    const saved: Task[] = [];
    for (const item of incoming) {
      if (!item || typeof item.title !== 'string' || !item.title.trim()) {
        continue;
      }
      const normalized: Task = {
        ...item,
        title: item.title.trim(),
        sort_order: Number(item.sort_order) || 0,
      };
      tasksStore.set(normalized.id, normalized);
      saved.push(normalized);
    }
    res.status(201).json({ tasks: saved });
  });

  // PATCH /api/tasks/:id -> partial task patch (supports fractional double sort_order)
  app.patch('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const existing = tasksStore.get(id);
    const patch = req.body || {};
    if (!existing) {
      // Upsert if patched optimistically before POST settled
      const fallback: Task = {
        id,
        title: typeof patch.title === 'string' && patch.title.trim() ? patch.title.trim() : 'Untitled task',
        description: patch.description ?? '',
        workspace: patch.workspace ?? 'office',
        status: patch.status ?? 'todo',
        priority: patch.priority ?? 3,
        important: Boolean(patch.important),
        quadrant: patch.quadrant ?? null,
        due_date: patch.due_date ?? null,
        due_time: patch.due_time ?? null,
        tags: Array.isArray(patch.tags) ? patch.tags : [],
        subtasks: Array.isArray(patch.subtasks) ? patch.subtasks : [],
        attachments: Array.isArray(patch.attachments) ? patch.attachments : [],
        recurrence: patch.recurrence ?? null,
        estimated_minutes: patch.estimated_minutes ?? null,
        actual_minutes: Number(patch.actual_minutes) || 0,
        sort_order: Number(patch.sort_order) || 0,
        source: patch.source ?? 'manual',
        created_at: patch.created_at ?? new Date().toISOString(),
        completed_at: patch.completed_at ?? null,
      };
      tasksStore.set(id, fallback);
      return res.json({ task: fallback });
    }

    const updated: Task = {
      ...existing,
      ...patch,
      title:
        patch.title !== undefined
          ? String(patch.title).trim() || 'Untitled task'
          : existing.title,
      sort_order:
        patch.sort_order !== undefined
          ? Number(patch.sort_order)
          : existing.sort_order,
    };
    tasksStore.set(id, updated);
    return res.json({ task: updated });
  });

  // DELETE /api/tasks/:id
  app.delete('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    tasksStore.delete(id);
    res.json({ ok: true, id });
  });

  // PUT /api/tasks/:id -> full replacement update for task CRUD
  app.put('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    const existing = tasksStore.get(id);
    const updated: Task = {
      id,
      title:
        typeof body.title === 'string' && body.title.trim()
          ? body.title.trim()
          : existing?.title || 'Untitled task',
      description: body.description ?? existing?.description ?? '',
      workspace: body.workspace === 'personal' ? 'personal' : 'office',
      status: ['todo', 'in_progress', 'in_review', 'done'].includes(body.status)
        ? body.status
        : existing?.status || 'todo',
      priority: ([1, 2, 3, 4] as const).includes(Number(body.priority) as any)
        ? (Number(body.priority) as 1 | 2 | 3 | 4)
        : existing?.priority || 3,
      important: Boolean(body.important ?? existing?.important),
      quadrant: body.quadrant ?? existing?.quadrant ?? null,
      due_date: body.due_date !== undefined ? body.due_date : existing?.due_date ?? null,
      due_time: body.due_time !== undefined ? body.due_time : existing?.due_time ?? null,
      tags: Array.isArray(body.tags) ? body.tags : existing?.tags || [],
      subtasks: Array.isArray(body.subtasks) ? body.subtasks : existing?.subtasks || [],
      attachments: Array.isArray(body.attachments)
        ? body.attachments
        : existing?.attachments || [],
      recurrence: body.recurrence ?? existing?.recurrence ?? null,
      estimated_minutes:
        body.estimated_minutes !== undefined
          ? body.estimated_minutes
          : existing?.estimated_minutes ?? null,
      actual_minutes: Number(body.actual_minutes ?? existing?.actual_minutes) || 0,
      sort_order: Number(body.sort_order ?? existing?.sort_order) || 0,
      source: body.source || existing?.source || 'manual',
      created_at: body.created_at || existing?.created_at || new Date().toISOString(),
      completed_at: body.completed_at !== undefined ? body.completed_at : existing?.completed_at ?? null,
    };
    tasksStore.set(id, updated);
    res.json({ task: updated });
  });

  // Live Google Sheets CSV feed for =IMPORTDATA() and 1-click Sheet export
  let lastSheetSyncState: {
    spreadsheetId: string;
    lastSyncedAt: string | null;
    syncedCount: number;
  } = {
    spreadsheetId: 'cadence-master-tasks-sheet',
    lastSyncedAt: null,
    syncedCount: 0,
  };

  function buildTasksCsvRows(tasks: Task[]): string[][] {
    const headers = [
      'ID',
      'Title',
      'Workspace',
      'Status',
      'Priority',
      'Due Date',
      'Due Time',
      'Tags',
      'Estimated Mins',
      'Source',
      'Notes',
    ];
    return [
      headers,
      ...tasks.map((t) => [
        t.id,
        t.title,
        t.workspace,
        t.status,
        t.priority === 1
          ? 'Urgent'
          : t.priority === 2
          ? 'High'
          : t.priority === 3
          ? 'Medium'
          : 'Low',
        t.due_date || '',
        t.due_time || '',
        (t.tags || []).join(', '),
        t.estimated_minutes != null ? String(t.estimated_minutes) : '',
        t.source || 'manual',
        (t.description || '').replace(/\r?\n/g, ' '),
      ]),
    ];
  }

  app.get('/api/tasks/sheets-feed.csv', (_req, res) => {
    const tasks = Array.from(tasksStore.values()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const rows = buildTasksCsvRows(tasks);
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(',')
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="cadence-google-tasks-sheet.csv"');
    res.send(csv);
  });

  app.get('/api/sheets/sync', async (req, res) => {
    const spreadsheetId = String(req.query.spreadsheetId || '').trim();
    if (spreadsheetId && spreadsheetId !== 'cadence-master-tasks-sheet') {
      try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
          spreadsheetId
        )}/gviz/tq?tqx=out:csv`;
        const resp = await fetch(gvizUrl);
        if (resp.ok) {
          const text = await resp.text();
          const rows = text
            .trim()
            .split(/\r?\n/)
            .map((line) =>
              line
                .split(',')
                .map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"').trim())
            );
          return res.json({
            ok: true,
            spreadsheetId,
            rows,
            lastSyncedAt: new Date().toISOString(),
          });
        }
      } catch {
        // Fallback to local synced tasks table
      }
    }
    const tasks = Array.from(tasksStore.values()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const rows = buildTasksCsvRows(tasks);
    return res.json({
      ok: true,
      spreadsheetId: spreadsheetId || lastSheetSyncState.spreadsheetId,
      rows,
      syncedCount: tasks.length,
      lastSyncedAt: lastSheetSyncState.lastSyncedAt || new Date().toISOString(),
    });
  });

  app.post('/api/sheets/sync', (req, res) => {
    const incomingTasks: Task[] = Array.isArray(req.body?.tasks)
      ? req.body.tasks
      : Array.from(tasksStore.values());
    const spreadsheetId = String(
      req.body?.spreadsheetId || lastSheetSyncState.spreadsheetId || 'cadence-master-tasks-sheet'
    ).trim();

    for (const item of incomingTasks) {
      if (item && typeof item.id === 'string' && typeof item.title === 'string') {
        tasksStore.set(item.id, item);
      }
    }

    lastSheetSyncState = {
      spreadsheetId,
      lastSyncedAt: new Date().toISOString(),
      syncedCount: incomingTasks.length,
    };

    res.json({
      ok: true,
      ...lastSheetSyncState,
      rows: buildTasksCsvRows(incomingTasks),
    });
  });

  // Real-time Gmail API Polling Cloud Function / Endpoint (/api/gmail/poll)
  const handleGmailPoll = async (req: express.Request, res: express.Response) => {
    const authHeader = String(req.headers.authorization || '');
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const token = bearerToken || String(req.body?.accessToken || '').trim();
    const userKey = String(
      req.query.email || req.body?.email || 'default'
    )
      .trim()
      .toLowerCase();

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'NEEDS_GOOGLE_AUTH',
        messages: gmailNotificationsByUser.get(userKey) || [],
      });
    }

    const q = String(req.query.q || req.body?.q || 'in:inbox').trim();
    const maxResults = Math.min(
      15,
      Math.max(1, Number(req.query.maxResults || req.body?.maxResults || 10))
    );

    try {
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(
        q
      )}`;
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (listRes.status === 401 || listRes.status === 403) {
        return res.status(401).json({
          ok: false,
          error: 'NEEDS_GOOGLE_AUTH',
          status: listRes.status,
          messages: gmailNotificationsByUser.get(userKey) || [],
        });
      }

      if (!listRes.ok) {
        return res.status(listRes.status).json({
          ok: false,
          error: `Gmail API returned ${listRes.status}`,
          messages: gmailNotificationsByUser.get(userKey) || [],
        });
      }

      const listData: any = await listRes.json();
      const rawMessages: { id: string }[] = Array.isArray(listData.messages)
        ? listData.messages.slice(0, maxResults)
        : [];

      const detailed = await Promise.all(
        rawMessages.map(async (m) => {
          try {
            const msgRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
                m.id
              )}?format=full`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (!msgRes.ok) return null;
            const msg: any = await msgRes.json();
            const headers: { name: string; value: string }[] =
              msg.payload?.headers || [];
            const getHeader = (name: string) =>
              headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
                ?.value || '';

            const labelIds: string[] = Array.isArray(msg.labelIds)
              ? msg.labelIds
              : [];
            const isUnread = labelIds.includes('UNREAD');
            const bodyText = extractGmailBodyText(msg.payload).slice(0, 1200);

            return classifyGmailMessage({
              id: String(msg.id),
              subject: getHeader('Subject') || '(No subject)',
              from: getHeader('From') || 'Gmail Inbox',
              snippet: msg.snippet || '',
              date: getHeader('Date') || '',
              bodyText,
              isUnread,
              internalDate: msg.internalDate,
            });
          } catch {
            return null;
          }
        })
      );

      const notifications = detailed.filter(
        (d): d is GmailNotificationItem => d !== null
      );

      if (userKey) {
        gmailNotificationsByUser.set(userKey, notifications);
      }

      return res.json({
        ok: true,
        polledAt: new Date().toISOString(),
        messages: notifications,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to poll Gmail API',
        messages: gmailNotificationsByUser.get(userKey) || [],
      });
    }
  };

  app.get('/api/gmail/poll', (req, res) => {
    void handleGmailPoll(req, res);
  });

  app.post('/api/gmail/poll', (req, res) => {
    void handleGmailPoll(req, res);
  });

  app.get('/api/gmail/notifications', (req, res) => {
    const userKey = String(req.query.email || 'default')
      .trim()
      .toLowerCase();
    res.json({
      ok: true,
      messages: gmailNotificationsByUser.get(userKey) || [],
    });
  });

  // POST /api/seed -> seeds Google Calendar demo EVENTS ONLY when events table is empty. NEVER seeds tasks.
  app.post('/api/seed', (_req, res) => {
    if (eventsStore.size === 0) {
      const seeded = buildSeedEvents(new Date());
      for (const ev of seeded) {
        eventsStore.set(ev.id, ev);
      }
    }
    const events = Array.from(eventsStore.values());
    res.json({ seeded: true, events });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence Focus OS server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
