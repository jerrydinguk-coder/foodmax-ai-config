import { test, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runUpdate } from '../src/commands/update.js';
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

// DI stubs so update never shells out to `which lark-cli` / `npm install -g` /
// `claude mcp list` in CI.
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
    claudeDetect: async () => ({ ok: true as const, version: '1.0.0' }),
    fetchVersions: fakeFetchVersions,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNamesEmpty,
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
    fetchVersions: fakeFetchVersions,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNamesEmpty,
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
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
    reinstall: async () => {},
    fetchVersions: fakeFetchVersions,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNamesEmpty,
  });
  const hasSuperpowersAdd = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' &&
      args[0] === 'plugin' &&
      args[1] === 'marketplace' &&
      args[2] === 'add' &&
      args[3] === 'github:obra/superpowers'
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
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
    reinstall: async () => {},
    fetchVersions: fakeFetchVersions,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: async () => ['playwright', 'feishu'], // already registered
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
    forceMcp: true,
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      if (cmd === 'claude' && args[0] === 'mcp' && args[1] === 'remove') {
        removedNames.add(args[2]!);
      }
      return { stdout: '', stderr: '' };
    },
    reinstall: async () => {},
    fetchVersions: fakeFetchVersions,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    // Simulate post-removal state: a name disappears from the list once removed.
    listMcpNames: async () =>
      ['playwright', 'feishu'].filter((n) => !removedNames.has(n)),
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
    reinstall: async () => {},
    fetchVersions: fakeFetchVersions,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNamesEmpty,
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
    exec: async (cmd, args) => {
      // Make superpowers marketplace add fail
      if (
        cmd === 'claude' &&
        args[0] === 'plugin' &&
        args[1] === 'marketplace' &&
        args[2] === 'add' &&
        args[3] === 'github:obra/superpowers'
      ) {
        throw new Error('network down');
      }
      return { stdout: '', stderr: '' };
    },
    reinstall: async () => {},
    fetchVersions: fakeFetchVersions,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNamesEmpty,
  });
  const projectLock = JSON.parse(
    readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8')
  );
  expect(projectLock.updatedAt).toBeTruthy();
});

// ---- Task 9: --version / --channel / deprecation warn / peer-check ----

const updateFakeVersions: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '1.2.3', tag: 'v1.2.3', publishedAt: '2026-05-26T00:00:00Z' },
    beta: { version: '1.3.0-rc.1', tag: 'v1.3.0-rc.1', publishedAt: '2026-05-25T00:00:00Z' },
  },
  deprecated: [
    { version: '1.1.0', reason: 'critical bug', fixedIn: '1.1.1', deprecatedAt: '2026-05-10T00:00:00Z' },
  ],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

const updateFakeFetchVersions = async () => updateFakeVersions;

/** Common options for the new tests so we don't shell out for real */
const sharedUpdateOpts = {
  reinstall: async () => {},
  larkCliPresent: fakeLarkCliPresent,
  listMcpNames: fakeListMcpNamesEmpty,
  claudeDetect: async () => ({ ok: true as const, version: '1.0.0' }),
};

test('update --version 1.2.3 reinstalls with that pinned tag', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...sharedUpdateOpts,
    fetchVersions: updateFakeFetchVersions,
    version: '1.2.3',
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
    // Do not inject reinstall so default reinstall path runs via exec
    reinstall: undefined,
  });
  const npmInstall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstall).toBeDefined();
  expect(npmInstall![1].join(' ')).toContain('#v1.2.3');
});

test('update --channel beta reinstalls with beta tag', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...sharedUpdateOpts,
    fetchVersions: updateFakeFetchVersions,
    channel: 'beta',
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
    reinstall: undefined,
  });
  const npmInstall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstall).toBeDefined();
  expect(npmInstall![1].join(' ')).toContain('#v1.3.0-rc.1');
});

test('update default (no flags) uses latest channel', async () => {
  const execCalls: Array<[string, string[]]> = [];
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...sharedUpdateOpts,
    fetchVersions: updateFakeFetchVersions,
    exec: async (cmd, args) => {
      execCalls.push([cmd, args]);
      return { stdout: '', stderr: '' };
    },
    reinstall: undefined,
  });
  const npmInstall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstall).toBeDefined();
  expect(npmInstall![1].join(' ')).toContain('#v1.2.3');
});

test('update warns when installing a deprecated version', async () => {
  const logs: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => { logs.push(String(msg)); };
  try {
    await runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...sharedUpdateOpts,
      fetchVersions: updateFakeFetchVersions,
      version: '1.1.0',
    });
  } finally {
    console.warn = origWarn;
  }
  expect(logs.some((l) => /deprecated/i.test(l))).toBe(true);
  expect(logs.some((l) => /1\.1\.1/.test(l))).toBe(true);
});

test('update records channel + resolvedFrom in lockfile on channel switch', async () => {
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...sharedUpdateOpts,
    fetchVersions: updateFakeFetchVersions,
    channel: 'beta',
  });
  const lock = JSON.parse(readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8'));
  expect(lock.channel).toBe('beta');
  expect(lock.resolvedFrom).toBe('channel');
});

test('update --version + --channel errors with mutually exclusive message', async () => {
  await expect(
    runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...sharedUpdateOpts,
      fetchVersions: updateFakeFetchVersions,
      version: '1.2.3',
      channel: 'beta',
    })
  ).rejects.toThrow(/mutually exclusive/i);
});

test('update blocks when Claude Code version is below peerRequirements', async () => {
  await expect(
    runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...sharedUpdateOpts,
      fetchVersions: updateFakeFetchVersions,
      claudeDetect: async () => ({ ok: true as const, version: '0.5.0' }),
    })
  ).rejects.toThrow(/Claude Code 0\.5\.0/);
});

test('update refuses to install a version marked severity=block', async () => {
  const fakeBlocked: VersionsJson = {
    ...updateFakeVersions,
    deprecated: [
      {
        version: '1.2.3',
        reason: 'critical: MCP secret leak',
        fixedIn: '1.2.4',
        deprecatedAt: '2026-05-20T00:00:00Z',
        severity: 'block',
      },
    ],
  };
  await expect(
    runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...sharedUpdateOpts,
      fetchVersions: async () => fakeBlocked,
      version: '1.2.3',
    })
  ).rejects.toThrow(/blocked/i);
});
