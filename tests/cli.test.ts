import { test, expect } from 'vitest';
import { execSync } from 'node:child_process';

const CLI = 'node dist/cli.js';

test('cli --help lists all six commands', () => {
  const out = execSync(`${CLI} --help`, { encoding: 'utf8' });
  for (const cmd of ['init', 'verify', 'status', 'repair', 'update', 'lock']) {
    expect(out).toContain(cmd);
  }
});

test('cli --pkg-version prints semver (renamed from --version to free that flag for subcommands)', () => {
  const out = execSync(`${CLI} --pkg-version`, { encoding: 'utf8' });
  expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});
