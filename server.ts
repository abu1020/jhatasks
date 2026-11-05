import express from 'express';
import { randomBytes } from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CalendarEvent, Task, TaskStatus, WorkspaceType, PriorityLevel, RecurrenceType } from './src/db/schema.ts';
import {
  classifyGmailMessage,
  parseCsvOrTsvToRows,
  type GmailNotificationItem,
} from './src/lib/nlpParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anonymous browser sessions isolate the local fallback store; never share task rows across visitors.
interface CadenceSession {
  id: string;
  tasks: Map<string, Task>;
  events: Map<string, CalendarEvent>;
  lastSeenAt: number;
  gmailWindowStartedAt: number;
  gmailPollCount: number;
  lastSheetSyncState: { spreadsheetId: string; lastSyncedAt: string | null; syncedCount: number };
}
const sessions = new Map<string, CadenceSession>();
const SESSION_COOKIE = 'cadence_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSession(res: express.Response): CadenceSession {
  return res.locals.cadenceSession as CadenceSession;
}

function createSession(): CadenceSession {
  const id = randomBytes(32).toString('base64url');
  const session: CadenceSession = {
    id, tasks: new Map(), events: new Map(), lastSeenAt: Date.now(),
    gmailWindowStartedAt: Date.now(), gmailPollCount: 0,
    lastSheetSyncState: { spreadsheetId: 'cadence-master-tasks-sheet', lastSyncedAt: null, syncedCount: 0 },
  };
  sessions.set(id, session);
  return session;
}

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


const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];
const WORKSPACES: WorkspaceType[] = ['office', 'personal'];
const PRIORITIES: PriorityLevel[] = [1, 2, 3, 4];
const RECURRENCES: RecurrenceType[] = ['daily', 'weekdays', 'weekly', 'monthly'];
const QUADRANTS = ['do', 'schedule', 'delegate', 'eliminate'];
const TASK_KEYS = new Set([
  'id', 'title', 'description', 'workspace', 'status', 'priority', 'important', 'quadrant',
  'due_date', 'due_time', 'tags', 'subtasks', 'attachments', 'recurrence', 'estimated_minutes',
  'actual_minutes', 'sort_order', 'source', 'created_at', 'completed_at',
]);
const TASK_SOURCES = ['manual', 'gmail', 'google-tasks', 'quick-add'];
const ATTACHMENT_KINDS = ['doc', 'sheet', 'slide', 'pdf', 'image', 'link'];
const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number, min = 0): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function isSafeHttpUrl(value: unknown): value is string {
  if (!isBoundedString(value, 500)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isTaskPayload(value: unknown): value is Task {
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).every((key) => TASK_KEYS.has(key)) &&
    isBoundedString(value.id, 128, 1) && TASK_ID_PATTERN.test(value.id) &&
    isBoundedString(value.title, 500, 1) && value.title.trim().length > 0 &&
    isBoundedString(value.description, 10000) &&
    WORKSPACES.includes(value.workspace) && TASK_STATUSES.includes(value.status) &&
    PRIORITIES.includes(value.priority) && typeof value.important === 'boolean' &&
    (value.quadrant == null || QUADRANTS.includes(value.quadrant)) &&
    (value.due_date == null || isBoundedString(value.due_date, 32)) &&
    (value.due_time == null || isBoundedString(value.due_time, 16)) &&
    Array.isArray(value.tags) && value.tags.length <= 20 && value.tags.every((tag: unknown) => isBoundedString(tag, 64)) &&
    Array.isArray(value.subtasks) && value.subtasks.length <= 50 && value.subtasks.every((subtask: unknown) =>
      isRecord(subtask) && isBoundedString(subtask.id, 64, 1) && isBoundedString(subtask.title, 300) && typeof subtask.done === 'boolean'
    ) &&
    Array.isArray(value.attachments) && value.attachments.length <= 20 && value.attachments.every((attachment: unknown) =>
      isRecord(attachment) && isBoundedString(attachment.id, 64, 1) && ATTACHMENT_KINDS.includes(attachment.kind) &&
      isBoundedString(attachment.name, 300) && isSafeHttpUrl(attachment.url)
    ) &&
    (value.recurrence == null || RECURRENCES.includes(value.recurrence)) &&
    (value.estimated_minutes == null || (Number.isInteger(value.estimated_minutes) && value.estimated_minutes >= 0 && value.estimated_minutes <= 10080)) &&
    Number.isFinite(value.actual_minutes) && value.actual_minutes >= 0 && value.actual_minutes <= 100000 &&
    Number.isFinite(value.sort_order) &&
    TASK_SOURCES.includes(value.source) && isBoundedString(value.created_at, 64, 1) &&
    (value.completed_at == null || isBoundedString(value.completed_at, 64))
  );
}

const TASK_PATCH_KEYS = new Set([
  'title', 'description', 'workspace', 'status', 'priority', 'important', 'quadrant',
  'due_date', 'due_time', 'tags', 'subtasks', 'attachments', 'recurrence',
  'estimated_minutes', 'actual_minutes', 'sort_order', 'source', 'completed_at',
]);

function escapeCsvCell(value: unknown): string {
  let cell = String(value ?? '');
  // Prevent formula injection when task data is opened in spreadsheet software.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb', strict: true }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Session-bound local fallback data plus same-origin checks prevent cross-visitor reads/writes.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    const requestHost = req.get('host');
    if (req.path.startsWith('/api/') && origin) {
      try {
        if (new URL(origin).host.toLowerCase() !== String(requestHost).toLowerCase()) {
          return res.status(403).json({ error: 'Cross-origin API request blocked' });
        }
      } catch {
        return res.status(403).json({ error: 'Invalid request origin' });
      }
    }

    const cookieHeader = req.headers.cookie || '';
    const sessionCookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    const sessionId = sessionCookie?.slice(SESSION_COOKIE.length + 1);
    let session = sessionId ? sessions.get(sessionId) : undefined;
    if (session && Date.now() - session.lastSeenAt > SESSION_TTL_MS) {
      sessions.delete(session.id);
      session = undefined;
    }
    if (!session) {
      session = createSession();
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.append('Set-Cookie', `${SESSION_COOKIE}=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`);
    }
    session.lastSeenAt = Date.now();
    res.locals.cadenceSession = session;

    if (sessions.size > 5000) {
      const cutoff = Date.now() - SESSION_TTL_MS;
      for (const [key, item] of sessions) {
        if (item.lastSeenAt < cutoff || sessions.size > 5000) sessions.delete(key);
        if (sessions.size <= 4500) break;
      }
    }
    next();
  });

  // GET /api/health -> { ok: true }
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, query: 'select 1' });
  });

  // GET /api/tasks -> { tasks, events }
  app.get('/api/tasks', (_req, res) => {
    const tasks = Array.from(getSession(res).tasks.values()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const events = Array.from(getSession(res).events.values()).sort((a, b) =>
      `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`)
    );
    res.json({ tasks, events });
  });

  // POST /api/tasks -> validate the complete batch before mutating the store.
  app.post('/api/tasks', (req, res) => {
    const incoming: unknown = req.body?.tasks;
    if (!Array.isArray(incoming) || incoming.length > 1000) {
      return res.status(400).json({ error: 'tasks must be an array with at most 1000 items' });
    }
    if (!incoming.every(isTaskPayload)) {
      return res.status(400).json({ error: 'One or more tasks have invalid fields' });
    }

    const saved = incoming.map((task) => ({ ...task, title: task.title.trim() }));
    for (const task of saved) getSession(res).tasks.set(task.id, task);
    res.status(201).json({ tasks: saved });
  });

  // PATCH /api/tasks/:id -> partial task patch (supports fractional double sort_order).
  app.patch('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const patch: unknown = req.body;
    if (!TASK_ID_PATTERN.test(id) || !isRecord(patch) || Object.keys(patch).length === 0 ||
        Object.keys(patch).some((key) => !TASK_PATCH_KEYS.has(key))) {
      return res.status(400).json({ error: 'Invalid task id or patch fields' });
    }

    const existing = getSession(res).tasks.get(id);
    const fallback: Task = existing || {
      id,
      title: 'Untitled task',
      description: '',
      workspace: 'office',
      status: 'todo',
      priority: 3,
      important: false,
      quadrant: null,
      due_date: null,
      due_time: null,
      tags: [],
      subtasks: [],
      attachments: [],
      recurrence: null,
      estimated_minutes: null,
      actual_minutes: 0,
      sort_order: 0,
      source: 'manual',
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    const updated = { ...fallback, ...patch } as Task;
    updated.title = updated.title.trim();
    if (!isTaskPayload(updated)) {
      return res.status(400).json({ error: 'Task update contains invalid values' });
    }
    getSession(res).tasks.set(id, updated);
    return res.json({ task: updated });
  });

  // DELETE /api/tasks/:id
  app.delete('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    if (!TASK_ID_PATTERN.test(id)) return res.status(400).json({ error: 'Invalid task id' });
    getSession(res).tasks.delete(id);
    res.json({ ok: true, id });
  });

  // PUT /api/tasks/:id -> validated full replacement update for task CRUD.
  app.put('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const body: unknown = req.body;
    if (!TASK_ID_PATTERN.test(id) || !isRecord(body) || (body.id !== undefined && body.id !== id)) {
      return res.status(400).json({ error: 'Invalid task id or payload' });
    }
    const existing = getSession(res).tasks.get(id);
    const candidate = { ...(existing || {}), ...body, id };
    if (!isTaskPayload(candidate)) {
      return res.status(400).json({ error: 'Task payload contains invalid values' });
    }
    const updated = { ...candidate, title: candidate.title.trim() };
    getSession(res).tasks.set(id, updated);
    return res.json({ task: updated });
  });

  // Live Google Sheets CSV feed for =IMPORTDATA() and 1-click Sheet export


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
    const tasks = Array.from(getSession(res).tasks.values()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const rows = buildTasksCsvRows(tasks);
    const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="cadence-google-tasks-sheet.csv"');
    res.send(csv);
  });

  app.get('/api/sheets/sync', async (req, res) => {
    const spreadsheetId = String(req.query.spreadsheetId || '').trim();
    if (spreadsheetId && !/^[a-zA-Z0-9_-]{1,256}$/.test(spreadsheetId)) {
      return res.status(400).json({ error: 'Invalid spreadsheet id' });
    }
    if (spreadsheetId && spreadsheetId !== 'cadence-master-tasks-sheet') {
      try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
          spreadsheetId
        )}/gviz/tq?tqx=out:csv`;
        const resp = await fetch(gvizUrl, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
          const text = await resp.text();
          if (text.length > 1_000_000) return res.status(413).json({ error: 'Spreadsheet response is too large' });
          const rows = parseCsvOrTsvToRows(text);
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
    const tasks = Array.from(getSession(res).tasks.values()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const rows = buildTasksCsvRows(tasks);
    return res.json({
      ok: true,
      spreadsheetId: spreadsheetId || getSession(res).lastSheetSyncState.spreadsheetId,
      rows,
      syncedCount: tasks.length,
      lastSyncedAt: getSession(res).lastSheetSyncState.lastSyncedAt || new Date().toISOString(),
    });
  });

  app.post('/api/sheets/sync', (req, res) => {
    const incoming: unknown = req.body?.tasks;
    const incomingTasks = Array.isArray(incoming) ? incoming : Array.from(getSession(res).tasks.values());
    const spreadsheetId = String(
      req.body?.spreadsheetId || getSession(res).lastSheetSyncState.spreadsheetId || 'cadence-master-tasks-sheet'
    ).trim();
    if (!/^[a-zA-Z0-9_-]{1,256}$/.test(spreadsheetId) || incomingTasks.length > 1000 ||
        !incomingTasks.every(isTaskPayload)) {
      return res.status(400).json({ error: 'Invalid spreadsheet sync payload' });
    }

    for (const item of incomingTasks) getSession(res).tasks.set(item.id, item);

    getSession(res).lastSheetSyncState = {
      spreadsheetId,
      lastSyncedAt: new Date().toISOString(),
      syncedCount: incomingTasks.length,
    };

    res.json({
      ok: true,
      ...getSession(res).lastSheetSyncState,
      rows: buildTasksCsvRows(incomingTasks),
    });
  });

  // Real-time Gmail API Polling Cloud Function / Endpoint (/api/gmail/poll)
  const handleGmailPoll = async (req: express.Request, res: express.Response) => {
    const session = getSession(res);
    const now = Date.now();
    if (now - session.gmailWindowStartedAt >= 60_000) {
      session.gmailWindowStartedAt = now;
      session.gmailPollCount = 0;
    }
    if (session.gmailPollCount >= 12) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ ok: false, error: 'Gmail polling rate limit reached', messages: [] });
    }
    session.gmailPollCount++;

    const authHeader = String(req.headers.authorization || '');
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const token = bearerToken || String(req.body?.accessToken || '').trim();
    if (!token || token.length > 4096) {
      return res.status(401).json({
        ok: false,
        error: 'NEEDS_GOOGLE_AUTH',
        messages: [],
      });
    }

    const q = String(req.query.q || req.body?.q || 'in:inbox').trim();
    const requestedResults = Number(req.query.maxResults || req.body?.maxResults || 10);
    if (q.length > 200 || !Number.isFinite(requestedResults)) {
      return res.status(400).json({ ok: false, error: 'Invalid Gmail search parameters', messages: [] });
    }
    const maxResults = Math.min(15, Math.max(1, Math.floor(requestedResults)));

    try {
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(
        q
      )}`;
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });

      if (listRes.status === 401 || listRes.status === 403) {
        return res.status(401).json({
          ok: false,
          error: 'NEEDS_GOOGLE_AUTH',
          status: listRes.status,
          messages: [],
        });
      }

      if (!listRes.ok) {
        return res.status(listRes.status).json({
          ok: false,
          error: `Gmail API returned ${listRes.status}`,
          messages: [],
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
                signal: AbortSignal.timeout(10000),
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

      return res.json({
        ok: true,
        polledAt: new Date().toISOString(),
        messages: notifications,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to poll Gmail API',
        messages: [],
      });
    }
  };

  app.get('/api/gmail/poll', (req, res) => {
    void handleGmailPoll(req, res);
  });

  app.post('/api/gmail/poll', (req, res) => {
    void handleGmailPoll(req, res);
  });

  app.get('/api/gmail/notifications', (_req, res) => {
    // Mail snippets and OTP codes stay in the signed-in browser, never in a shared server cache.
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, messages: [] });
  });

  // POST /api/seed -> seeds Google Calendar demo EVENTS ONLY when events table is empty. NEVER seeds tasks.
  app.post('/api/seed', (_req, res) => {
    if (getSession(res).events.size === 0) {
      const seeded = buildSeedEvents(new Date());
      for (const ev of seeded) {
        getSession(res).events.set(ev.id, ev);
      }
    }
    const events = Array.from(getSession(res).events.values());
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
