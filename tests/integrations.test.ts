import { test, expect } from 'vitest';
import {
  installSuperpowers,
  registerPlaywrightMcp,
  registerFeishuMcp,
  ensureLarkCli,
  runAllIntegrations,
  parseMcpListNames,
} from '../src/lib/integrations.js';
import type { Exec } from '../src/lib/plugin-install.js';

const noopExec: Exec = async () => ({ stdout: '', stderr: '' });

test('parseMcpListNames extracts first-column name even when it has spaces', () => {
  const sample = [
    '',
    'Checking MCP server health…',
    '',
    'claude.ai Google Drive: https://drivemcp.googleapis.com/mcp/v1 - ! Needs authentication',
    'chrome-devtools: npx -y chrome-devtools-mcp@latest --browser-url http://127.0.0.1:9222 - ✓ Connected',
    'playwright: npx -y @playwright/mcp@latest - ✓ Connected',
    '',
  ].join('\n');
  expect(parseMcpListNames(sample)).toEqual([
    'claude.ai Google Drive',
    'chrome-devtools',
    'playwright',
  ]);
});

test('parseMcpListNames returns [] for empty input', () => {
  expect(parseMcpListNames('')).toEqual([]);
});

test('installSuperpowers: happy path returns installed', async () => {
  const calls: Array<[string, string[]]> = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };
  const r = await installSuperpowers({ exec });
  expect(r.status).toBe('installed');
  expect(calls[0]).toEqual(['claude', ['plugin', 'marketplace', 'add', 'github:obra/superpowers']]);
  expect(calls[1]).toEqual([
    'claude',
    ['plugin', 'install', 'superpowers@superpowers-dev', '--scope', 'user'],
  ]);
});

test('installSuperpowers: exec throws → failed (does not raise)', async () => {
  const exec: Exec = async () => {
    throw new Error('boom');
  };
  const r = await installSuperpowers({ exec });
  expect(r.status).toBe('failed');
  expect(r.reason).toContain('boom');
});

test('registerPlaywrightMcp: registers when absent', async () => {
  const calls: Array<[string, string[]]> = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };
  const r = await registerPlaywrightMcp({
    exec,
    listMcpNames: async () => ['chrome-devtools'],
  });
  expect(r.status).toBe('installed');
  expect(calls).toHaveLength(1);
  const [cmd, args] = calls[0]!;
  expect(cmd).toBe('claude');
  // Match args.slice(0, 8) exactly; final arg (package@version) checked by regex
  // so a version bump doesn't churn this assertion.
  expect(args.slice(0, 8)).toEqual([
    'mcp',
    'add',
    'playwright',
    '--scope',
    'user',
    '--',
    'npx',
    '-y',
  ]);
  expect(args[8]).toMatch(/^@playwright\/mcp@\d+\.\d+\.\d+$/);
});

test('registerPlaywrightMcp: skips when already registered', async () => {
  const calls: Array<[string, string[]]> = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };
  const r = await registerPlaywrightMcp({
    exec,
    listMcpNames: async () => ['playwright', 'chrome-devtools'],
  });
  expect(r.status).toBe('skipped');
  expect(calls).toHaveLength(0);
});

test('registerPlaywrightMcp: skipped result carries hint about --force-mcp', async () => {
  const r = await registerPlaywrightMcp({
    exec: async () => ({ stdout: '', stderr: '' }),
    listMcpNames: async () => ['playwright'],
  });
  expect(r.status).toBe('skipped');
  expect(r.hint).toBeTruthy();
  expect(r.hint).toMatch(/--force-mcp/);
});

test('registerPlaywrightMcp: failed on exec throw', async () => {
  const exec: Exec = async () => {
    throw new Error('mcp add boom');
  };
  const r = await registerPlaywrightMcp({
    exec,
    listMcpNames: async () => [],
  });
  expect(r.status).toBe('failed');
});

test('registerFeishuMcp: registers when absent (uses sh -c wrapper, env vars NOT interpolated at init)', async () => {
  const calls: Array<[string, string[]]> = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };
  const r = await registerFeishuMcp({
    exec,
    listMcpNames: async () => [],
  });
  expect(r.status).toBe('installed');
  expect(calls).toHaveLength(1);
  const [cmd, args] = calls[0]!;
  expect(cmd).toBe('claude');
  // Must use sh -c wrapper, must contain the literal $LARK_APP_ID (not the resolved value)
  expect(args).toContain('sh');
  expect(args).toContain('-c');
  const shellCmd = args[args.length - 1]!;
  expect(shellCmd).toContain('$LARK_APP_ID');
  expect(shellCmd).toContain('$LARK_APP_SECRET');
  expect(shellCmd).toMatch(/@larksuiteoapi\/lark-mcp@\d+\.\d+\.\d+/);
});

test('registerFeishuMcp: skips when already registered', async () => {
  let called = false;
  const exec: Exec = async () => {
    called = true;
    return { stdout: '', stderr: '' };
  };
  const r = await registerFeishuMcp({
    exec,
    listMcpNames: async () => ['feishu'],
  });
  expect(r.status).toBe('skipped');
  expect(called).toBe(false);
});

test('registerFeishuMcp: skipped result carries hint about --force-mcp', async () => {
  const r = await registerFeishuMcp({
    exec: async () => ({ stdout: '', stderr: '' }),
    listMcpNames: async () => ['feishu'],
  });
  expect(r.status).toBe('skipped');
  expect(r.hint).toBeTruthy();
  expect(r.hint).toMatch(/--force-mcp/);
});

test('registerFeishuMcp: failed on exec throw', async () => {
  const exec: Exec = async () => {
    throw new Error('boom');
  };
  const r = await registerFeishuMcp({ exec, listMcpNames: async () => [] });
  expect(r.status).toBe('failed');
});

test('ensureLarkCli: skips when already present', async () => {
  let called = false;
  const exec: Exec = async () => {
    called = true;
    return { stdout: '', stderr: '' };
  };
  const r = await ensureLarkCli({
    exec,
    larkCliPresent: async () => true,
  });
  expect(r.status).toBe('skipped');
  expect(called).toBe(false);
});

test('ensureLarkCli: installs when missing', async () => {
  const calls: Array<[string, string[]]> = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };
  const r = await ensureLarkCli({
    exec,
    larkCliPresent: async () => false,
  });
  expect(r.status).toBe('installed');
  expect(calls).toEqual([['npm', ['install', '-g', '@larksuite/cli']]]);
});

test('ensureLarkCli: failed when install throws', async () => {
  const exec: Exec = async () => {
    throw new Error('no network');
  };
  const r = await ensureLarkCli({
    exec,
    larkCliPresent: async () => false,
  });
  expect(r.status).toBe('failed');
});

test('runAllIntegrations: returns 4 results, does not throw if one fails', async () => {
  // Make playwright register fail (exec throws on its second call); others succeed.
  let n = 0;
  const exec: Exec = async (cmd, args) => {
    n++;
    // Call layout:
    //  1, 2: superpowers (marketplace add + install)
    //  3:    playwright mcp add — throw here
    //  4:    feishu mcp add
    //  5:    npm install -g lark-cli (only if larkCliPresent=false)
    if (n === 3) throw new Error('playwright boom');
    return { stdout: '', stderr: '' };
  };
  const results = await runAllIntegrations({
    exec,
    listMcpNames: async () => [],
    larkCliPresent: async () => false,
  });
  expect(results).toHaveLength(4);
  const byName = Object.fromEntries(results.map((r) => [r.name, r.status]));
  expect(byName['superpowers']).toBe('installed');
  expect(byName['playwright-mcp']).toBe('failed');
  expect(byName['feishu-mcp']).toBe('installed');
  expect(byName['lark-cli']).toBe('installed');
});

test('runAllIntegrations: when MCPs already registered + lark-cli present → all skipped', async () => {
  const calls: Array<[string, string[]]> = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };
  const results = await runAllIntegrations({
    exec,
    listMcpNames: async () => ['playwright', 'feishu'],
    larkCliPresent: async () => true,
  });
  expect(results).toHaveLength(4);
  // superpowers still runs (idempotent on Claude's side); MCPs + lark-cli skipped
  expect(results.find((r) => r.name === 'superpowers')!.status).toBe('installed');
  expect(results.find((r) => r.name === 'playwright-mcp')!.status).toBe('skipped');
  expect(results.find((r) => r.name === 'feishu-mcp')!.status).toBe('skipped');
  expect(results.find((r) => r.name === 'lark-cli')!.status).toBe('skipped');
  // Only the 2 superpowers exec calls happened
  expect(calls).toHaveLength(2);
});
