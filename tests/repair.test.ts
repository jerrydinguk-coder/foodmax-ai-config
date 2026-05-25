import { test, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRepair } from '../src/commands/repair.js';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';
import { generateLockfile } from '../src/lib/lockfile.js';

let project: ReturnType<typeof makeTempProject>;
let pkgRoot: string;
let pristineContent: string;

beforeEach(async () => {
  project = makeTempProject({
    'package.json': JSON.stringify({ name: 'consumer', version: '0.0.0' }, null, 2),
  });
  pkgRoot = makeFakeInstalledPackage(project.dir);
  const lock = generateLockfile(pkgRoot, 'foodmax-ai-config@0.1.0');
  writeFileSync(join(pkgRoot, '.locked.json'), JSON.stringify(lock, null, 2));
  pristineContent = readFileSync(join(pkgRoot, 'CLAUDE.md'), 'utf8');
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: async () => ({ stdout: '', stderr: '' }),
    claudeDetect: async () => ({ ok: true as const, version: '1.0.0' }),
    yes: true,
  });
});

afterEach(() => project.cleanup());

test('repair restores tampered file by re-installing from source', async () => {
  // Tamper
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# tampered\n');
  // Fake reinstall: simply restore pristine content
  const reinstall = async () => {
    writeFileSync(join(pkgRoot, 'CLAUDE.md'), pristineContent);
  };
  const r = await runRepair({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    reinstall,
  });
  expect(r.ok).toBe(true);
  expect(readFileSync(join(pkgRoot, 'CLAUDE.md'), 'utf8')).toBe(pristineContent);
});
