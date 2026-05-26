import { test, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runStatus } from '../src/commands/status.js';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';
import { generateLockfile } from '../src/lib/lockfile.js';
import type { VersionsJson } from '../src/lib/versions.js';

const fakeVersionsJson: VersionsJson = {
  schemaVersion: 1,
  channels: { latest: { version: '1.0.0', tag: 'v1.0.0', publishedAt: '2026-01-01T00:00:00Z' } },
  deprecated: [],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};
const fakeFetchVersions = async () => fakeVersionsJson;

let project: ReturnType<typeof makeTempProject>;
let pkgRoot: string;

beforeEach(async () => {
  project = makeTempProject({
    'package.json': JSON.stringify({ name: 'consumer', version: '0.0.0' }, null, 2),
  });
  pkgRoot = makeFakeInstalledPackage(project.dir);
  const lock = generateLockfile(pkgRoot, 'foodmax-ai-config@0.1.0');
  writeFileSync(join(pkgRoot, '.locked.json'), JSON.stringify(lock, null, 2));
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: async () => ({ stdout: '', stderr: '' }),
    claudeDetect: async () => ({ ok: true as const, version: '1.0.0' }),
    fetchVersions: fakeFetchVersions,
    yes: true,
  });
});

afterEach(() => project.cleanup());

test('status: no drift returns empty list', async () => {
  const r = await runStatus({ cwd: project.dir, packageRootOverride: pkgRoot, diff: false });
  expect(r.entries).toEqual([]);
});

test('status: modified file shows up with hash diff', async () => {
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# changed\n');
  const r = await runStatus({ cwd: project.dir, packageRootOverride: pkgRoot, diff: false });
  expect(r.entries.some((e) => e.path === 'CLAUDE.md' && e.kind === 'modified')).toBe(true);
});

test('status --diff: includes unified diff output', async () => {
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# changed\n');
  const r = await runStatus({ cwd: project.dir, packageRootOverride: pkgRoot, diff: true });
  const entry = r.entries.find((e) => e.path === 'CLAUDE.md');
  expect(entry?.diff).toBeDefined();
  expect(entry?.diff).toContain('changed');
});
