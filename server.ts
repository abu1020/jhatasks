import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import type { CalendarEvent, Task } from './src/db/schema.ts';
import {
  classifyGmailMessage,
  parseCsvOrTsvToRows,
  type GmailNotificationItem,
} from './src/lib/nlpParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anonymous browser sessions isolate the guest-mode in-memory data. This is not an
// authentication mechanism: signed-in users' durable data remains protected by Firestore rules.
interface SessionData {
  tasks: Map<string, Task>;
  events: Map<string, CalendarEvent>;
  lastSheetSyncState: { spreadsheetId: string; lastSyncedAt: string | null; syncedCount: number };
  requestWindowStartedAt: number;
  requestCount: number;
  gmailWindowStartedAt: number;
  gmailPollCount: number;
}
const sessions = new Map<string, SessionData>();
const SESSION_COOKIE = 'cadence_session';
const MAX_SESSIONS = 1000;
const MAX_TASKS_PER_SESSION = 2000;
const FEED_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FEED_TOKENS = 1000;
const feedTokens = new Map<string, { sessionId: string; expiresAt: number }>();
const feedRateLimits = new Map<string, { windowStartedAt: number; count: number }>();

function newSession(): SessionData {
  return {
    tasks: new Map(),
    events: new Map(),
    lastSheetSyncState: { spreadsheetId: 'cadence-master-tasks-sheet', lastSyncedAt: null, syncedCount: 0 },
    requestWindowStartedAt: Date.now(),
    requestCount: 0,
    gmailWindowStartedAt: Date.now(),
    gmailPollCount: 0,
  };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value);
}

function isValidSpreadsheetId(value: string): boolean {
  return value.length >= 10 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value);
}

function normalizeTask(value: unknown): Task | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Partial<Task>;
  if (!validId(input.id) || typeof input.title !== 'string') return null;
  const title = input.title.trim();
  if (!title || title.length > 500) return null;
  const description = typeof input.description === 'string' ? input.description : '';
  if (description.length > 10000) return null;
  const priority = Number(input.priority);
  const sortOrder = Number(input.sort_order);
  if (!Number.isInteger(priority) || priority < 1 || priority > 4 || !Number.isFinite(sortOrder)) return null;
  const tags = Array.isArray(input.tags) && input.tags.length <= 20 && input.tags.every((tag) => typeof tag === 'string' && tag.length <= 64) ? input.tags : null;
  const subtasks = Array.isArray(input.subtasks) && input.subtasks.length <= 50 && input.subtasks.every((item) => item && validId(item.id) && typeof item.title === 'string' && item.title.length <= 300 && typeof item.done === 'boolean') ? input.subtasks : null;
  const attachmentKinds = ['doc', 'sheet', 'slide', 'pdf', 'image', 'link'];
  const attachments = Array.isArray(input.attachments) && input.attachments.length <= 20 && input.attachments.every((item) => item && validId(item.id) && typeof item.name === 'string' && item.name.length <= 300 && typeof item.url === 'string' && item.url.length <= 500 && attachmentKinds.includes(item.kind)) ? input.attachments : null;
  const statuses: Task['status'][] = ['todo', 'in_progress', 'in_review', 'done'];
  const sources: Task['source'][] = ['manual', 'gmail', 'google-tasks', 'quick-add'];
  const quadrants: NonNullable<Task['quadrant']>[] = ['do', 'schedule', 'delegate', 'eliminate'];
  const recurrences: NonNullable<Task['recurrence']>[] = ['daily', 'weekdays', 'weekly', 'monthly'];
  if (!tags || !subtasks || !attachments || !statuses.includes(input.status as Task['status']) ||
      !sources.includes(input.source as Task['source']) || typeof input.important !== 'boolean' ||
      (input.quadrant != null && !quadrants.includes(input.quadrant as NonNullable<Task['quadrant']>)) ||
      (input.recurrence != null && !recurrences.includes(input.recurrence as NonNullable<Task['recurrence']>))) return null;
  return {
    id: input.id,
    title,
    description,
    workspace: input.workspace === 'personal' ? 'personal' : 'office',
    status: statuses.includes(input.status as Task['status']) ? input.status as Task['status'] : 'todo',
    priority: priority as Task['priority'],
    important: Boolean(input.important),
    quadrant: input.quadrant ?? null,
    due_date: typeof input.due_date === 'string' && input.due_date.length <= 32 ? input.due_date : null,
    due_time: typeof input.due_time === 'string' && input.due_time.length <= 16 ? input.due_time : null,
    tags,
    subtasks,
    attachments,
    recurrence: input.recurrence ?? null,
    estimated_minutes: Number.isInteger(input.estimated_minutes) && Number(input.estimated_minutes) >= 0 && Number(input.estimated_minutes) <= 10080 ? Number(input.estimated_minutes) : null,
    actual_minutes: Number.isInteger(input.actual_minutes) && Number(input.actual_minutes) >= 0 ? Math.min(Number(input.actual_minutes), 100000) : 0,
    sort_order: sortOrder,
    source: sources.includes(input.source as Task['source']) ? input.source as Task['source'] : 'manual',
    created_at: typeof input.created_at === 'string' && input.created_at.length <= 64 ? input.created_at : new Date().toISOString(),
    completed_at: typeof input.completed_at === 'string' && input.completed_at.length <= 64 ? input.completed_at : null,
  };
}

function sessionFor(res: express.Response): SessionData {
  return res.locals.session as SessionData;
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

export const app = express();

async function startServer() {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    // Reject browser-originated cross-site writes. SameSite cookies are a second layer.
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: 'Cross-site request denied' });
    }
    const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    let sessionId = cookie?.slice(SESSION_COOKIE.length + 1) || '';
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(sessionId)) {
      sessionId = randomBytes(32).toString('base64url');
      const secure = req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
      res.append('Set-Cookie', `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
    }
    // The UID header separates accounts that share a browser cookie. It is only a namespace;
    // the cookie remains the unguessable capability and durable data is still protected by Firestore.
    const requestedUid = String(req.get('x-cadence-user') || 'anonymous');
    const uidScope = /^[A-Za-z0-9._:-]{1,128}$/.test(requestedUid) ? requestedUid : 'anonymous';
    const sessionScope = `${sessionId}:${uidScope}`;
    if (!sessions.has(sessionScope)) {
      if (sessions.size >= MAX_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (oldest) sessions.delete(oldest);
      }
      sessions.set(sessionScope, newSession());
    } else {
      // Refresh insertion order as a simple bounded LRU for ephemeral account sessions.
      const value = sessions.get(sessionScope)!;
      sessions.delete(sessionScope);
      sessions.set(sessionScope, value);
    }
    const session = sessions.get(sessionScope)!;
    res.locals.sessionId = sessionScope;
    res.locals.session = session;
    if (req.path.startsWith('/api/')) {
      const now = Date.now();
      if (now - session.requestWindowStartedAt >= 60_000) {
        session.requestWindowStartedAt = now;
        session.requestCount = 0;
      }
      session.requestCount += 1;
      if (session.requestCount > 120) return res.status(429).json({ error: 'Rate limit exceeded' });
      if (req.path === '/api/gmail/poll') {
        if (now - session.gmailWindowStartedAt >= 60_000) {
          session.gmailWindowStartedAt = now;
          session.gmailPollCount = 0;
        }
        session.gmailPollCount += 1;
        if (session.gmailPollCount > 12) return res.status(429).json({ error: 'Gmail polling rate limit exceeded' });
      }
    }
    next();
  });
  app.use(express.json({ limit: '512kb', strict: true }));

  // This process currently uses bounded, ephemeral in-memory guest storage.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, storage: 'ephemeral-session' });
  });

  // GET /api/tasks -> { tasks, events }
  app.get('/api/tasks', (_req, res) => {
    const tasks = Array.from(sessionFor(res).tasks.values()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const events = Array.from(sessionFor(res).events.values()).sort((a, b) =>
      `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`)
    );
    res.json({ tasks, events });
  });

  // POST /api/tasks -> accept { tasks: Task[] }
  app.post('/api/tasks', (req, res) => {
    if (!Array.isArray(req.body?.tasks) || req.body.tasks.length > MAX_TASKS_PER_SESSION) {
      return res.status(400).json({ error: 'tasks must be an array with at most 2000 items' });
    }
    const saved = (req.body.tasks as unknown[]).map(normalizeTask);
    if (saved.some((task) => !task)) return res.status(400).json({ error: 'Invalid task payload' });
    const tasks = saved as Task[];
    const newIds = new Set(tasks.map((task) => task.id).filter((id) => !sessionFor(res).tasks.has(id)));
    if (sessionFor(res).tasks.size + newIds.size > MAX_TASKS_PER_SESSION) {
      return res.status(413).json({ error: 'Session task limit reached' });
    }
    for (const task of tasks) sessionFor(res).tasks.set(task.id, task);
    return res.status(201).json({ tasks });
  });

  // PATCH /api/tasks/:id -> partial task patch (supports fractional double sort_order)
  app.patch('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    if (!validId(id) || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid task id or patch' });
    }
    const allowed = new Set(['title', 'description', 'workspace', 'status', 'priority', 'important', 'quadrant', 'due_date', 'due_time', 'tags', 'subtasks', 'attachments', 'recurrence', 'estimated_minutes', 'actual_minutes', 'sort_order', 'source', 'created_at', 'completed_at']);
    if (Object.keys(req.body).some((key) => !allowed.has(key))) {
      return res.status(400).json({ error: 'Task patch contains unsupported fields' });
    }
    const existing = sessionFor(res).tasks.get(id);
    if (!existing && sessionFor(res).tasks.size >= MAX_TASKS_PER_SESSION) {
      return res.status(413).json({ error: 'Session task limit reached' });
    }
    const candidate = {
      ...(existing || {
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
      }),
      ...req.body,
      id,
    };
    const updated = normalizeTask(candidate);
    if (!updated) return res.status(400).json({ error: 'Invalid task payload' });
    sessionFor(res).tasks.set(id, updated);
    return res.json({ task: updated });
  });

  // DELETE /api/tasks/:id
  app.delete('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ error: 'Invalid task id' });
    sessionFor(res).tasks.delete(id);
    return res.json({ ok: true, id });
  });

  // PUT /api/tasks/:id -> full replacement update for task CRUD
  app.put('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    if (!validId(id) || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid task id or task payload' });
    }
    const existing = sessionFor(res).tasks.get(id);
    if (!existing && sessionFor(res).tasks.size >= MAX_TASKS_PER_SESSION) {
      return res.status(413).json({ error: 'Session task limit reached' });
    }
    const updated = normalizeTask({
      ...(existing || {
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
      }),
      ...req.body,
      id,
    });
    if (!updated) return res.status(400).json({ error: 'Invalid task payload' });
    sessionFor(res).tasks.set(id, updated);
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

  app.get('/api/tasks/sheets-feed.csv', (req, res) => {
    const token = String(req.query.token || '');
    const grant = feedTokens.get(token);
    if (!grant || token.length !== 43) return res.status(401).send('Invalid or expired feed link');
    if (grant.expiresAt <= Date.now() || !sessions.has(grant.sessionId)) {
      feedTokens.delete(token);
      return res.status(410).send('Feed link has expired');
    }
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const rate = feedRateLimits.get(ip) || { windowStartedAt: now, count: 0 };
    if (now - rate.windowStartedAt >= 60_000) {
      rate.windowStartedAt = now;
      rate.count = 0;
    }
    rate.count += 1;
    if (!feedRateLimits.has(ip) && feedRateLimits.size >= 5000) {
      const oldestIp = feedRateLimits.keys().next().value;
      if (oldestIp) feedRateLimits.delete(oldestIp);
    }
    feedRateLimits.set(ip, rate);
    if (rate.count > 60) return res.status(429).send('Feed rate limit exceeded');

    const ownerSession = sessions.get(grant.sessionId)!;
    const tasks = Array.from(ownerSession.tasks.values()).sort((a, b) => a.sort_order - b.sort_order);
    const csv = buildTasksCsvRows(tasks)
      .map((row) => row.map((cell) => {
        let value = String(cell ?? '');
        // Prevent spreadsheet formula execution when opening exported CSV files.
        if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
        return value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')
          ? `"${value.replace(/"/g, '""')}"`
          : value;
      }).join(','))
      .join('\n');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="cadence-google-tasks-sheet.csv"');
    return res.send(csv);
  });

  // Mint a seven-day read-only capability link for Google Sheets IMPORTDATA.
  app.post('/api/tasks/sheets-feed-token', (req, res) => {
    const sessionId = String(res.locals.sessionId || '');
    for (const [token, grant] of feedTokens) {
      if (grant.sessionId === sessionId || grant.expiresAt <= Date.now()) feedTokens.delete(token);
    }
    if (feedTokens.size >= MAX_FEED_TOKENS) {
      const oldest = feedTokens.keys().next().value;
      if (oldest) feedTokens.delete(oldest);
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + FEED_TOKEN_TTL_MS;
    feedTokens.set(token, { sessionId, expiresAt });
    return res.status(201).json({ path: `/api/tasks/sheets-feed.csv?token=${token}`, expiresAt });
  });

  app.get('/api/sheets/sync', async (req, res) => {
    const spreadsheetId = String(req.query.spreadsheetId || '').trim();
    if (spreadsheetId && spreadsheetId !== 'cadence-master-tasks-sheet') {
      if (!isValidSpreadsheetId(spreadsheetId)) return res.status(400).json({ error: 'Invalid spreadsheet id' });
      try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
        const resp = await fetch(gvizUrl, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
          const text = await resp.text();
          if (text.length > 2_000_000) return res.status(413).json({ error: 'Spreadsheet export exceeds 2 MB' });
          const rows = parseCsvOrTsvToRows(text);
          return res.json({ ok: true, spreadsheetId, rows, lastSyncedAt: new Date().toISOString() });
        }
      } catch {
        // Fall back to this browser session's task data when a public Sheet is unavailable.
      }
    }
    const tasks = Array.from(sessionFor(res).tasks.values()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const rows = buildTasksCsvRows(tasks);
    return res.json({
      ok: true,
      spreadsheetId: spreadsheetId || sessionFor(res).lastSheetSyncState.spreadsheetId,
      rows,
      syncedCount: tasks.length,
      lastSyncedAt: sessionFor(res).lastSheetSyncState.lastSyncedAt || new Date().toISOString(),
    });
  });

  app.post('/api/sheets/sync', (req, res) => {
    const rawTasks = Array.isArray(req.body?.tasks) ? req.body.tasks : Array.from(sessionFor(res).tasks.values());
    if (rawTasks.length > MAX_TASKS_PER_SESSION) return res.status(400).json({ error: 'Too many tasks' });
    const spreadsheetId = String(req.body?.spreadsheetId || sessionFor(res).lastSheetSyncState.spreadsheetId).trim();
    if (spreadsheetId !== 'cadence-master-tasks-sheet' && !isValidSpreadsheetId(spreadsheetId)) {
      return res.status(400).json({ error: 'Invalid spreadsheet id' });
    }
    const incomingTasks: Task[] = [];
    for (const rawTask of rawTasks as unknown[]) {
      const task = normalizeTask(rawTask);
      if (!task) return res.status(400).json({ error: 'Invalid task payload' });
      incomingTasks.push(task);
    }
    for (const task of incomingTasks) sessionFor(res).tasks.set(task.id, task);
    sessionFor(res).lastSheetSyncState = {
      spreadsheetId,
      lastSyncedAt: new Date().toISOString(),
      syncedCount: incomingTasks.length,
    };
    return res.json({ ok: true, ...sessionFor(res).lastSheetSyncState, rows: buildTasksCsvRows(incomingTasks) });
  });

  // Real-time Gmail API Polling Cloud Function / Endpoint (/api/gmail/poll)
  const handleGmailPoll = async (req: express.Request, res: express.Response) => {
    const authHeader = String(req.headers.authorization || '');
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const token = bearerToken;

    if (!token || token.length > 4096) {
      return res.status(401).json({
        ok: false,
        error: 'NEEDS_GOOGLE_AUTH',
        messages: [],
      });
    }

    const q = String(req.query.q || req.body?.q || 'in:inbox').trim().slice(0, 500);
    const requestedMax = Number(req.query.maxResults || req.body?.maxResults || 10);
    const maxResults = Number.isFinite(requestedMax) ? Math.min(15, Math.max(1, Math.floor(requestedMax))) : 10;

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

  app.post('/api/gmail/poll', (req, res) => {
    void handleGmailPoll(req, res);
  });

  // POST /api/seed -> seeds Google Calendar demo EVENTS ONLY when events table is empty. NEVER seeds tasks.
  app.post('/api/seed', (_req, res) => {
    if (sessionFor(res).events.size === 0) {
      const seeded = buildSeedEvents(new Date());
      for (const ev of seeded) {
        sessionFor(res).events.set(ev.id, ev);
      }
    }
    const events = Array.from(sessionFor(res).events.values());
    res.json({ seeded: true, events });
  });

  // Avoid accidentally serving the SPA HTML for misspelled API routes, and never expose parser stacks.
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 400;
    return res.status(status).json({ error: status === 413 ? 'Request payload too large' : 'Invalid API request' });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));

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
