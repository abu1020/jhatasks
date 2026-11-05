import type {
  Attachment,
  PriorityLevel,
  RecurrenceType,
  Subtask,
  Task,
  TaskStatus,
  WorkspaceType,
} from '../db/schema';
import { addDaysStr, formatHumanDate, formatLocalDate, formatTime12h, getTodayStr, parseLocalDate } from './dateUtils';

export interface ParsedTokenChip {
  kind: 'workspace' | 'priority' | 'date' | 'time' | 'recurrence' | 'estimate' | 'tag';
  label: string;
  raw: string;
}

export interface NLPParseResult {
  cleanTitle: string;
  workspace?: WorkspaceType;
  priority?: PriorityLevel;
  due_date?: string;
  due_time?: string;
  recurrence?: RecurrenceType;
  estimated_minutes?: number;
  tags: string[];
  chips: ParsedTokenChip[];
}

export interface GmailNotificationItem {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  category: 'otp' | 'urgent' | 'email';
  otpCode: string | null;
  read: boolean;
  receivedAt: string;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function nextWeekdayDate(fromDateStr: string, targetDay: number, forceNextWeek: boolean): string {
  const d = parseLocalDate(fromDateStr);
  const currentDay = d.getDay();
  let delta = (targetDay - currentDay + 7) % 7;
  if (delta === 0 || forceNextWeek) {
    delta += 7;
  }
  d.setDate(d.getDate() + delta);
  return formatLocalDate(d);
}

export function parseTaskInput(rawInput: string, today: string = getTodayStr()): NLPParseResult {
  let working = rawInput;
  const tags: string[] = [];
  const chips: ParsedTokenChip[] = [];
  let workspace: WorkspaceType | undefined;
  let priority: PriorityLevel | undefined;
  let due_date: string | undefined;
  let due_time: string | undefined;
  let recurrence: RecurrenceType | undefined;
  let estimated_minutes: number | undefined;

  const stripMatch = (matchStr: string) => {
    working = working.replace(matchStr, ' ');
  };

  // 1. Workspace & hashtags (#work/#office -> office, #personal/#home -> personal, other #tag -> tag)
  const hashRegex = /(?:^|\s)(#([a-zA-Z0-9_-]+))/g;
  let m: RegExpExecArray | null;
  while ((m = hashRegex.exec(rawInput)) !== null) {
    const full = m[1];
    const token = m[2].toLowerCase();
    if (token === 'work' || token === 'office') {
      workspace = 'office';
      chips.push({ kind: 'workspace', label: 'Office', raw: full });
    } else if (token === 'personal' || token === 'home') {
      workspace = 'personal';
      chips.push({ kind: 'workspace', label: 'Personal', raw: full });
    } else {
      if (!tags.includes(token)) tags.push(token);
      chips.push({ kind: 'tag', label: `#${token}`, raw: full });
    }
    stripMatch(full);
  }

  // 2. @context -> tag
  const contextRegex = /(?:^|\s)(@([a-zA-Z0-9_-]+))/g;
  while ((m = contextRegex.exec(rawInput)) !== null) {
    const full = m[1];
    const token = m[2].toLowerCase();
    if (!tags.includes(token)) tags.push(token);
    chips.push({ kind: 'tag', label: `@${token}`, raw: full });
    stripMatch(full);
  }

  // 3. Priority (!urgent/!high/!medium/!low and !p1–!p4)
  const prioRegex = /(?:^|\s)(!(urgent|high|medium|med|low|p1|p2|p3|p4))\b/i;
  const prioMatch = working.match(prioRegex);
  if (prioMatch) {
    const full = prioMatch[1];
    const pToken = prioMatch[2].toLowerCase();
    const map: Record<string, { level: PriorityLevel; label: string }> = {
      urgent: { level: 1, label: 'Urgent' },
      p1: { level: 1, label: 'Urgent' },
      high: { level: 2, label: 'High' },
      p2: { level: 2, label: 'High' },
      medium: { level: 3, label: 'Medium' },
      med: { level: 3, label: 'Medium' },
      p3: { level: 3, label: 'Medium' },
      low: { level: 4, label: 'Low' },
      p4: { level: 4, label: 'Low' },
    };
    if (map[pToken]) {
      priority = map[pToken].level;
      chips.push({ kind: 'priority', label: map[pToken].label, raw: full });
      stripMatch(full);
    }
  }

  // 4. Recurrence: every day|weekdays|week|month, daily/weekly/monthly
  const recRegex = /\b(every\s+(day|weekday|weekdays|week|month)|daily|weekdays|weekly|monthly)\b/i;
  const recMatch = working.match(recRegex);
  if (recMatch) {
    const full = recMatch[0];
    const norm = full.toLowerCase();
    if (norm.includes('weekday')) {
      recurrence = 'weekdays';
      chips.push({ kind: 'recurrence', label: 'Weekdays', raw: full });
    } else if (norm.includes('week')) {
      recurrence = 'weekly';
      chips.push({ kind: 'recurrence', label: 'Weekly', raw: full });
    } else if (norm.includes('month')) {
      recurrence = 'monthly';
      chips.push({ kind: 'recurrence', label: 'Monthly', raw: full });
    } else {
      recurrence = 'daily';
      chips.push({ kind: 'recurrence', label: 'Daily', raw: full });
    }
    stripMatch(full);
  }

  // 5. Estimate: "for 45m" / "for 1h30m" / "~2h" / "for 2h" / "~45m"
  const estRegex = /(?:^|\s)((?:for\s+|~)(?:(\d+)\s*h(?:ours?|r)?)?\s*(?:(\d+)\s*m(?:ins?|inutes?)?)?)(?=\s|$)/i;
  const estMatch = working.match(estRegex);
  if (estMatch && (estMatch[2] || estMatch[3])) {
    const full = estMatch[1];
    const hrs = Number(estMatch[2] || 0);
    const mins = Number(estMatch[3] || 0);
    const total = hrs * 60 + mins;
    if (total > 0) {
      estimated_minutes = total;
      chips.push({ kind: 'estimate', label: `${total}m`, raw: full });
      stripMatch(full);
    }
  }

  // 6. Dates: day after tomorrow, tomorrow, today, tonight, eod, next week, eow, in N days, next <weekday>, <weekday>, M/D(/YYYY)
  const datePatterns: { regex: RegExp; resolve: (match: RegExpMatchArray) => { date: string; time?: string } }[] = [
    {
      regex: /\bday\s+after\s+tomorrow\b/i,
      resolve: () => ({ date: addDaysStr(today, 2) }),
    },
    {
      regex: /\btomorrow\b/i,
      resolve: () => ({ date: addDaysStr(today, 1) }),
    },
    {
      regex: /\btonight\b/i,
      resolve: () => ({ date: today, time: '20:00' }),
    },
    {
      regex: /\beod\b/i,
      resolve: () => ({ date: today, time: '17:00' }),
    },
    {
      regex: /\btoday\b/i,
      resolve: () => ({ date: today }),
    },
    {
      regex: /\bnext\s+week\b/i,
      resolve: () => ({ date: addDaysStr(today, 7) }),
    },
    {
      regex: /\beow\b/i,
      resolve: () => ({ date: nextWeekdayDate(today, 5, false) }),
    },
    {
      regex: /\bin\s+(\d+)\s+days?\b/i,
      resolve: (mt) => ({ date: addDaysStr(today, Number(mt[1])) }),
    },
    {
      regex: /\bnext\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i,
      resolve: (mt) => ({ date: nextWeekdayDate(today, WEEKDAYS[mt[1].toLowerCase()], true) }),
    },
    {
      regex: /\b(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i,
      resolve: (mt) => ({ date: nextWeekdayDate(today, WEEKDAYS[mt[1].toLowerCase()], false) }),
    },
    {
      regex: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
      resolve: (mt) => {
        const month = Number(mt[1]);
        const day = Number(mt[2]);
        const baseYear = parseLocalDate(today).getFullYear();
        let year = mt[3] ? Number(mt[3]) : baseYear;
        if (year < 100) year += 2000;
        const d = new Date(year, month - 1, day);
        return { date: formatLocalDate(d) };
      },
    },
  ];

  for (const pat of datePatterns) {
    const mt = working.match(pat.regex);
    if (mt) {
      const resolved = pat.resolve(mt);
      due_date = resolved.date;
      chips.push({ kind: 'date', label: formatHumanDate(due_date, today), raw: mt[0] });
      if (resolved.time && !due_time) {
        due_time = resolved.time;
        chips.push({ kind: 'time', label: formatTime12h(due_time), raw: mt[0] });
      }
      stripMatch(mt[0]);
      break;
    }
  }

  // 7. Time: "at 3pm" / "at 3:30pm" / "15:00" / "3:30pm" / "at 14:30"
  const timeRegex = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i;
  const timeMatch = working.match(timeRegex);
  if (timeMatch) {
    const full = timeMatch[0];
    let hours = 0;
    let minutes = 0;
    if (timeMatch[3]) {
      hours = Number(timeMatch[1]);
      minutes = Number(timeMatch[2] || 0);
      const meridiem = timeMatch[3].toLowerCase();
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
    } else {
      hours = Number(timeMatch[4]);
      minutes = Number(timeMatch[5]);
    }
    due_time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    chips.push({ kind: 'time', label: formatTime12h(due_time), raw: full });
    if (!due_date) {
      due_date = today;
      chips.push({ kind: 'date', label: 'Today', raw: 'today' });
    }
    stripMatch(full);
  }

  const cleanTitle = working.replace(/\s+/g, ' ').trim();

  return {
    cleanTitle,
    workspace,
    priority,
    due_date,
    due_time,
    recurrence,
    estimated_minutes,
    tags,
    chips,
  };
}

/**
 * Parses a Google Tasks v1 JSON file or API payload into Cadence Task[] schema.
 * Supports:
 * - { kind: "tasks#tasks", items: [...] }
 * - { kind: "tasks#taskLists", items: [{ items: [...] }] } (Google Takeout format)
 * - Direct array of Google Tasks v1 items or Cadence tasks
 * - Parent/child subtask hierarchy via `parent` ID
 * - Markdown checklist items `- [ ]` / `- [x]` inside `notes`
 * - Links array `links: [{ type, description, link }]` -> `attachments`
 */
export function parseGoogleTasksV1Json(
  rawInput: string | unknown,
  options: {
    defaultWorkspace?: WorkspaceType;
    baseSortOrder?: number;
    todayStr?: string;
  } = {}
): Task[] {
  const defaultWs = options.defaultWorkspace ?? 'office';
  const baseOrder = options.baseSortOrder ?? 0;
  const today = options.todayStr ?? getTodayStr();

  let parsed: any = rawInput;
  if (typeof rawInput === 'string') {
    parsed = JSON.parse(rawInput);
  }
  if (!parsed) return [];

  let rawItems: any[] = [];
  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (Array.isArray(parsed.items)) {
    // Check if this is Google Takeout taskLists wrapper: items: [{ kind: 'tasks#tasks', title: 'My Tasks', items: [...] }]
    const isTaskListsWrapper = parsed.items.some(
      (entry: any) => entry && Array.isArray(entry.items)
    );
    if (isTaskListsWrapper) {
      for (const listEntry of parsed.items) {
        if (Array.isArray(listEntry?.items)) {
          const listTitle = String(listEntry.title || '').toLowerCase();
          const listWs: WorkspaceType =
            listTitle.includes('personal') || listTitle.includes('home')
              ? 'personal'
              : defaultWs;
          for (const sub of listEntry.items) {
            rawItems.push({ ...sub, _inferredWorkspace: listWs });
          }
        }
      }
    } else {
      rawItems = parsed.items;
    }
  } else if (Array.isArray(parsed.tasks)) {
    rawItems = parsed.tasks;
  }

  // Separate parent tasks and child tasks (`parent` property in Google Tasks v1)
  const itemIds = new Set(
    rawItems
      .map((it) => (it && typeof it.id === 'string' ? it.id : null))
      .filter(Boolean)
  );
  const childrenByParent = new Map<string, any[]>();
  const topLevelItems: any[] = [];

  for (const item of rawItems) {
    if (!item || typeof item.title !== 'string' || !item.title.trim()) continue;
    if (item.deleted === true) continue;
    if (typeof item.parent === 'string' && itemIds.has(item.parent)) {
      const arr = childrenByParent.get(item.parent) || [];
      arr.push(item);
      childrenByParent.set(item.parent, arr);
    } else {
      topLevelItems.push(item);
    }
  }

  // Sort by Google Tasks v1 lexicographical `position` field when present
  topLevelItems.sort((a, b) => {
    if (typeof a.position === 'string' && typeof b.position === 'string') {
      return a.position.localeCompare(b.position);
    }
    return 0;
  });

  const nowIso = new Date().toISOString();

  return topLevelItems.map((it, idx): Task => {
    const rawTitle = String(it.title).trim();
    const nlp = parseTaskInput(rawTitle, today);
    const cleanTitle = nlp.cleanTitle || rawTitle;

    // Parse RFC3339 due date & time
    let dueDate: string | null = nlp.due_date ?? null;
    let dueTime: string | null = nlp.due_time ?? null;
    if (typeof it.due_date === 'string') {
      dueDate = it.due_date;
    } else if (typeof it.due === 'string' && it.due.length >= 10) {
      dueDate = it.due.slice(0, 10);
      const timePart = it.due.slice(11, 16);
      if (timePart && timePart !== '00:00' && /^\d{2}:\d{2}$/.test(timePart)) {
        dueTime = timePart;
      }
    }
    if (typeof it.due_time === 'string') {
      dueTime = it.due_time;
    }

    const description = String(it.notes ?? it.description ?? '');

    // Extract subtasks from child tasks + markdown checklists in notes
    const subtasks: Subtask[] = Array.isArray(it.subtasks)
      ? it.subtasks.map((s: any, sIdx: number) => ({
          id: String(s.id || `sub_${idx}_${sIdx}`),
          title: String(s.title || '').trim(),
          done: Boolean(s.done),
        }))
      : [];

    if (typeof it.id === 'string' && childrenByParent.has(it.id)) {
      const children = [...(childrenByParent.get(it.id) || [])].sort((a, b) => {
        if (typeof a.position === 'string' && typeof b.position === 'string') {
          return a.position.localeCompare(b.position);
        }
        return 0;
      });
      children.forEach((child, cIdx) => {
        subtasks.push({
          id: String(child.id || `gtask_sub_${idx}_${cIdx}`).replace(/[^a-zA-Z0-9_-]/g, '_'),
          title: String(child.title || '').trim(),
          done: child.status === 'completed' || child.status === 'done',
        });
      });
    }

    if (subtasks.length === 0 && description) {
      const checklistRegex = /^[-*]\s+\[([ xX])\]\s+(.+)$/gm;
      let cm: RegExpExecArray | null;
      let cIdx = 0;
      while ((cm = checklistRegex.exec(description)) !== null) {
        subtasks.push({
          id: `note_sub_${idx}_${cIdx++}`,
          title: cm[2].trim(),
          done: cm[1].toLowerCase() === 'x',
        });
      }
    }

    // Extract attachments from Google Tasks `links` or `attachments`
    const attachments: Attachment[] = Array.isArray(it.attachments)
      ? it.attachments
      : Array.isArray(it.links)
      ? it.links
          .filter((l: any) => l && typeof l.link === 'string')
          .map((l: any, lIdx: number): Attachment => {
            const rawType = String(l.type || '').toLowerCase();
            const rawUrl = String(l.link);
            let kind: Attachment['kind'] = 'link';
            if (rawType === 'doc' || rawUrl.includes('docs.google.com/document')) kind = 'doc';
            else if (rawType === 'sheet' || rawUrl.includes('docs.google.com/spreadsheets')) kind = 'sheet';
            else if (rawType === 'slide' || rawUrl.includes('docs.google.com/presentation')) kind = 'slide';
            else if (rawType === 'pdf' || rawUrl.endsWith('.pdf')) kind = 'pdf';
            else if (rawType === 'image') kind = 'image';
            return {
              id: `gtlink_${idx}_${lIdx}`,
              kind,
              name: String(l.description || l.type || 'Google Task Link'),
              url: rawUrl,
            };
          })
      : [];

    const isCompleted = it.status === 'completed' || it.status === 'done';
    const status: TaskStatus = isCompleted
      ? 'done'
      : ['todo', 'in_progress', 'in_review', 'done'].includes(it.status)
      ? it.status
      : 'todo';

    const priority: PriorityLevel =
      typeof it.priority === 'number' && it.priority >= 1 && it.priority <= 4
        ? (it.priority as PriorityLevel)
        : nlp.priority ?? 3;

    const workspace: WorkspaceType =
      it.workspace === 'personal' || it.workspace === 'office'
        ? it.workspace
        : nlp.workspace ?? it._inferredWorkspace ?? defaultWs;

    const mergedTags = Array.from(
      new Set([
        'google-tasks',
        ...(Array.isArray(it.tags) ? it.tags.map(String) : []),
        ...nlp.tags,
      ])
    );

    const rawId =
      typeof it.id === 'string' && it.id.trim()
        ? `gtask_${it.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}`
        : `gtask_${Date.now().toString(36)}_${idx}`;

    return {
      id: rawId,
      title: cleanTitle,
      description,
      workspace,
      status,
      priority,
      important: Boolean(it.important ?? (priority === 1 || priority === 2)),
      quadrant: it.quadrant ?? null,
      due_date: dueDate ?? today,
      due_time: dueTime,
      tags: mergedTags,
      subtasks,
      attachments,
      recurrence: it.recurrence ?? nlp.recurrence ?? null,
      estimated_minutes:
        typeof it.estimated_minutes === 'number'
          ? it.estimated_minutes
          : nlp.estimated_minutes ?? 30,
      actual_minutes: Number(it.actual_minutes) || 0,
      sort_order: baseOrder + (idx + 1) * 1000,
      source: 'google-tasks',
      created_at:
        typeof it.updated === 'string'
          ? it.updated
          : typeof it.created_at === 'string'
          ? it.created_at
          : nowIso,
      completed_at: isCompleted
        ? typeof it.completed === 'string'
          ? it.completed
          : typeof it.completed_at === 'string'
          ? it.completed_at
          : nowIso
        : null,
    };
  });
}

/**
 * Extracts a 4-8 digit OTP / Verification / 2FA code from email subject + snippet
 */
export function extractOtpFromText(text: string): string | null {
  if (!text) return null;
  const hasOtpContext =
    /\b(otp|verification|verify|passcode|security\s+code|login\s+code|2fa|two-factor|one-time|auth(?:entication)?\s+code|confirm(?:ation)?\s+code|pin\s+code|code\s+is)\b/i.test(
      text
    );
  if (!hasOtpContext) return null;

  // Match hyphenated 6-digit e.g. 482-910 or 4 to 8 digit codes
  const hyphenMatch = text.match(/\b(\d{3}-\d{3})\b/);
  if (hyphenMatch) {
    return hyphenMatch[1].replace('-', '');
  }

  // Find all 4-8 digit sequences and exclude likely years (2020-2035) unless preceded by "code"
  const explicitAfterKeyword = text.match(
    /(?:code|otp|passcode|pin)(?:\s+is|\s*[:#-])?\s*\b(\d{4,8})\b/i
  );
  if (explicitAfterKeyword) {
    return explicitAfterKeyword[1];
  }

  const candidates = Array.from(text.matchAll(/\b(\d{4,8})\b/g)).map((m) => m[1]);
  for (const cand of candidates) {
    const num = Number(cand);
    if (cand.length === 4 && num >= 2020 && num <= 2035) continue;
    return cand;
  }
  return null;
}

export function formatEmailRelativeDate(
  dateHeader: string,
  internalDate?: number | string
): string {
  const ts =
    internalDate != null && !Number.isNaN(Number(internalDate))
      ? Number(internalDate)
      : dateHeader
      ? Date.parse(dateHeader)
      : NaN;
  if (!Number.isNaN(ts) && ts > 0) {
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return dateHeader || 'Just now';
}

export function classifyGmailMessage(msg: {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  bodyText?: string;
  isUnread?: boolean;
  internalDate?: number | string;
}): GmailNotificationItem {
  const combined = `${msg.subject} ${msg.snippet} ${msg.bodyText || ''}`;
  const otpCode = extractOtpFromText(combined);
  const isUrgent =
    Boolean(otpCode) ||
    /\b(urgent|action\s+required|immediate|security\s+alert|alert|overdue|sign-off|important)\b/i.test(
      combined
    );

  const receivedIso =
    msg.internalDate != null && !Number.isNaN(Number(msg.internalDate))
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString();

  return {
    id: msg.id,
    subject: msg.subject || '(No subject)',
    from: msg.from || 'Gmail Inbox',
    snippet: msg.snippet || (msg.bodyText ? msg.bodyText.slice(0, 180) : ''),
    date: formatEmailRelativeDate(msg.date, msg.internalDate),
    category: otpCode ? 'otp' : isUrgent ? 'urgent' : 'email',
    otpCode,
    read: msg.isUnread !== undefined ? !msg.isUnread : false,
    receivedAt: receivedIso,
  };
}

/**
 * Bidirectional Google Sheets row conversion helpers
 */
export const GOOGLE_SHEETS_HEADERS = [
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

export function tasksToSheetRows(tasks: Task[]): string[][] {
  return [
    GOOGLE_SHEETS_HEADERS,
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

export function tasksToCsv(tasks: Task[]): string {
  const rows = tasksToSheetRows(tasks);
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');
}

export function tasksToTsv(tasks: Task[]): string {
  const rows = tasksToSheetRows(tasks);
  return rows.map((row) => row.map((c) => String(c ?? '').replace(/\t/g, ' ')).join('\t')).join('\n');
}

export function parseCsvOrTsvToRows(rawText: string): string[][] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  const isTsv = lines[0].includes('\t');
  return lines.map((line) => {
    if (isTsv) {
      return line.split('\t').map((c) => c.trim());
    }
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

export function sheetRowsToTasks(
  rows: string[][],
  todayStr: string = getTodayStr(),
  baseSortOrder = 0
): Task[] {
  if (!rows || rows.length === 0) return [];
  const firstRowLower = rows[0].map((c) => String(c || '').toLowerCase().trim());
  const hasHeader =
    firstRowLower.includes('title') ||
    firstRowLower.includes('task') ||
    firstRowLower.includes('status');

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const colIdx = (names: string[], fallback: number) => {
    if (!hasHeader) return fallback;
    const idx = firstRowLower.findIndex((h) => names.includes(h));
    return idx >= 0 ? idx : fallback;
  };

  const idIdx = colIdx(['id', 'task id'], 0);
  const titleIdx = colIdx(['title', 'task', 'name', 'summary'], hasHeader ? 1 : 0);
  const wsIdx = colIdx(['workspace', 'mode', 'category'], 2);
  const statusIdx = colIdx(['status', 'state'], 3);
  const prioIdx = colIdx(['priority', 'urgency'], 4);
  const dateIdx = colIdx(['due date', 'due_date', 'due', 'date'], 5);
  const timeIdx = colIdx(['due time', 'due_time', 'time'], 6);
  const tagsIdx = colIdx(['tags', 'labels'], 7);
  const estIdx = colIdx(['estimated mins', 'estimated_minutes', 'estimate'], 8);
  const sourceIdx = colIdx(['source'], 9);
  const notesIdx = colIdx(['notes', 'description', 'details'], 10);

  const nowIso = new Date().toISOString();

  return dataRows
    .map((row, idx): Task | null => {
      const rawTitle = String(row[titleIdx] ?? '').trim();
      if (!rawTitle) return null;

      const rawId = String(row[idIdx] ?? '').trim();
      const rawWs = String(row[wsIdx] ?? '').toLowerCase().trim();
      const rawStatus = String(row[statusIdx] ?? '').toLowerCase().trim();
      const rawPrio = String(row[prioIdx] ?? '').toLowerCase().trim();
      const rawDate = String(row[dateIdx] ?? '').trim();
      const rawTime = String(row[timeIdx] ?? '').trim();
      const rawTags = String(row[tagsIdx] ?? '').trim();
      const rawEst = String(row[estIdx] ?? '').trim();
      const rawSource = String(row[sourceIdx] ?? '').toLowerCase().trim();
      const rawNotes = String(row[notesIdx] ?? '').trim();

      const workspace: WorkspaceType = rawWs === 'personal' ? 'personal' : 'office';
      let status: TaskStatus = 'todo';
      if (rawStatus === 'done' || rawStatus === 'completed' || rawStatus === 'complete') {
        status = 'done';
      } else if (rawStatus === 'in_progress' || rawStatus === 'in progress' || rawStatus === 'doing') {
        status = 'in_progress';
      } else if (rawStatus === 'in_review' || rawStatus === 'in review' || rawStatus === 'review') {
        status = 'in_review';
      }

      let priority: PriorityLevel = 3;
      if (rawPrio === '1' || rawPrio.startsWith('urg')) priority = 1;
      else if (rawPrio === '2' || rawPrio.startsWith('high')) priority = 2;
      else if (rawPrio === '3' || rawPrio.startsWith('med')) priority = 3;
      else if (rawPrio === '4' || rawPrio.startsWith('low')) priority = 4;

      const tags = rawTags
        ? rawTags
            .split(/[,;]/)
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : ['sheets-sync'];

      const source: Task['source'] = ['manual', 'gmail', 'google-tasks', 'quick-add'].includes(
        rawSource
      )
        ? (rawSource as Task['source'])
        : 'google-tasks';

      return {
        id:
          rawId && /^[a-zA-Z0-9_-]+$/.test(rawId)
            ? rawId
            : `sheet_${Date.now().toString(36)}_${idx}`,
        title: rawTitle,
        description: rawNotes,
        workspace,
        status,
        priority,
        important: priority === 1 || priority === 2,
        quadrant: null,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayStr,
        due_time: /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : null,
        tags,
        subtasks: [],
        attachments: [],
        recurrence: null,
        estimated_minutes: rawEst && !Number.isNaN(Number(rawEst)) ? Number(rawEst) : 30,
        actual_minutes: 0,
        sort_order: baseSortOrder + (idx + 1) * 1000,
        source,
        created_at: nowIso,
        completed_at: status === 'done' ? nowIso : null,
      };
    })
    .filter((t): t is Task => t !== null);
}

