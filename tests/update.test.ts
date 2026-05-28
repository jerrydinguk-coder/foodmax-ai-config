import { test, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runUpdate } from '../src/commands/update.js';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';
import { generateLockfile } from '../src/lib/lockfile.js';

let project: ReturnType<typeof makeTempProject>;
let pkgRoot: string;

const fakeLarkCliPresent = async () => true;
const fakeListMcpNamesEmpty = async () => [] as string[];
const fakeClaudeDetect = async () => ({ ok: true as const, version: '1.0.0' });

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
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNamesEmpty,
    yes: true,
    homeDirOverride: project.dir,
  });
});

afterEach(() => project.cleanup());

const baseUpdate = {
  reinstall: async () => {},
  claudeDetect: fakeClaudeDetect,
  larkCliPresent: fakeLarkCliPresent,
  listMcpNames: fakeListMcpNamesEmpty,
  // update now refreshes <home>/.claude/CLAUDE.md; point home at the temp
  // project so tests never touch the real ~/.claude/CLAUDE.md.
  get homeDirOverride() {
    return project.dir;
  },
};

test('update rewrites project lockfile with new packageRootHash', async () => {
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# v2 rules\n');
  const lockV2 = generateLockfile(pkgRoot, 'foodmax-ai-config@0.2.0');
  writeFileSync(join(pkgRoot, '.locked.json'), JSON.stringify(lockV2, null, 2));

  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    exec: async () => ({ stdout: '', stderr: '' }),
  });

  const projectLock = JSON.parse(
    readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8')
  );
  expect(projectLock.packageRootHash).toBe(lockV2.rootHash);
  expect(projectLock.packageVersion).toBe('0.1.0'); // package.json wasn't updated in this test
});

test('update runs integrations so new integrations propagate automatically', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
  });
  const hasSuperpowersAdd = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' &&
      args[0] === 'plugin' &&
      args[1] === 'marketplace' &&
      args[2] === 'add' &&
      args[3] === 'obra/superpowers'
  );
  const hasPlaywrightAdd = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' && args[0] === 'mcp' && args[1] === 'add' && args[2] === 'playwright'
  );
  const hasFeishuAdd = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' && args[0] === 'mcp' && args[1] === 'add' && args[2] === 'feishu'
  );
  expect(hasSuperpowersAdd).toBe(true);
  expect(hasPlaywrightAdd).toBe(true);
  expect(hasFeishuAdd).toBe(true);
});

test('update without --force-mcp does NOT remove existing MCPs', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    listMcpNames: async () => ['playwright', 'feishu'],
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
  });
  const hasMcpRemove = execCalls.some(
    ([cmd, args]) => cmd === 'claude' && args[0] === 'mcp' && args[1] === 'remove'
  );
  expect(hasMcpRemove).toBe(false);
});

test('update --force-mcp removes managed MCPs then re-registers them', async () => {
  const execCalls: Array<[string, string[]]> = [];
  const removedNames = new Set<string>();
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    forceMcp: true,
    listMcpNames: async () =>
      ['playwright', 'feishu'].filter((n) => !removedNames.has(n)),
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      if (cmd === 'claude' && args[0] === 'mcp' && args[1] === 'remove') {
        removedNames.add(args[2]!);
      }
      return { stdout: '', stderr: '' };
    },
  });

  const removedPlaywright = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' && args[0] === 'mcp' && args[1] === 'remove' && args[2] === 'playwright'
  );
  const removedFeishu = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' && args[0] === 'mcp' && args[1] === 'remove' && args[2] === 'feishu'
  );
  const addedPlaywright = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' && args[0] === 'mcp' && args[1] === 'add' && args[2] === 'playwright'
  );
  const addedFeishu = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' && args[0] === 'mcp' && args[1] === 'add' && args[2] === 'feishu'
  );
  expect(removedPlaywright).toBe(true);
  expect(removedFeishu).toBe(true);
  expect(addedPlaywright).toBe(true);
  expect(addedFeishu).toBe(true);
});

test('update --force-mcp tolerates remove failures (MCP may not be registered yet)', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    forceMcp: true,
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      if (
        cmd === 'claude' &&
        args[0] === 'mcp' &&
        args[1] === 'remove' &&
        args[2] === 'playwright'
      ) {
        throw new Error('No MCP server found with name: playwright');
      }
      return { stdout: '', stderr: '' };
    },
  });
  const addedPlaywright = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' && args[0] === 'mcp' && args[1] === 'add' && args[2] === 'playwright'
  );
  expect(addedPlaywright).toBe(true);
});

test('update integration failures do NOT fail the overall update (lockfile still written)', async () => {
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    exec: async (cmd, args) => {
      if (
        cmd === 'claude' &&
        args[0] === 'plugin' &&
        args[1] === 'marketplace' &&
        args[2] === 'add' &&
        args[3] === 'obra/superpowers'
      ) {
        throw new Error('network down');
      }
      return { stdout: '', stderr: '' };
    },
  });
  const projectLock = JSON.parse(
    readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8')
  );
  expect(projectLock.updatedAt).toBeTruthy();
});

test('update --version 1.2.3 reinstalls with that npm spec', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    reinstall: undefined,
    version: '1.2.3',
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
  });
  const npmInstall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstall).toBeDefined();
  expect(npmInstall![1][2]).toBe('foodmax-ai-config@1.2.3');
});

test('update --tag beta reinstalls with beta tag', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    reinstall: undefined,
    tag: 'beta',
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
  });
  const npmInstall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstall).toBeDefined();
  expect(npmInstall![1][2]).toBe('foodmax-ai-config@beta');
});

test('update default (no flags) uses @latest', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    reinstall: undefined,
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
  });
  const npmInstall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstall).toBeDefined();
  expect(npmInstall![1][2]).toBe('foodmax-ai-config@latest');
});

test('update records channel + resolvedFrom in lockfile on tag switch', async () => {
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    exec: async () => ({ stdout: '', stderr: '' }),
    tag: 'beta',
  });
  const lock = JSON.parse(readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8'));
  expect(lock.channel).toBe('beta');
  expect(lock.resolvedFrom).toBe('channel');
});

test('update --version + --tag errors with mutually exclusive message', async () => {
  await expect(
    runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseUpdate,
      version: '1.2.3',
      tag: 'beta',
    })
  ).rejects.toThrow(/mutually exclusive/i);
});

test('update --version rejects invalid semver', async () => {
  await expect(
    runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseUpdate,
      version: 'not-a-version',
    })
  ).rejects.toThrow(/valid semver/i);
});

test('update blocks when Claude Code version is below MIN_CLAUDE_CODE_VERSION', async () => {
  await expect(
    runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseUpdate,
      claudeDetect: async () => ({ ok: true as const, version: '0.5.0' }),
    })
  ).rejects.toThrow(/Claude Code 0\.5\.0/);
});

test('update refreshes <home>/.claude/CLAUDE.md so team-rule changes reach old users', async () => {
  const claudeMdPath = join(project.dir, '.claude', 'CLAUDE.md');
  // Drop the CLAUDE.md that beforeEach's init wrote — prove update re-writes it.
  rmSync(claudeMdPath, { force: true });
  expect(existsSync(claudeMdPath)).toBe(false);

  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseUpdate,
    exec: async () => ({ stdout: '', stderr: '' }),
  });

  expect(existsSync(claudeMdPath)).toBe(true);
  const refreshed = readFileSync(claudeMdPath, 'utf8');
  expect(refreshed).toContain('# team rules');
  expect(refreshed).not.toContain('<!-- BEGIN foodmax-ai -->');
});
