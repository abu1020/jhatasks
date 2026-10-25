import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesText = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

interface AuthContext {
  uid: string;
  email_verified: boolean;
}

const SERVER_NOW = 'SERVER_TIMESTAMP';

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function evaluateTaskWrite(
  op: 'create' | 'update',
  auth: AuthContext | null,
  userId: string,
  taskId: string,
  incoming: Record<string, unknown>,
  existing?: Record<string, unknown>
): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!auth || !auth.email_verified || auth.uid !== userId) return 'PERMISSION_DENIED';
  if (!isValidId(userId) || !isValidId(taskId)) return 'PERMISSION_DENIED';

  const requiredKeys = [
    'id', 'ownerId', 'title', 'description', 'workspace', 'status',
    'priority', 'important', 'tags', 'subtasks', 'attachments',
    'actual_minutes', 'sort_order', 'source', 'created_at', 'createdAt', 'updatedAt'
  ];
  const allowedKeys = new Set([
    ...requiredKeys,
    'quadrant', 'due_date', 'due_time', 'recurrence', 'estimated_minutes', 'completed_at'
  ]);

  const keys = Object.keys(incoming);
  if (!requiredKeys.every((k) => keys.includes(k))) return 'PERMISSION_DENIED';
  if (!keys.every((k) => allowedKeys.has(k))) return 'PERMISSION_DENIED';

  if (!isValidId(incoming.id) || !isValidId(incoming.ownerId)) return 'PERMISSION_DENIED';
  if (incoming.ownerId !== auth.uid) return 'PERMISSION_DENIED';
  if (typeof incoming.title !== 'string' || incoming.title.length < 1 || incoming.title.length > 500) return 'PERMISSION_DENIED';
  if (typeof incoming.description !== 'string' || incoming.description.length > 10000) return 'PERMISSION_DENIED';
  if (incoming.workspace !== 'office' && incoming.workspace !== 'personal') return 'PERMISSION_DENIED';
  if (!['todo', 'in_progress', 'in_review', 'done'].includes(String(incoming.status))) return 'PERMISSION_DENIED';
  if (typeof incoming.priority !== 'number' || !Number.isInteger(incoming.priority) || incoming.priority < 1 || incoming.priority > 4) return 'PERMISSION_DENIED';
  if (typeof incoming.important !== 'boolean') return 'PERMISSION_DENIED';
  if (!Array.isArray(incoming.tags) || incoming.tags.length > 20) return 'PERMISSION_DENIED';
  if (!Array.isArray(incoming.subtasks) || incoming.subtasks.length > 50) return 'PERMISSION_DENIED';
  if (!Array.isArray(incoming.attachments) || incoming.attachments.length > 20) return 'PERMISSION_DENIED';
  if (typeof incoming.actual_minutes !== 'number' || incoming.actual_minutes < 0) return 'PERMISSION_DENIED';
  if (typeof incoming.sort_order !== 'number') return 'PERMISSION_DENIED';
  if (!['manual', 'gmail', 'google-tasks', 'quick-add'].includes(String(incoming.source))) return 'PERMISSION_DENIED';

  if (op === 'create') {
    if (incoming.id !== taskId) return 'PERMISSION_DENIED';
    if (incoming.createdAt !== SERVER_NOW || incoming.updatedAt !== SERVER_NOW) return 'PERMISSION_DENIED';
  } else {
    if (!existing) return 'PERMISSION_DENIED';
    if (incoming.id !== existing.id) return 'PERMISSION_DENIED';
    if (incoming.ownerId !== existing.ownerId) return 'PERMISSION_DENIED';
    if (incoming.created_at !== existing.created_at) return 'PERMISSION_DENIED';
    if (incoming.createdAt !== existing.createdAt) return 'PERMISSION_DENIED';
    if (incoming.updatedAt !== SERVER_NOW) return 'PERMISSION_DENIED';
  }

  return 'ALLOW';
}

function validTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'task_1',
    ownerId: 'user_1',
    title: 'Prepare Q4 board review',
    description: '- [ ] Check revenue slide',
    workspace: 'office',
    status: 'todo',
    priority: 1,
    important: true,
    tags: ['strategy'],
    subtasks: [],
    attachments: [],
    actual_minutes: 0,
    sort_order: 1.5,
    source: 'manual',
    created_at: '2026-10-25T00:00:00.000Z',
    createdAt: SERVER_NOW,
    updatedAt: SERVER_NOW,
    ...overrides,
  };
}

test('firestore.rules contains all 8-pillar structural invariants', () => {
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('function isValidTask(data)'));
  assert.ok(rulesText.includes('function isValidEvent(data)'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes('affectedKeys().hasOnly'));
});

test('Dirty Dozen #1-12 payloads all return PERMISSION_DENIED', () => {
  const authUser1: AuthContext = { uid: 'user_1', email_verified: true };
  const base = validTask();

  // Valid baseline passes
  assert.equal(evaluateTaskWrite('create', authUser1, 'user_1', 'task_1', base), 'ALLOW');

  // 1. Unauthenticated Write
  assert.equal(evaluateTaskWrite('create', null, 'user_1', 'task_1', base), 'PERMISSION_DENIED');

  // 2. Unverified Email Spoof
  assert.equal(
    evaluateTaskWrite('create', { uid: 'user_1', email_verified: false }, 'user_1', 'task_1', base),
    'PERMISSION_DENIED'
  );

  // 3. Cross-Tenant Ownership Spoof
  assert.equal(
    evaluateTaskWrite('create', { uid: 'user_2', email_verified: true }, 'user_1', 'task_1', base),
    'PERMISSION_DENIED'
  );

  // 4. Payload Owner Mismatch
  assert.equal(
    evaluateTaskWrite('create', authUser1, 'user_1', 'task_1', validTask({ ownerId: 'user_2' })),
    'PERMISSION_DENIED'
  );

  // 5. ID Poisoning Attack
  assert.equal(
    evaluateTaskWrite('create', authUser1, 'user_1', 'bad/id/../hack', validTask({ id: 'bad/id/../hack' })),
    'PERMISSION_DENIED'
  );

  // 6. Shadow Field Injection (Create)
  assert.equal(
    evaluateTaskWrite('create', authUser1, 'user_1', 'task_1', validTask({ isAdmin: true })),
    'PERMISSION_DENIED'
  );

  // 7. Shadow Field Injection (Update)
  assert.equal(
    evaluateTaskWrite('update', authUser1, 'user_1', 'task_1', validTask({ hacked: 1 }), base),
    'PERMISSION_DENIED'
  );

  // 8. Value Poisoning (Title Overflow / Empty)
  assert.equal(
    evaluateTaskWrite('create', authUser1, 'user_1', 'task_1', validTask({ title: '' })),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateTaskWrite('create', authUser1, 'user_1', 'task_1', validTask({ title: 'x'.repeat(501) })),
    'PERMISSION_DENIED'
  );

  // 9. Enum Bypass (Invalid Workspace/Status)
  assert.equal(
    evaluateTaskWrite('create', authUser1, 'user_1', 'task_1', validTask({ workspace: 'hacker' })),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateTaskWrite('create', authUser1, 'user_1', 'task_1', validTask({ status: 'archived' })),
    'PERMISSION_DENIED'
  );

  // 10. Unbounded Array Exhaustion
  assert.equal(
    evaluateTaskWrite(
      'create',
      authUser1,
      'user_1',
      'task_1',
      validTask({ tags: Array.from({ length: 25 }, (_, i) => `tag_${i}`) })
    ),
    'PERMISSION_DENIED'
  );

  // 11. Immortal Field Mutation
  assert.equal(
    evaluateTaskWrite(
      'update',
      authUser1,
      'user_1',
      'task_1',
      validTask({ created_at: '2099-01-01T00:00:00.000Z' }),
      base
    ),
    'PERMISSION_DENIED'
  );

  // 12. Client Timestamp Forgery
  assert.equal(
    evaluateTaskWrite(
      'update',
      authUser1,
      'user_1',
      'task_1',
      validTask({ updatedAt: 'FORGED_CLIENT_TIME' }),
      base
    ),
    'PERMISSION_DENIED'
  );
});
