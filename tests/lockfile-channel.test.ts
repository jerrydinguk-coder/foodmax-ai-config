import { test, expect } from 'vitest';
import type { ProjectLockfile } from '../src/lib/lockfile.js';

test('ProjectLockfile type accepts optional channel + resolvedFrom fields', () => {
  const sample: ProjectLockfile = {
    version: 1,
    package: 'foodmax-ai-config',
    source: 'https://example.com/repo.git',
    commitSha: null,
    packageVersion: '1.2.3',
    packageRootHash: 'a'.repeat(64),
    initializedAt: '2026-05-26T00:00:00Z',
    initializedBy: 'foodmax-ai@1.2.3',
    channel: 'latest',
    resolvedFrom: 'channel',
  };
  expect(sample.channel).toBe('latest');
  expect(sample.resolvedFrom).toBe('channel');
});

test('ProjectLockfile remains valid without channel/resolvedFrom (backward compat)', () => {
  const sample: ProjectLockfile = {
    version: 1,
    package: 'foodmax-ai-config',
    source: 'https://example.com/repo.git',
    commitSha: null,
    packageVersion: '0.1.0',
    packageRootHash: 'a'.repeat(64),
    initializedAt: '2026-05-26T00:00:00Z',
    initializedBy: 'foodmax-ai@0.1.0',
  };
  expect(sample.channel).toBeUndefined();
  expect(sample.resolvedFrom).toBeUndefined();
});
