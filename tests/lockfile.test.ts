import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateLockfile,
  readLockfile,
  verifyLockfile,
  type Lockfile,
} from '../src/lib/lockfile.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fmax-lock-'));
  writeFileSync(join(dir, 'CLAUDE.md'), '# rules\n');
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'marketplace.json'), '{}');
  mkdirSync(join(dir, 'skills', 'demo'), { recursive: true });
  writeFileSync(join(dir, 'skills', 'demo', 'SKILL.md'), 'demo\n');
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  writeFileSync(join(dir, 'hooks', 'h.sh'), '#!/bin/sh\n');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('generateLockfile produces stable rootHash for same tree', () => {
  const a = generateLockfile(dir, 'foodmax-ai-config@1.0.0');
  const b = generateLockfile(dir, 'foodmax-ai-config@1.0.0');
  expect(a.rootHash).toBe(b.rootHash);
  expect(a.tree).toEqual(b.tree);
});

test('generateLockfile rootHash changes when a file changes', () => {
  const before = generateLockfile(dir, 'tool@1.0.0').rootHash;
  writeFileSync(join(dir, 'CLAUDE.md'), '# rules updated\n');
  const after = generateLockfile(dir, 'tool@1.0.0').rootHash;
  expect(after).not.toBe(before);
});

test('generateLockfile ignores src/, tests/, package.json, node_modules/', () => {
  const before = generateLockfile(dir, 'tool@1.0.0').rootHash;
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'x.ts'), 'irrelevant');
  writeFileSync(join(dir, 'package.json'), '{}');
  const after = generateLockfile(dir, 'tool@1.0.0').rootHash;
  expect(after).toBe(before);
});

test('readLockfile parses a written lockfile', () => {
  const lock = generateLockfile(dir, 'tool@1.0.0');
  writeFileSync(join(dir, '.locked.json'), JSON.stringify(lock, null, 2));
  const round = readLockfile(join(dir, '.locked.json'));
  expect(round).toEqual(lock);
});

test('verifyLockfile pass: tree matches', () => {
  const lock = generateLockfile(dir, 'tool@1.0.0');
  writeFileSync(join(dir, '.locked.json'), JSON.stringify(lock, null, 2));
  const result = verifyLockfile(dir, lock);
  expect(result.ok).toBe(true);
  expect(result.modified).toEqual([]);
});

test('verifyLockfile fail: detects modified files', () => {
  const lock = generateLockfile(dir, 'tool@1.0.0');
  writeFileSync(join(dir, '.locked.json'), JSON.stringify(lock, null, 2));
  writeFileSync(join(dir, 'CLAUDE.md'), '# tampered\n');
  const result = verifyLockfile(dir, lock);
  expect(result.ok).toBe(false);
  expect(result.modified).toContain('CLAUDE.md');
});

test('verifyLockfile fail: detects added files', () => {
  const lock = generateLockfile(dir, 'tool@1.0.0');
  writeFileSync(join(dir, 'skills', 'demo', 'NEW.md'), 'new');
  const result = verifyLockfile(dir, lock);
  expect(result.ok).toBe(false);
  expect(result.added).toContain('skills/demo/NEW.md');
});

test('verifyLockfile fail: detects removed files', () => {
  const lock = generateLockfile(dir, 'tool@1.0.0');
  rmSync(join(dir, 'CLAUDE.md'));
  const result = verifyLockfile(dir, lock);
  expect(result.ok).toBe(false);
  expect(result.removed).toContain('CLAUDE.md');
});
