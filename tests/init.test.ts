import { test, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInit } from '../src/commands/init.js';
import { makeTempProject, makeFakeInstalledPackage } from './helpers/tempProject.js';

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

test('init writes CLAUDE.md with team region', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: fakeExec,
    claudeDetect: fakeClaudeDetect,
    yes: true,
  });
  const md = readFileSync(join(project.dir, 'CLAUDE.md'), 'utf8');
  expect(md).toContain('<!-- BEGIN foodmax-ai -->');
  expect(md).toContain('<!-- END foodmax-ai -->');
});

test('init adds foodmax-ai-config to package.json devDependencies', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: fakeExec,
    claudeDetect: fakeClaudeDetect,
    yes: true,
  });
  const pkg = JSON.parse(readFileSync(join(project.dir, 'package.json'), 'utf8'));
  expect(pkg.devDependencies['foodmax-ai-config']).toContain('github:foodmax/ai-config-init');
});

test('init writes .gitignore with settings.local.json', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: fakeExec,
    claudeDetect: fakeClaudeDetect,
    yes: true,
  });
  const gi = readFileSync(join(project.dir, '.gitignore'), 'utf8');
  expect(gi).toContain('.claude/settings.local.json');
});

test('init writes .github/workflows/ai-config-verify.yml', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: fakeExec,
    claudeDetect: fakeClaudeDetect,
    yes: true,
  });
  expect(existsSync(join(project.dir, '.github', 'workflows', 'ai-config-verify.yml'))).toBe(true);
});

test('init writes .foodmax-ai.lock.json', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: fakeExec,
    claudeDetect: fakeClaudeDetect,
    yes: true,
  });
  const lock = JSON.parse(readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8'));
  expect(lock.package).toBe('foodmax-ai-config');
  expect(lock.packageRootHash).toMatch(/^[0-9a-f]{64}$/);
});

test('init invokes plugin install', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: fakeExec,
    claudeDetect: fakeClaudeDetect,
    yes: true,
  });
  expect(execCalls.length).toBeGreaterThanOrEqual(2);
  expect(execCalls[0]).toEqual([
    'claude',
    ['plugin', 'marketplace', 'add', 'github:foodmax/ai-config-init'],
  ]);
});

test('init invokes superpowers install + MCP registrations after foodmax plugin', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: fakeExec,
    claudeDetect: fakeClaudeDetect,
    yes: true,
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
  await runInit({ cwd: project.dir, packageRootOverride: pkgRoot, exec: fakeExec, claudeDetect: fakeClaudeDetect, yes: true });
  await runInit({ cwd: project.dir, packageRootOverride: pkgRoot, exec: fakeExec, claudeDetect: fakeClaudeDetect, yes: true });
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
