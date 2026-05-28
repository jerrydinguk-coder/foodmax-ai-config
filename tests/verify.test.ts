import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runVerify } from '../src/commands/verify.js';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';

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
    larkCliPresent: async () => true,
    listMcpNames: async () => [],
    yes: true,
    homeDirOverride: project.dir,
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

test('verify drift hints use npx -y foodmax-ai-config@latest, not the bare bin name', async () => {
  // Force version drift so the update/inspect/repair hints print.
  const projectLockPath = join(project.dir, '.foodmax-ai.lock.json');
  const lock = JSON.parse(readFileSync(projectLockPath, 'utf8'));
  lock.packageRootHash = 'deadbeef'.repeat(8);
  writeFileSync(projectLockPath, JSON.stringify(lock, null, 2));

  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  try {
    await runVerify({ cwd: project.dir, packageRootOverride: pkgRoot, strict: false });
  } finally {
    spy.mockRestore();
  }
  const joined = logs.join('\n');
  expect(joined).toContain('npx -y foodmax-ai-config@latest update');
  expect(joined).toContain('npx -y foodmax-ai-config@latest status --diff');
  expect(joined).toContain('npx -y foodmax-ai-config@latest repair');
  expect(joined).not.toMatch(/npx foodmax-ai(?!-config)/);
});
