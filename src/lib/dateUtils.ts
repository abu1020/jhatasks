import type { CalendarEvent, QuadrantType, RecurrenceType, Task } from '../db/schema';

export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayStr(now: Date = new Date()): string {
  return formatLocalDate(now);
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

export function addMonthsStr(dateStr: string, months: number): string {
  const d = parseLocalDate(dateStr);
  d.setMonth(d.getMonth() + months);
  return formatLocalDate(d);
}

export function getStartOfWeekMonday(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalDate(d);
}

export function getMonthGridDates(dateStr: string): string[] {
  const d = parseLocalDate(dateStr);
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const startMonday = getStartOfWeekMonday(formatLocalDate(firstOfMonth));
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const dates: string[] = [];
  let cursor = startMonday;
  for (let i = 0; i < 42; i++) {
    dates.push(cursor);
    cursor = addDaysStr(cursor, 1);
    if (dates.length === 35 && cursor > formatLocalDate(lastOfMonth)) {
      break;
    }
  }
  return dates;
}

export function formatHumanDate(dateStr: string | null, today: string = getTodayStr()): string {
  if (!dateStr) return 'No date';
  if (dateStr === today) return 'Today';
  if (dateStr === addDaysStr(today, 1)) return 'Tomorrow';
  if (dateStr === addDaysStr(today, -1)) return 'Yesterday';
  const d = parseLocalDate(dateStr);
  const nowYear = parseLocalDate(today).getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== nowYear ? { year: 'numeric' } : {}),
  });
}

export function formatTime12h(time24: string | null): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr || 0);
  if (Number.isNaN(h)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function timeToMinutes(time24: string): number {
  const [h, m] = time24.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(totalMins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getLocalTimezoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date());
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value;
    return tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Local';
  }
}

export function getGreetingByHour(hour: number = new Date().getHours()): string {
  if (hour < 5) return 'Late night focus';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Shared completion formula used by BOTH the Topbar progress ring and My Day view:
 * Denominator = (open tasks due today) + (all tasks completed today)
 * Numerator = (all tasks completed today)
 */
export function computeTodayProgress(
  tasks: Task[],
  today: string = getTodayStr()
): { completedTodayCount: number; openDueTodayCount: number; totalCount: number; percentage: number } {
  let completedTodayCount = 0;
  let openDueTodayCount = 0;

  for (const t of tasks) {
    const completedDate = t.completed_at ? formatLocalDate(new Date(t.completed_at)) : null;
    if (t.status === 'done' && (completedDate === today || t.due_date === today)) {
      completedTodayCount++;
    } else if (t.status !== 'done' && t.due_date === today) {
      openDueTodayCount++;
    }
  }

  const totalCount = completedTodayCount + openDueTodayCount;
  const percentage = totalCount === 0 ? 0 : Math.round((completedTodayCount / totalCount) * 100);
  return { completedTodayCount, openDueTodayCount, totalCount, percentage };
}

export function deriveQuadrant(task: Task, today: string = getTodayStr()): QuadrantType {
  if (task.quadrant) return task.quadrant;
  const isUrgent =
    task.priority === 1 ||
    (task.due_date !== null && task.due_date <= addDaysStr(today, 1));
  const isImportant = task.important || task.priority <= 2;

  if (isUrgent && isImportant) return 'do';
  if (!isUrgent && isImportant) return 'schedule';
  if (isUrgent && !isImportant) return 'delegate';
  return 'eliminate';
}

export function nextRecurrenceDate(currentDateStr: string | null, recurrence: RecurrenceType, today: string = getTodayStr()): string {
  const base = currentDateStr || today;
  if (recurrence === 'daily') return addDaysStr(base, 1);
  if (recurrence === 'weekly') return addDaysStr(base, 7);
  if (recurrence === 'monthly') return addMonthsStr(base, 1);
  // weekdays
  let next = addDaysStr(base, 1);
  while (true) {
    const day = parseLocalDate(next).getDay();
    if (day !== 0 && day !== 6) return next;
    next = addDaysStr(next, 1);
  }
}

export function computeStreakDays(tasks: Task[], today: string = getTodayStr()): number {
  const completedDates = new Set<string>();
  for (const t of tasks) {
    if (t.status === 'done' && t.completed_at) {
      completedDates.add(formatLocalDate(new Date(t.completed_at)));
    }
  }
  if (completedDates.size === 0) return 0;

  let streak = 0;
  let cursor = completedDates.has(today) ? today : addDaysStr(today, -1);
  while (completedDates.has(cursor)) {
    streak++;
    cursor = addDaysStr(cursor, -1);
  }
  return streak;
}

export interface PositionedBlock<T> {
  item: T;
  startMin: number;
  endMin: number;
  colIndex: number;
  colCount: number;
}

/**
 * Overlap layout per collision cluster:
 * Assigns columns locally per connected cluster of overlapping intervals,
 * so unrelated morning and afternoon events never shrink each other.
 */
export function layoutCollisionClusters<T>(
  items: { item: T; startMin: number; endMin: number }[]
): PositionedBlock<T>[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const clusters: { item: T; startMin: number; endMin: number }[][] = [];
  let currentCluster: { item: T; startMin: number; endMin: number }[] = [];
  let clusterMaxEnd = -1;

  for (const entry of sorted) {
    if (currentCluster.length === 0 || entry.startMin < clusterMaxEnd) {
      currentCluster.push(entry);
      clusterMaxEnd = Math.max(clusterMaxEnd, entry.endMin);
    } else {
      clusters.push(currentCluster);
      currentCluster = [entry];
      clusterMaxEnd = entry.endMin;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const result: PositionedBlock<T>[] = [];

  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const assigned: { item: T; startMin: number; endMin: number; colIndex: number }[] = [];

    for (const entry of cluster) {
      let placedCol = -1;
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= entry.startMin) {
          placedCol = c;
          columnEnds[c] = entry.endMin;
          break;
        }
      }
      if (placedCol === -1) {
        placedCol = columnEnds.length;
        columnEnds.push(entry.endMin);
      }
      assigned.push({ ...entry, colIndex: placedCol });
    }

    const colCount = Math.max(1, columnEnds.length);
    for (const a of assigned) {
      result.push({ ...a, colCount });
    }
  }

  return result;
}

/**
 * "Plan my day" auto-scheduler:
 * Finds free 09:00–18:00 gaps around existing events and timed tasks for today,
 * and assigns start times (due_date = today, due_time = HH:MM) to unscheduled open tasks.
 */
export function computeAutoSchedulePlan(
  tasks: Task[],
  events: CalendarEvent[],
  today: string = getTodayStr()
): { id: string; due_date: string; due_time: string; estimated_minutes: number }[] {
  const occupied: { start: number; end: number }[] = [];

  for (const ev of events) {
    if (ev.date === today) {
      occupied.push({
        start: timeToMinutes(ev.start_time),
        end: Math.max(timeToMinutes(ev.start_time) + 15, timeToMinutes(ev.end_time)),
      });
    }
  }

  for (const t of tasks) {
    if (t.status !== 'done' && t.due_date === today && t.due_time) {
      const start = timeToMinutes(t.due_time);
      const dur = t.estimated_minutes || 45;
      occupied.push({ start, end: start + dur });
    }
  }

  const candidates = tasks
    .filter((t) => t.status !== 'done' && (!t.due_time || t.due_date !== today) && (t.due_date === today || !t.due_date))
    .sort((a, b) => a.priority - b.priority || a.sort_order - b.sort_order);

  const updates: { id: string; due_date: string; due_time: string; estimated_minutes: number }[] = [];
  const dayStart = 9 * 60; // 09:00
  const dayEnd = 18 * 60; // 18:00

  for (const task of candidates) {
    const duration = task.estimated_minutes || 45;
    let slotStart = dayStart;

    while (slotStart + duration <= dayEnd) {
      const slotEnd = slotStart + duration;
      const conflict = occupied.find((o) => slotStart < o.end && slotEnd > o.start);
      if (!conflict) {
        occupied.push({ start: slotStart, end: slotEnd + 10 }); // 10m buffer between blocks
        updates.push({
          id: task.id,
          due_date: today,
          due_time: minutesToTime(slotStart),
          estimated_minutes: duration,
        });
        break;
      } else {
        slotStart = Math.ceil(conflict.end / 15) * 15;
      }
    }
  }

  return updates;
}

const TAG_PALETTE = [
  { text: '#4F46E5', bg: 'rgba(79, 70, 229, 0.12)', border: 'rgba(79, 70, 229, 0.28)' },
  { text: '#059669', bg: 'rgba(5, 150, 105, 0.12)', border: 'rgba(5, 150, 105, 0.28)' },
  { text: '#0284C7', bg: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.28)' },
  { text: '#D97706', bg: 'rgba(217, 119, 6, 0.12)', border: 'rgba(217, 119, 6, 0.28)' },
  { text: '#7C3AED', bg: 'rgba(124, 58, 237, 0.12)', border: 'rgba(124, 58, 237, 0.28)' },
  { text: '#DB2777', bg: 'rgba(219, 39, 119, 0.12)', border: 'rgba(219, 39, 119, 0.28)' },
  { text: '#0D9488', bg: 'rgba(13, 148, 136, 0.12)', border: 'rgba(13, 148, 136, 0.28)' },
];

export function getTagChipStyle(tag: string): { text: string; bg: string; border: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

export function computeMidpointSortOrder(prevOrder: number | null, nextOrder: number | null): number {
  if (prevOrder === null && nextOrder === null) return 1000;
  if (prevOrder === null) return (nextOrder as number) / 2;
  if (nextOrder === null) return prevOrder + 1000;
  return (prevOrder + nextOrder) / 2;
}
