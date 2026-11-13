import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppRoute } from './routing';

test('resolveAppRoute recognizes root and marketing routes', () => {
  assert.deepEqual(resolveAppRoute('/'), {
    normalizedPath: '/',
    isValid: true,
    view: null,
    sectionHash: undefined,
  });

  assert.deepEqual(resolveAppRoute('/pricing/'), {
    normalizedPath: '/pricing',
    isValid: true,
    view: null,
    sectionHash: 'pricing',
  });
});

test('resolveAppRoute maps workspace view routes case-insensitively and strips trailing slashes', () => {
  assert.equal(resolveAppRoute('/my-day').view, 'my_day');
  assert.equal(resolveAppRoute('/MY_DAY/').view, 'my_day');
  assert.equal(resolveAppRoute('/board').view, 'board');
  assert.equal(resolveAppRoute('/list').view, 'list');
  assert.equal(resolveAppRoute('/calendar').view, 'calendar');
  assert.equal(resolveAppRoute('/matrix').view, 'matrix');
  assert.equal(resolveAppRoute('/insights').view, 'insights');
});

test('resolveAppRoute flags unknown paths as 404', () => {
  for (const path of ['/unknown', '/dashboard/settings', '/404', '/foo/bar']) {
    const match = resolveAppRoute(path);
    assert.equal(match.isValid, false);
    assert.equal(match.view, null);
  }
});
