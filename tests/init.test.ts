import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';
import type { VersionsJson } from '../src/lib/versions.js';

let project: ReturnType<typeof makeTempProject>;
let pkgRoot: string;
let execCalls: Array<[string, string[]]>;

beforeEach(() => {
  project = makeTempProject({
    'package.json': JSON.stringify({ name: 'foodmax-backend', version: '0.0.0' }, null, 2),
  });
  pkgRoot = makeFakeInstalledPackage(project.dir);
  execCalls = [];
});

afterEach(() => project.cleanup());

const fakeExec = async (cmd: string, args: string[]) => {
  execCalls.push([cmd, args]);
  return { stdout: '', stderr: '' };
};

const fakeClaudeDetect = async () => ({ ok: true as const, version: '1.0.0' });

// Stub integration env probes so tests never shell out (e.g., `which lark-cli`,
// `claude mcp list`) or trigger real `npm install -g` on CI.
const fakeLarkCliPresent = async () => true;
const fakeListMcpNames = async () => [] as string[];

const fakeVersionsJson: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '1.2.3', tag: 'v1.2.3', publishedAt: '2026-05-26T00:00:00Z' },
    beta: { version: '1.3.0-rc.1', tag: 'v1.3.0-rc.1', publishedAt: '2026-05-25T00:00:00Z' },
  },
  deprecated: [],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

const fakeFetchVersions = async () => fakeVersionsJson;

const baseRunInit = {
  exec: fakeExec,
  claudeDetect: fakeClaudeDetect,
  larkCliPresent: fakeLarkCliPresent,
  listMcpNames: fakeListMcpNames,
  fetchVersions: fakeFetchVersions,
  yes: true as const,
};

test('init writes CLAUDE.md with team region', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  const md = readFileSync(join(project.dir, 'CLAUDE.md'), 'utf8');
  expect(md).toContain('<!-- BEGIN foodmax-ai -->');
  expect(md).toContain('<!-- END foodmax-ai -->');
});

test('init adds foodmax-ai-config to package.json devDependencies', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  const pkg = JSON.parse(readFileSync(join(project.dir, 'package.json'), 'utf8'));
  expect(pkg.devDependencies['foodmax-ai-config']).toContain('foodmax-ai-config-init.git');
  expect(pkg.devDependencies['foodmax-ai-config']).toContain('#v1.2.3');
});

test('init writes .gitignore with settings.local.json', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  const gi = readFileSync(join(project.dir, '.gitignore'), 'utf8');
  expect(gi).toContain('.claude/settings.local.json');
});

test('init writes .github/workflows/ai-config-verify.yml', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  expect(existsSync(join(project.dir, '.github', 'workflows', 'ai-config-verify.yml'))).toBe(true);
});

test('init writes .foodmax-ai.lock.json', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  const lock = JSON.parse(readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8'));
  expect(lock.package).toBe('foodmax-ai-config');
  expect(lock.packageRootHash).toMatch(/^[0-9a-f]{64}$/);
});

test('init invokes plugin install', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  expect(execCalls.length).toBeGreaterThanOrEqual(2);
  const marketplaceCall = execCalls.find(
    ([cmd, args]) => cmd === 'claude' && args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add'
  );
  expect(marketplaceCall).toBeDefined();
  expect(marketplaceCall![1][3]).toContain('foodmax-ai-config-init.git');
  expect(marketplaceCall![1][3]).toContain('#v1.2.3');
});

test('init invokes superpowers install + MCP registrations after foodmax plugin', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  // The foodmax plugin install is first; integrations chain after.
  // Use loose matchers because order within integrations + MCP-list pre-check exec
  // calls may vary as we change defaults.
  const hasSuperpowersAdd = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' &&
      args[0] === 'plugin' &&
      args[1] === 'marketplace' &&
      args[2] === 'add' &&
      args[3] === 'github:obra/superpowers'
  );
  const hasSuperpowersInstall = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' &&
      args[0] === 'plugin' &&
      args[1] === 'install' &&
      args[2] === 'superpowers@superpowers-dev'
  );
  const hasPlaywrightMcp = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' &&
      args[0] === 'mcp' &&
      args[1] === 'add' &&
      args[2] === 'playwright'
  );
  const hasFeishuMcp = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' &&
      args[0] === 'mcp' &&
      args[1] === 'add' &&
      args[2] === 'feishu'
  );
  expect(hasSuperpowersAdd).toBe(true);
  expect(hasSuperpowersInstall).toBe(true);
  expect(hasPlaywrightMcp).toBe(true);
  expect(hasFeishuMcp).toBe(true);
});

test('init is idempotent: second run does not duplicate region', async () => {
  await runInit({ cwd: project.dir, packageRootOverride: pkgRoot, ...baseRunInit });
  await runInit({ cwd: project.dir, packageRootOverride: pkgRoot, ...baseRunInit });
  const md = readFileSync(join(project.dir, 'CLAUDE.md'), 'utf8');
  expect(md.match(/<!-- BEGIN foodmax-ai -->/g)!.length).toBe(1);
});

test('init fails when claude CLI not detected', async () => {
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      exec: fakeExec,
      claudeDetect: async () => ({ ok: false as const, error: 'not found' }),
      yes: true,
    })
  ).rejects.toThrow(/claude CLI/i);
});

test('init --version 1.2.3 pins claude plugin marketplace to that tag', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    version: '1.2.3',
  });
  const marketplaceCall = execCalls.find(
    ([cmd, args]) => cmd === 'claude' && args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add'
  );
  expect(marketplaceCall![1][3]).toContain('#v1.2.3');
});

test('init --channel beta pins to beta tag', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    channel: 'beta',
  });
  const marketplaceCall = execCalls.find(
    ([cmd, args]) => cmd === 'claude' && args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add'
  );
  expect(marketplaceCall![1][3]).toContain('#v1.3.0-rc.1');
});

test('init default resolves latest channel', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  const marketplaceCall = execCalls.find(
    ([cmd, args]) => cmd === 'claude' && args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add'
  );
  expect(marketplaceCall![1][3]).toContain('#v1.2.3');
});

test('init writes pinned URL to package.json devDependencies', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    version: '1.2.3',
  });
  const pkg = JSON.parse(readFileSync(join(project.dir, 'package.json'), 'utf8'));
  expect(pkg.devDependencies['foodmax-ai-config']).toContain('#v1.2.3');
});

test('init records channel + resolvedFrom in project lockfile', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    channel: 'beta',
  });
  const lock = JSON.parse(readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8'));
  expect(lock.channel).toBe('beta');
  expect(lock.resolvedFrom).toBe('channel');
});

test('init records resolvedFrom=explicit-version (no channel) when --version given', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    version: '1.2.3',
  });
  const lock = JSON.parse(readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8'));
  expect(lock.resolvedFrom).toBe('explicit-version');
  expect(lock.channel).toBeUndefined();
});

test('init --version + --channel errors', async () => {
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      version: '1.2.3',
      channel: 'beta',
    })
  ).rejects.toThrow(/mutually exclusive/i);
});

test('init blocks when Claude Code version is below peerRequirements', async () => {
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      claudeDetect: async () => ({ ok: true as const, version: '0.5.0' }),
    })
  ).rejects.toThrow(/Claude Code 0\.5\.0.*>=1\.0\.0/);
});

test('init refuses to install a version marked severity=block', async () => {
  const fakeBlocked: VersionsJson = {
    ...fakeVersionsJson,
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
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      fetchVersions: async () => fakeBlocked,
      version: '1.2.3',
    })
  ).rejects.toThrow(/blocked/i);
});

test('init warns but proceeds for warn-severity deprecation', async () => {
  const fakeWarn: VersionsJson = {
    ...fakeVersionsJson,
    deprecated: [
      {
        version: '1.2.3',
        reason: 'cosmetic issue',
        fixedIn: '1.2.4',
        deprecatedAt: '2026-05-20T00:00:00Z',
      },
    ],
  };
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      fetchVersions: async () => fakeWarn,
      version: '1.2.3',
    });
    const allOutput = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/deprecated/i);
  } finally {
    spy.mockRestore();
  }
});
