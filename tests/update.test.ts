import { test, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runUpdate } from '../src/commands/update.js';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';
import { generateLockfile } from '../src/lib/lockfile.js';

let project: ReturnType<typeof makeTempProject>;
let pkgRoot: string;

beforeEach(async () => {
  project = makeTempProject({
    'package.json': JSON.stringify({ name: 'consumer', version: '0.0.0' }, null, 2),
  });
  pkgRoot = makeFakeInstalledPackage(project.dir);
  const lockV1 = generateLockfile(pkgRoot, 'foodmax-ai-config@0.1.0');
  writeFileSync(join(pkgRoot, '.locked.json'), JSON.stringify(lockV1, null, 2));
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: async () => ({ stdout: '', stderr: '' }),
    claudeDetect: async () => ({ ok: true as const, version: '1.0.0' }),
    yes: true,
  });
});

afterEach(() => project.cleanup());

test('update rewrites project lockfile with new packageRootHash', async () => {
  // Simulate package upgrade: change a file + regenerate package's .locked.json
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# v2 rules\n');
  const lockV2 = generateLockfile(pkgRoot, 'foodmax-ai-config@0.2.0');
  writeFileSync(join(pkgRoot, '.locked.json'), JSON.stringify(lockV2, null, 2));

  // Run update with a no-op reinstall (we already wrote the "new" package state above)
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: async () => ({ stdout: '', stderr: '' }),
    reinstall: async () => {},
  });

  const projectLock = JSON.parse(
    readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8')
  );
  expect(projectLock.packageRootHash).toBe(lockV2.rootHash);
  expect(projectLock.packageVersion).toBe('0.1.0'); // package.json wasn't updated in this test
});
