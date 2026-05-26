import { test, expect } from 'vitest';
import { requireClaudeVersion, parseDetectResultVersion } from '../src/lib/claude-detect.js';

test('parseDetectResultVersion extracts semver from successful detect', () => {
  expect(parseDetectResultVersion({ ok: true, version: '1.2.3 (Claude Code)' })).toBe('1.2.3');
});

test('parseDetectResultVersion returns null for failed detect', () => {
  expect(parseDetectResultVersion({ ok: false, error: 'not found' })).toBeNull();
});

test('requireClaudeVersion returns ok when version satisfies range', () => {
  const r = requireClaudeVersion({ ok: true, version: '1.5.0' }, '>=1.0.0');
  expect(r).toEqual({ ok: true, version: '1.5.0' });
});

test('requireClaudeVersion returns reason when version is too old', () => {
  const r = requireClaudeVersion({ ok: true, version: '0.9.0' }, '>=1.0.0');
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.reason).toMatch(/0\.9\.0/);
    expect(r.reason).toMatch(/>=1\.0\.0/);
  }
});

test('requireClaudeVersion returns reason when claude not detected', () => {
  const r = requireClaudeVersion({ ok: false, error: 'spawn claude ENOENT' }, '>=1.0.0');
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toMatch(/not detected/i);
});

test('requireClaudeVersion returns reason when version is unparseable', () => {
  const r = requireClaudeVersion({ ok: true, version: 'mystery build' }, '>=1.0.0');
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toMatch(/parse/i);
});
