import { test, expect } from 'vitest';
import { ok, warn, fail, info } from '../src/lib/log.js';

test('ok prefixes with check mark', () => {
  const m = ok('done');
  expect(m).toContain('✓');
  expect(m).toContain('done');
});

test('warn prefixes with warning sign', () => {
  expect(warn('careful')).toContain('⚠');
});

test('fail prefixes with cross', () => {
  expect(fail('boom')).toContain('✗');
});

test('info has no prefix glyph', () => {
  const m = info('hello');
  expect(m).toBe('hello');
});
