import { test, expect } from 'vitest';
import { parseClaudeVersion, satisfies } from '../src/lib/semver-util.js';

test('parseClaudeVersion extracts semver from `claude --version` style output', () => {
  expect(parseClaudeVersion('1.2.3 (Claude Code)')).toBe('1.2.3');
  expect(parseClaudeVersion('claude-code v0.45.1-beta+sha')).toBe('0.45.1-beta');
  expect(parseClaudeVersion('  2.0.0\n')).toBe('2.0.0');
});

test('parseClaudeVersion returns null when no semver in output', () => {
  expect(parseClaudeVersion('not a version')).toBeNull();
  expect(parseClaudeVersion('')).toBeNull();
});

test('satisfies wraps semver.satisfies with prerelease allowance', () => {
  expect(satisfies('1.2.3', '>=1.0.0')).toBe(true);
  expect(satisfies('0.9.0', '>=1.0.0')).toBe(false);
  // Prerelease should be allowed against a non-prerelease range
  // (default semver.satisfies would reject 1.0.0-rc.1 against >=1.0.0;
  // we set includePrerelease: true so internal channels work.)
  expect(satisfies('1.0.0-rc.1', '>=1.0.0')).toBe(true);
});
