import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLock } from '../src/commands/lock.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fmax-lockcmd-'));
  writeFileSync(join(dir, 'CLAUDE.md'), '# rules\n');
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'marketplace.json'), '{}');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.2.3' }));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('runLock writes .locked.json with rootHash', async () => {
  await runLock({ cwd: dir });
  const path = join(dir, '.locked.json');
  expect(existsSync(path)).toBe(true);
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  expect(lock.version).toBe(1);
  expect(lock.tool).toContain('1.2.3');
  expect(lock.rootHash).toMatch(/^[0-9a-f]{64}$/);
});

test('runLock leaves file unchanged when rootHash matches (preserves generatedAt)', async () => {
  await runLock({ cwd: dir });
  const path = join(dir, '.locked.json');
  const first = readFileSync(path, 'utf8');
  // Wait a tick so any new timestamp would differ
  await new Promise((r) => setTimeout(r, 10));
  await runLock({ cwd: dir });
  const second = readFileSync(path, 'utf8');
  expect(second).toBe(first);
});

test('runLock rewrites when content changes', async () => {
  await runLock({ cwd: dir });
  const path = join(dir, '.locked.json');
  const firstHash = JSON.parse(readFileSync(path, 'utf8')).rootHash;
  writeFileSync(join(dir, 'CLAUDE.md'), '# rules changed\n');
  await runLock({ cwd: dir });
  const secondHash = JSON.parse(readFileSync(path, 'utf8')).rootHash;
  expect(secondHash).not.toBe(firstHash);
});
