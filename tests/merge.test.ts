import { test, expect } from 'vitest';
import { mergeGitignore } from '../src/lib/merge.js';

test('mergeGitignore appends line when missing', () => {
  expect(mergeGitignore('', '.claude/settings.local.json')).toContain('.claude/settings.local.json');
});

test('mergeGitignore is no-op when line already present', () => {
  const existing = '*.log\n.claude/settings.local.json\n';
  const out = mergeGitignore(existing, '.claude/settings.local.json');
  expect(out).toBe(existing);
});

test('mergeGitignore preserves trailing newline behavior', () => {
  const out = mergeGitignore('*.log\n', '.tmp/');
  expect(out).toBe('*.log\n.tmp/\n');
});
