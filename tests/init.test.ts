import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
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

// Stub integration env probes so tests never shell out (e.g., `which lark-cli`,
// `claude mcp list`) or trigger real `npm install -g` on CI.
const fakeLarkCliPresent = async () => true;
const fakeListMcpNames = async () => [] as string[];

const baseRunInit = {
  exec: fakeExec,
  claudeDetect: fakeClaudeDetect,
  larkCliPresent: fakeLarkCliPresent,
  listMcpNames: fakeListMcpNames,
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

test('init adds foodmax-ai-config to package.json devDependencies as npm semver', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  const pkg = JSON.parse(readFileSync(join(project.dir, 'package.json'), 'utf8'));
  // Fake package was created at version 0.1.0, so the devDep is the npm
  // caret range for that version. NOT a git URL anymore.
  expect(pkg.devDependencies['foodmax-ai-config']).toBe('^0.1.0');
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
  expect(lock.source).toBe('foodmax-ai-config');
  expect(lock.packageRootHash).toMatch(/^[0-9a-f]{64}$/);
});

test('init invokes plugin marketplace add with GitHub URL pinned to installed version', async () => {
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
  // Fake installed pkg is 0.1.0, so marketplace ref is v0.1.0
  expect(marketplaceCall![1][3]).toBe(
    'https://github.com/jerrydinguk-coder/foodmax-ai-config.git#v0.1.0'
  );
});

test('init invokes superpowers install + MCP registrations after foodmax plugin', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
  });
  const hasSuperpowersAdd = execCalls.some(
    ([cmd, args]) =>
      cmd === 'claude' &&
      args[0] === 'plugin' &&
      args[1] === 'marketplace' &&
      args[2] === 'add' &&
      args[3] === 'obra/superpowers'
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

test('init --version 1.2.3 uses that as npm install spec (when self-installing)', async () => {
  rmSync(pkgRoot, { recursive: true, force: true });
  const exec = async (cmd: string, args: string[]) => {
    execCalls.push([cmd, args]);
    if (cmd === 'npm' && args[0] === 'install') {
      // Re-stage the fake package; it carries version 0.1.0 (helper default).
      makeFakeInstalledPackage(project.dir);
    }
    return { stdout: '', stderr: '' };
  };
  await runInit({
    cwd: project.dir,
    exec,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNames,
    yes: true,
    version: '1.2.3',
  });
  const npmCall = execCalls.find(
    ([cmd, args]) => cmd === 'npm' && args[0] === 'install' && args[1] === '--no-save'
  );
  expect(npmCall).toBeDefined();
  expect(npmCall![1][2]).toBe('foodmax-ai-config@1.2.3');
});

test('init --tag beta uses tag in npm install spec', async () => {
  rmSync(pkgRoot, { recursive: true, force: true });
  const exec = async (cmd: string, args: string[]) => {
    execCalls.push([cmd, args]);
    if (cmd === 'npm' && args[0] === 'install') makeFakeInstalledPackage(project.dir);
    return { stdout: '', stderr: '' };
  };
  await runInit({
    cwd: project.dir,
    exec,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNames,
    yes: true,
    tag: 'beta',
  });
  const npmCall = execCalls.find(
    ([cmd, args]) => cmd === 'npm' && args[0] === 'install' && args[1] === '--no-save'
  );
  expect(npmCall![1][2]).toBe('foodmax-ai-config@beta');
});

test('init default resolves to @latest', async () => {
  rmSync(pkgRoot, { recursive: true, force: true });
  const exec = async (cmd: string, args: string[]) => {
    execCalls.push([cmd, args]);
    if (cmd === 'npm' && args[0] === 'install') makeFakeInstalledPackage(project.dir);
    return { stdout: '', stderr: '' };
  };
  await runInit({
    cwd: project.dir,
    exec,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNames,
    yes: true,
  });
  const npmCall = execCalls.find(
    ([cmd, args]) => cmd === 'npm' && args[0] === 'install' && args[1] === '--no-save'
  );
  expect(npmCall![1][2]).toBe('foodmax-ai-config@latest');
});

test('init records channel + resolvedFrom in project lockfile when --tag given', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    tag: 'beta',
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

test('init --version + --tag errors', async () => {
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      version: '1.2.3',
      tag: 'beta',
    })
  ).rejects.toThrow(/mutually exclusive/i);
});

test('init --version rejects invalid semver', async () => {
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      version: 'not-a-version',
    })
  ).rejects.toThrow(/valid semver/i);
});

test('init blocks when Claude Code version is below MIN_CLAUDE_CODE_VERSION', async () => {
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      claudeDetect: async () => ({ ok: true as const, version: '0.5.0' }),
    })
  ).rejects.toThrow(/Claude Code 0\.5\.0.*>=1\.0\.0/);
});

test('init self-installs from npm when package missing from cwd node_modules', async () => {
  // Simulate `npx -y foodmax-ai-config@latest init` against a project that
  // doesn't have the package pre-staged.
  rmSync(pkgRoot, { recursive: true, force: true });
  expect(existsSync(pkgRoot)).toBe(false);

  const exec = async (cmd: string, args: string[]) => {
    execCalls.push([cmd, args]);
    if (cmd === 'npm' && args[0] === 'install') {
      makeFakeInstalledPackage(project.dir);
    }
    return { stdout: '', stderr: '' };
  };

  await runInit({
    cwd: project.dir,
    exec,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNames,
    yes: true,
  });

  const npmCall = execCalls.find(
    ([cmd, args]) => cmd === 'npm' && args[0] === 'install' && args[1] === '--no-save'
  );
  expect(npmCall).toBeDefined();
  expect(npmCall![1][2]).toBe('foodmax-ai-config@latest');

  expect(existsSync(join(project.dir, '.foodmax-ai.lock.json'))).toBe(true);
});

test('init throws if self-install fails to materialize the package', async () => {
  rmSync(pkgRoot, { recursive: true, force: true });

  const exec = async (cmd: string, args: string[]) => {
    execCalls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };

  await expect(
    runInit({
      cwd: project.dir,
      exec,
      claudeDetect: fakeClaudeDetect,
      larkCliPresent: fakeLarkCliPresent,
      listMcpNames: fakeListMcpNames,
      yes: true,
    })
  ).rejects.toThrow(/Installed package not found/i);
});

test('init does not require cwd to be a git repository', async () => {
  // Same scenario as the user reported (2026-05-27): teammate ran
  // `npx -y foodmax-ai-config@latest init` from their home dir (no .git/).
  // Before v1.0.3 this threw; from v1.0.3 onward we let init proceed and
  // write into whatever cwd the user picked.
  rmSync(join(project.dir, '.git'), { recursive: true, force: true });
  expect(existsSync(join(project.dir, '.git'))).toBe(false);

  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    exec: fakeExec,
    claudeDetect: fakeClaudeDetect,
    larkCliPresent: fakeLarkCliPresent,
    listMcpNames: fakeListMcpNames,
    // intentionally no `yes` — that's the whole point of this test
  });

  expect(existsSync(join(project.dir, '.foodmax-ai.lock.json'))).toBe(true);
});

test('init does NOT claim "Done" when the foodmax plugin install fails', async () => {
  // Teammate report: marketplace add failed but init still printed
  // "✓ Done. Team AI config installed." — completely misleading.
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  // Fail ONLY the foodmax plugin marketplace add (matched via its github
  // source); superpowers + MCPs all succeed.
  const exec = async (cmd: string, args: string[]) => {
    if (
      cmd === 'claude' &&
      args[0] === 'plugin' &&
      args[1] === 'marketplace' &&
      args[2] === 'add' &&
      String(args[3]).includes('jerrydinguk-coder')
    ) {
      const err = new Error('Command failed') as Error & { stderr: string };
      err.stderr = 'fatal: repository not found';
      throw err;
    }
    return { stdout: '', stderr: '' };
  };
  try {
    await runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      exec,
      claudeDetect: fakeClaudeDetect,
      larkCliPresent: fakeLarkCliPresent,
      listMcpNames: fakeListMcpNames,
      yes: true,
    });
  } finally {
    spy.mockRestore();
  }
  const joined = logs.join('\n');
  expect(joined).not.toContain('Done. Team AI config installed.');
  expect(joined).toMatch(/incomplete|did NOT install|not installed/i);
  // and the real git error should be visible somewhere
  expect(joined).toContain('repository not found');
});

test('init --dry-run prints would-install line and does not shell out', async () => {
  rmSync(pkgRoot, { recursive: true, force: true });

  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  try {
    await runInit({
      cwd: project.dir,
      exec: fakeExec,
      claudeDetect: fakeClaudeDetect,
      larkCliPresent: fakeLarkCliPresent,
      listMcpNames: fakeListMcpNames,
      yes: true,
      dryRun: true,
    });
  } finally {
    spy.mockRestore();
  }

  expect(execCalls.find(([cmd]) => cmd === 'npm')).toBeUndefined();
  const joined = logs.join('\n');
  expect(joined).toMatch(/npm install/);
  expect(joined).toMatch(/--no-save/);
  expect(joined).toMatch(/foodmax-ai-config@latest/);
});
