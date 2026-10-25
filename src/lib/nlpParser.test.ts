import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGmailMessage,
  extractOtpFromText,
  parseCsvOrTsvToRows,
  parseGoogleTasksV1Json,
  parseTaskInput,
  sheetRowsToTasks,
  tasksToCsv,
} from './nlpParser';
import {
  computeAutoSchedulePlan,
  computeMidpointSortOrder,
  computeTodayProgress,
  deriveQuadrant,
  layoutCollisionClusters,
} from './dateUtils';
import type { Task } from '../db/schema';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Sample Task',
    description: '',
    workspace: 'office',
    status: 'todo',
    priority: 4,
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
    sort_order: 1000,
    source: 'manual',
    created_at: '2026-10-25T08:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

test('NLP parser extracts workspace, priority, date, time, estimate, recurrence, and tags', () => {
  const res = parseTaskInput(
    'Finalize Q4 strategy deck #office !urgent tomorrow at 3:30pm for 1h30m every week #board @exec',
    '2026-10-25'
  );
  assert.equal(res.cleanTitle, 'Finalize Q4 strategy deck');
  assert.equal(res.workspace, 'office');
  assert.equal(res.priority, 1);
  assert.equal(res.due_date, '2026-10-26');
  assert.equal(res.due_time, '15:30');
  assert.equal(res.estimated_minutes, 90);
  assert.equal(res.recurrence, 'weekly');
  assert.deepEqual(res.tags, ['board', 'exec']);
});

test('Shared completion formula counts open due-today and completed-today identically', () => {
  const today = '2026-10-25';
  const tasks: Task[] = [
    makeTask({ id: '1', status: 'todo', due_date: today }),
    makeTask({ id: '2', status: 'done', due_date: today, completed_at: '2026-10-25T10:00:00.000Z' }),
    makeTask({ id: '3', status: 'done', due_date: '2026-10-20', completed_at: '2026-10-25T11:00:00.000Z' }),
    makeTask({ id: '4', status: 'todo', due_date: '2026-10-28' }),
  ];
  const stats = computeTodayProgress(tasks, today);
  assert.equal(stats.openDueTodayCount, 1);
  assert.equal(stats.completedTodayCount, 2);
  assert.equal(stats.totalCount, 3);
  assert.equal(stats.percentage, 67);
});

test('Eisenhower quadrant respects explicit persistence and falls back when null', () => {
  const today = '2026-10-25';
  const explicitTask = makeTask({ priority: 4, important: false, quadrant: 'do' });
  assert.equal(deriveQuadrant(explicitTask, today), 'do');

  const derivedDo = makeTask({ priority: 1, important: true, quadrant: null });
  assert.equal(deriveQuadrant(derivedDo, today), 'do');

  const derivedSchedule = makeTask({ priority: 2, important: true, due_date: '2026-11-10', quadrant: null });
  assert.equal(deriveQuadrant(derivedSchedule, today), 'schedule');
});

test('Collision cluster layout assigns local column counts per overlapping group', () => {
  const blocks = layoutCollisionClusters([
    { item: 'morning_a', startMin: 540, endMin: 600 },
    { item: 'morning_b', startMin: 570, endMin: 630 },
    { item: 'afternoon_solo', startMin: 840, endMin: 900 },
  ]);
  const morningA = blocks.find((b) => b.item === 'morning_a')!;
  const morningB = blocks.find((b) => b.item === 'morning_b')!;
  const afternoon = blocks.find((b) => b.item === 'afternoon_solo')!;

  assert.equal(morningA.colCount, 2);
  assert.equal(morningB.colCount, 2);
  assert.notEqual(morningA.colIndex, morningB.colIndex);
  assert.equal(afternoon.colCount, 1);
  assert.equal(afternoon.colIndex, 0);
});

test('Fractional midpoint sort_order inserts cleanly between cards', () => {
  const mid = computeMidpointSortOrder(42, 43);
  assert.equal(mid, 42.5);
});

test('Auto-scheduler plans unscheduled tasks around existing events between 09:00 and 18:00', () => {
  const today = '2026-10-25';
  const events = [
    {
      id: 'e1',
      title: 'Standup',
      date: today,
      start_time: '09:00',
      end_time: '09:30',
      source: 'google',
      color: '#4F46E5',
      meet_link: null,
      location: null,
    },
  ];
  const tasks = [makeTask({ id: 't_plan', due_date: today, due_time: null, estimated_minutes: 45 })];
  const plan = computeAutoSchedulePlan(tasks, events, today);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].due_time, '09:30');
});

test('parseGoogleTasksV1Json converts Google Tasks v1 schema with parent subtasks, links, and NLP tags', () => {
  const sampleV1 = {
    kind: 'tasks#tasks',
    items: [
      {
        kind: 'tasks#task',
        id: 'parent_101',
        title: 'Prepare Series B Board Deck #office !urgent',
        notes: 'Ensure ARR metrics are verified.\n- [x] Export cohort table\n- [ ] Review with CFO',
        status: 'needsAction',
        due: '2026-10-28T14:30:00.000Z',
        links: [
          {
            type: 'doc',
            description: 'Series B Narrative Doc',
            link: 'https://docs.google.com/document/d/123',
          },
        ],
      },
      {
        kind: 'tasks#task',
        id: 'child_102',
        parent: 'parent_101',
        title: 'Upload final PDF to data room',
        status: 'completed',
      },
    ],
  };

  const parsed = parseGoogleTasksV1Json(sampleV1, { todayStr: '2026-10-25' });
  assert.equal(parsed.length, 1);
  const task = parsed[0];
  assert.equal(task.title, 'Prepare Series B Board Deck');
  assert.equal(task.workspace, 'office');
  assert.equal(task.priority, 1);
  assert.equal(task.due_date, '2026-10-28');
  assert.equal(task.due_time, '14:30');
  assert.equal(task.source, 'google-tasks');
  assert.equal(task.subtasks.length, 1);
  assert.equal(task.subtasks[0].title, 'Upload final PDF to data room');
  assert.equal(task.subtasks[0].done, true);
  assert.equal(task.attachments.length, 1);
  assert.equal(task.attachments[0].name, 'Series B Narrative Doc');
});

test('extractOtpFromText and classifyGmailMessage detect OTP codes and avoid year false positives', () => {
  assert.equal(
    extractOtpFromText('Your Google verification code is 849201. Do not share this OTP.'),
    '849201'
  );
  assert.equal(
    extractOtpFromText('Stripe 2FA login code: 482-910 (expires in 10 minutes)'),
    '482910'
  );
  assert.equal(
    extractOtpFromText('Q4 2026 Strategy Review meeting notes attached'),
    null
  );

  const classified = classifyGmailMessage({
    id: 'msg_otp_1',
    subject: 'Your verification code is 739104',
    from: 'GitHub Security <noreply@github.com>',
    snippet: 'Use 739104 to complete two-factor authentication for your account.',
    date: 'Just now',
  });
  assert.equal(classified.category, 'otp');
  assert.equal(classified.otpCode, '739104');
  assert.equal(classified.read, false);

  const bodyOnlyOtp = classifyGmailMessage({
    id: 'msg_otp_body',
    subject: 'Sign-in verification request',
    from: 'Google Identity <no-reply@accounts.google.com>',
    snippet: 'Hi there, someone just tried to sign in to your account.',
    bodyText: 'Your one-time verification code is 592041. It expires in 5 minutes.',
    date: 'Mon, 25 Oct 2026 08:00:00 GMT',
    isUnread: false,
    internalDate: Date.now() - 120000,
  });
  assert.equal(bodyOnlyOtp.category, 'otp');
  assert.equal(bodyOnlyOtp.otpCode, '592041');
  assert.equal(bodyOnlyOtp.read, true);
  assert.equal(bodyOnlyOtp.date, '2m ago');
});

test('tasksToCsv and sheetRowsToTasks round-trip tasks cleanly for Google Sheets sync', () => {
  const original: Task[] = [
    makeTask({
      id: 'gtask_sync_1',
      title: 'Sync Google Tasks with Sheet',
      workspace: 'office',
      status: 'in_progress',
      priority: 1,
      due_date: '2026-10-25',
      due_time: '11:00',
      tags: ['google-tasks', 'sheets'],
      estimated_minutes: 45,
      source: 'google-tasks',
      description: 'Bidirectional sync verification',
    }),
  ];
  const csv = tasksToCsv(original);
  const rows = parseCsvOrTsvToRows(csv);
  const restored = sheetRowsToTasks(rows, '2026-10-25');
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, 'gtask_sync_1');
  assert.equal(restored[0].title, 'Sync Google Tasks with Sheet');
  assert.equal(restored[0].status, 'in_progress');
  assert.equal(restored[0].priority, 1);
  assert.equal(restored[0].due_time, '11:00');
});

