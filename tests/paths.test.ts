import { test, expect } from 'vitest';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  packageRoot,
  claudeHome,
  projectLockfileName,
  packageLockfileName,
} from '../src/lib/paths.js';

const HERE = dirname(fileURLToPath(import.meta.url));

test('packageRoot points to repo root (parent of src/lib)', () => {
  const root = packageRoot();
  // root should contain package.json
  expect(root).toBe(resolve(HERE, '..'));
});

test('claudeHome is ~/.claude', () => {
  expect(claudeHome()).toBe(resolve(homedir(), '.claude'));
});

test('lockfile name constants are stable', () => {
  expect(projectLockfileName()).toBe('.foodmax-ai.lock.json');
  expect(packageLockfileName()).toBe('.locked.json');
});
