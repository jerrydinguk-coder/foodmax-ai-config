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

test('registerPlaywrightMcp: registers when absent (eager-installs pkg first, then claude mcp add)', async () => {
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
  expect(calls).toHaveLength(2);

  // 1. npm install -g @playwright/mcp@<pinned> — runs FIRST so the package is
  //    materialized on disk before Claude spawns the MCP for the first time.
  const [installCmd, installArgs] = calls[0]!;
  expect(installCmd).toBe('npm');
  expect(installArgs[0]).toBe('install');
  expect(installArgs[1]).toBe('-g');
  expect(installArgs[2]).toMatch(/^@playwright\/mcp@\d+\.\d+\.\d+$/);

  // 2. claude mcp add ... (regex-based version match so bumps don't churn)
  const [addCmd, addArgs] = calls[1]!;
  expect(addCmd).toBe('claude');
  expect(addArgs.slice(0, 8)).toEqual([
    'mcp', 'add', 'playwright', '--scope', 'user', '--', 'npx', '-y',
  ]);
  expect(addArgs[8]).toMatch(/^@playwright\/mcp@\d+\.\d+\.\d+$/);
});

test('registerPlaywrightMcp: still eager-installs pkg even when MCP already registered', async () => {
  // The point of eager install is to materialize the package on disk regardless
  // of Claude's registration state — so a re-run guarantees the pinned version
  // is available even if a previous init was interrupted after registration.
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
  expect(calls).toHaveLength(1);
  expect(calls[0]![0]).toBe('npm');
  expect(calls[0]![1].slice(0, 2)).toEqual(['install', '-g']);
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

test('registerFeishuMcp: registers when absent (eager-installs lark-mcp first, then claude mcp add with sh -c wrapper)', async () => {
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
  expect(calls).toHaveLength(2);

  // 1. npm install -g @larksuiteoapi/lark-mcp@<pinned>
  const [installCmd, installArgs] = calls[0]!;
  expect(installCmd).toBe('npm');
  expect(installArgs[0]).toBe('install');
  expect(installArgs[1]).toBe('-g');
  expect(installArgs[2]).toMatch(/^@larksuiteoapi\/lark-mcp@\d+\.\d+\.\d+$/);

  // 2. claude mcp add feishu --scope user -- sh -c '<shell with $env placeholders>'
  const [addCmd, addArgs] = calls[1]!;
  expect(addCmd).toBe('claude');
  expect(addArgs).toContain('sh');
  expect(addArgs).toContain('-c');
  const shellCmd = addArgs[addArgs.length - 1]!;
  expect(shellCmd).toContain('$LARK_APP_ID');
  expect(shellCmd).toContain('$LARK_APP_SECRET');
  expect(shellCmd).toMatch(/@larksuiteoapi\/lark-mcp@\d+\.\d+\.\d+/);
});

test('registerFeishuMcp: still eager-installs lark-mcp even when MCP already registered', async () => {
  const calls: Array<[string, string[]]> = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };
  const r = await registerFeishuMcp({
    exec,
    listMcpNames: async () => ['feishu'],
  });
  expect(r.status).toBe('skipped');
  expect(calls).toHaveLength(1);
  expect(calls[0]![0]).toBe('npm');
  expect(calls[0]![1].slice(0, 2)).toEqual(['install', '-g']);
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
  // Make playwright fail at its eager-install step; others succeed.
  let n = 0;
  const exec: Exec = async () => {
    n++;
    // Call layout (when MCPs absent + lark-cli absent):
    //  1, 2: superpowers (marketplace add + plugin install)
    //  3:    playwright `npm install -g @playwright/mcp@<v>` — throw here
    //  4:    playwright `claude mcp add ...`        (skipped, because step 3 threw)
    //  5:    feishu `npm install -g @larksuiteoapi/lark-mcp@<v>`
    //  6:    feishu `claude mcp add ...`
    //  7:    lark-cli `npm install -g @larksuite/cli`
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

test('runAllIntegrations: when MCPs already registered + lark-cli present → MCP packages still eager-installed', async () => {
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
  // superpowers always runs (idempotent on Claude's side); MCP registration
  // skipped (already there); MCP packages STILL eager-installed; lark-cli skipped.
  expect(results.find((r) => r.name === 'superpowers')!.status).toBe('installed');
  expect(results.find((r) => r.name === 'playwright-mcp')!.status).toBe('skipped');
  expect(results.find((r) => r.name === 'feishu-mcp')!.status).toBe('skipped');
  expect(results.find((r) => r.name === 'lark-cli')!.status).toBe('skipped');
  // 2 superpowers + 1 playwright install + 1 feishu install = 4 calls
  expect(calls).toHaveLength(4);
  const npmInstallCalls = calls.filter(([cmd, args]) => cmd === 'npm' && args[0] === 'install' && args[1] === '-g');
  expect(npmInstallCalls).toHaveLength(2);
});
