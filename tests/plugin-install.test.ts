import { test, expect } from 'vitest';
import { installPlugin, type Exec } from '../src/lib/plugin-install.js';

test('installPlugin invokes marketplace add then install', async () => {
  const calls: Array<[string, string[]]> = [];
  const fakeExec: Exec = async (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: '', stderr: '' };
  };

  const r = await installPlugin({
    source: 'https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git',
    marketplaceName: 'foodmax-ai-config',
    pluginName: 'foodmax-ai-config',
    scope: 'user',
    exec: fakeExec,
  });

  expect(r.ok).toBe(true);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(['claude', ['plugin', 'marketplace', 'add', 'https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git']]);
  expect(calls[1]).toEqual(['claude', ['plugin', 'install', 'foodmax-ai-config@foodmax-ai-config', '--scope', 'user']]);
});

test('installPlugin returns error if exec throws', async () => {
  const fakeExec: Exec = async () => {
    throw new Error('boom');
  };
  const r = await installPlugin({
    source: 'github:x/y',
    marketplaceName: 'm',
    pluginName: 'p',
    scope: 'user',
    exec: fakeExec,
  });
  expect(r.ok).toBe(false);
});
