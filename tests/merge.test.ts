import { test, expect } from 'vitest';
import { mergeClaudeMd, mergeGitignore } from '../src/lib/merge.js';

const BEGIN = '<!-- BEGIN foodmax-ai -->';
const END = '<!-- END foodmax-ai -->';

test('mergeClaudeMd inserts block when file is empty', () => {
  const out = mergeClaudeMd('', '## team rules\n');
  expect(out).toContain(BEGIN);
  expect(out).toContain('## team rules');
  expect(out).toContain(END);
});

test('mergeClaudeMd preserves existing content below the block', () => {
  const existing = '# my project\n\nSome notes.\n';
  const out = mergeClaudeMd(existing, 'TEAM\n');
  expect(out.startsWith(BEGIN)).toBe(true);
  expect(out).toContain('# my project');
  expect(out).toContain('Some notes.');
});

test('mergeClaudeMd is idempotent: replaces existing block, no growth', () => {
  const first = mergeClaudeMd('', 'v1\n');
  const second = mergeClaudeMd(first, 'v2\n');
  expect(second).toContain('v2');
  expect(second).not.toContain('v1');
  expect(second.match(new RegExp(BEGIN, 'g'))!.length).toBe(1);
});

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
