import { test, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runRepair } from '../src/commands/repair.js';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';
import { generateLockfile } from '../src/lib/lockfile.js';
import { projectLockfileName } from '../src/lib/paths.js';

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
    larkCliPresent: async () => true,
    listMcpNames: async () => [],
    yes: true,
    homeDirOverride: project.dir,
  });
});

afterEach(() => project.cleanup());

test('repair restores tampered file by re-installing from source', async () => {
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# tampered\n');
  const reinstall = async () => {
    writeFileSync(join(pkgRoot, 'CLAUDE.md'), pristineContent);
  };
  const r = await runRepair({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    reinstall,
    homeDirOverride: project.dir,
  });
  expect(r.ok).toBe(true);
  expect(readFileSync(join(pkgRoot, 'CLAUDE.md'), 'utf8')).toBe(pristineContent);
});

test('repair pins reinstall to packageVersion from project lockfile (npm spec)', async () => {
  // beforeEach ran init; .foodmax-ai.lock.json now records packageVersion='0.1.0'.
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# tampered\n');

  const execCalls: Array<{ cmd: string; args: string[] }> = [];
  const exec = async (cmd: string, args: string[]) => {
    execCalls.push({ cmd, args });
    writeFileSync(join(pkgRoot, 'CLAUDE.md'), pristineContent);
    return { stdout: '', stderr: '' };
  };

  const r = await runRepair({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec,
    homeDirOverride: project.dir,
  });

  expect(r.ok).toBe(true);
  expect(execCalls).toHaveLength(1);
  const call = execCalls[0]!;
  expect(call.cmd).toBe('npm');
  // npm spec form: foodmax-ai-config@0.1.0 (NOT a git URL anymore)
  expect(call.args.at(-1)).toBe('foodmax-ai-config@0.1.0');
});

test('repair falls back to @latest when project lockfile is missing', async () => {
  rmSync(join(project.dir, projectLockfileName()));
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# tampered\n');

  const execCalls: Array<{ cmd: string; args: string[] }> = [];
  const exec = async (cmd: string, args: string[]) => {
    execCalls.push({ cmd, args });
    writeFileSync(join(pkgRoot, 'CLAUDE.md'), pristineContent);
    return { stdout: '', stderr: '' };
  };

  const r = await runRepair({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec,
    homeDirOverride: project.dir,
  });

  expect(r.ok).toBe(true);
  expect(execCalls[0]!.args.at(-1)).toBe('foodmax-ai-config@latest');
});

test('repair refreshes <home>/.claude/CLAUDE.md', async () => {
  const claudeMdPath = join(project.dir, '.claude', 'CLAUDE.md');
  // Drop the CLAUDE.md that beforeEach's init wrote — prove repair re-writes it.
  rmSync(claudeMdPath, { force: true });
  expect(existsSync(claudeMdPath)).toBe(false);

  const reinstall = async () => {
    writeFileSync(join(pkgRoot, 'CLAUDE.md'), pristineContent);
  };
  await runRepair({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    reinstall,
    homeDirOverride: project.dir,
  });

  expect(existsSync(claudeMdPath)).toBe(true);
  const refreshed = readFileSync(claudeMdPath, 'utf8');
  expect(refreshed).toContain('# team rules');
  expect(refreshed).not.toContain('<!-- BEGIN foodmax-ai -->');
});
