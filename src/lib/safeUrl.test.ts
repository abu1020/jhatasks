import test from 'node:test';
import assert from 'node:assert/strict';
import { safeExternalUrl } from './safeUrl';

test('safeExternalUrl allows HTTP(S) links and normalizes whitespace', () => {
  assert.equal(safeExternalUrl(' https://example.com/path '), 'https://example.com/path');
  assert.equal(safeExternalUrl('http://example.com'), 'http://example.com/');
});

test('safeExternalUrl rejects script, file, data, malformed, and oversized URLs', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'not a url',
    `https://example.com/${'a'.repeat(2050)}`,
    null,
  ]) {
    assert.equal(safeExternalUrl(value), null);
  }
});
