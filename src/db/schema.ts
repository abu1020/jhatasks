import { pgTable, text, integer, boolean, jsonb, doublePrecision } from 'drizzle-orm/pg-core';

export type WorkspaceType = 'office' | 'personal';
export type WorkspaceFilter = 'all' | 'office' | 'personal';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type PriorityLevel = 1 | 2 | 3 | 4;
export type QuadrantType = 'do' | 'schedule' | 'delegate' | 'eliminate';
export type RecurrenceType = 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type TaskSource = 'manual' | 'gmail' | 'google-tasks' | 'quick-add';
export type ViewId = 'my_day' | 'board' | 'list' | 'calendar' | 'matrix' | 'insights';
export type CalendarMode = 'month' | 'week' | 'day';

export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Attachment {
  id: string;
  kind: 'doc' | 'sheet' | 'slide' | 'pdf' | 'image' | 'link';
  name: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  workspace: WorkspaceType;
  status: TaskStatus;
  priority: PriorityLevel;
  important: boolean;
  quadrant: QuadrantType | null;
  due_date: string | null;
  due_time: string | null;
  tags: string[];
  subtasks: Subtask[];
  attachments: Attachment[];
  recurrence: RecurrenceType | null;
  estimated_minutes: number | null;
  actual_minutes: number;
  sort_order: number;
  source: TaskSource;
  created_at: string;
  completed_at: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  source: string;
  color: string | null;
  meet_link: string | null;
  location: string | null;
}

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  workspace: text('workspace').notNull(),
  status: text('status').notNull().default('todo'),
  priority: integer('priority').notNull().default(4),
  important: boolean('important').notNull().default(false),
  quadrant: text('quadrant'),
  due_date: text('due_date'),
  due_time: text('due_time'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  subtasks: jsonb('subtasks').$type<Subtask[]>().notNull().default([]),
  attachments: jsonb('attachments').$type<Attachment[]>().notNull().default([]),
  recurrence: text('recurrence'),
  estimated_minutes: integer('estimated_minutes'),
  actual_minutes: integer('actual_minutes').notNull().default(0),
  sort_order: doublePrecision('sort_order').notNull().default(0),
  source: text('source').notNull().default('manual'),
  created_at: text('created_at').notNull(),
  completed_at: text('completed_at'),
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: text('date').notNull(),
  start_time: text('start_time').notNull(),
  end_time: text('end_time').notNull(),
  source: text('source').notNull().default('google'),
  color: text('color'),
  meet_link: text('meet_link'),
  location: text('location'),
});

export const PRIORITY_META: Record<
  PriorityLevel,
  { label: string; shortLabel: string; color: string; bg: string; border: string }
> = {
  1: {
    label: 'Urgent',
    shortLabel: 'Urg',
    color: '#F43F5E',
    bg: 'rgba(244, 63, 94, 0.12)',
    border: 'rgba(244, 63, 94, 0.32)',
  },
  2: {
    label: 'High',
    shortLabel: 'High',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.32)',
  },
  3: {
    label: 'Medium',
    shortLabel: 'Med',
    color: '#06B6D4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.32)',
  },
  4: {
    label: 'Low',
    shortLabel: 'Low',
    color: '#64748B',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.28)',
  },
};

export const STATUS_META: Record<
  TaskStatus,
  { label: string; color: string; bg: string }
> = {
  todo: { label: 'To Do', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.14)' },
  in_progress: { label: 'In Progress', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.14)' },
  in_review: { label: 'In Review', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.14)' },
  done: { label: 'Done', color: '#10B981', bg: 'rgba(16, 185, 129, 0.14)' },
};
