import { test, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runVerify } from '../src/commands/verify.js';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';
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
  // The fake package needs a valid .locked.json
  const { generateLockfile } = await import('../src/lib/lockfile.js');
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

test('verify passes when nothing modified', async () => {
  const r = await runVerify({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    strict: false,
  });
  expect(r.exitCode).toBe(0);
  expect(r.ok).toBe(true);
});

test('verify --strict passes when nothing modified', async () => {
  const r = await runVerify({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    strict: true,
  });
  expect(r.exitCode).toBe(0);
});

test('verify soft mode: warns on drift, exit 0', async () => {
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# tampered\n');
  const r = await runVerify({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    strict: false,
  });
  expect(r.exitCode).toBe(0);
  expect(r.ok).toBe(false);
  expect(r.driftedFiles).toContain('CLAUDE.md');
});

test('verify --strict: exit 1 on drift', async () => {
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# tampered\n');
  const r = await runVerify({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    strict: true,
  });
  expect(r.exitCode).toBe(1);
  expect(r.ok).toBe(false);
});

test('verify: exit 2 when package not installed', async () => {
  const noPkg = makeTempProject();
  const r = await runVerify({
    cwd: noPkg.dir,
    packageRootOverride: join(noPkg.dir, 'no-such-pkg'),
    strict: false,
  });
  expect(r.exitCode).toBe(2);
  noPkg.cleanup();
});

test('verify: exit 2 when project lockfile missing', async () => {
  const fresh = makeTempProject();
  makeFakeInstalledPackage(fresh.dir);
  const newPkgRoot = join(fresh.dir, 'node_modules', 'foodmax-ai-config');
  const { generateLockfile } = await import('../src/lib/lockfile.js');
  const lock = generateLockfile(newPkgRoot, 'foodmax-ai-config@0.1.0');
  writeFileSync(join(newPkgRoot, '.locked.json'), JSON.stringify(lock, null, 2));
  const r = await runVerify({
    cwd: fresh.dir,
    packageRootOverride: newPkgRoot,
    strict: false,
  });
  expect(r.exitCode).toBe(2);
  fresh.cleanup();
});
