import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task } from '../db/schema';
import { hasAmbiguousTaskMatch, matchTasksByTitle } from './assistantUtils';

const task = (title: string) => ({ id: title, title } as Task);
const tasks = [task('Prepare launch plan'), task('Prepare launch plan review'), task('Send invoice')];

test('assistant task matching ranks exact title before partial matches', () => {
  const matches = matchTasksByTitle(tasks, '"Prepare launch plan"');
  assert.equal(matches[0]?.title, 'Prepare launch plan');
  assert.equal(hasAmbiguousTaskMatch(matches, 'Prepare launch plan'), false);
});

test('assistant asks for a clearer title when a partial task name matches multiple tasks', () => {
  const matches = matchTasksByTitle(tasks, 'launch plan');
  assert.equal(matches.length, 2);
  assert.equal(hasAmbiguousTaskMatch(matches, 'launch plan'), true);
});

test('assistant flags duplicate exact titles rather than mutating an arbitrary task', () => {
  const duplicates = [task('Send invoice'), task('Send invoice')];
  assert.equal(hasAmbiguousTaskMatch(matchTasksByTitle(duplicates, 'Send invoice'), 'Send invoice'), true);
});
