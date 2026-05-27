import { test, expect } from 'vitest';
import { runVersionPackages, type VersionPackagesDeps } from '../src/scripts/version-packages.js';

function makeDeps(overrides: Partial<VersionPackagesDeps> = {}): {
  deps: VersionPackagesDeps;
  calls: {
    listChangesets: string[];
    runChangesetVersion: number;
    gitAdd: string[][];
    gitCommit: string[];
    gitPush: string[];
    writeMarketplace: unknown[];
  };
} {
  const calls = {
    listChangesets: [] as string[],
    runChangesetVersion: 0,
    gitAdd: [] as string[][],
    gitCommit: [] as string[],
    gitPush: [] as string[],
    writeMarketplace: [] as unknown[],
    writePluginJson: [] as unknown[],
  };
  const deps: VersionPackagesDeps = {
    listChangesets: async () => {
      calls.listChangesets.push('called');
      return ['fix-thing.md', 'add-other.md'];
    },
    runChangesetVersion: async () => {
      calls.runChangesetVersion++;
    },
    readPackageVersion: async () => 'new',
    readMarketplace: async () => ({ plugins: [{ version: 'old', name: 'foodmax-ai-config' }] }),
    writeMarketplace: async (data) => {
      calls.writeMarketplace.push(data);
    },
    readPluginJson: async () => ({ name: 'foodmax-ai-config', version: 'old' }),
    writePluginJson: async (data) => {
      calls.writePluginJson.push(data);
    },
    gitAdd: async (paths) => {
      calls.gitAdd.push(paths);
    },
    gitCommit: async (msg) => {
      calls.gitCommit.push(msg);
    },
    gitPush: async (branch) => {
      calls.gitPush.push(branch);
    },
    ...overrides,
  };
  return { deps, calls };
}

test('runVersionPackages skips when no changesets present', async () => {
  const { deps, calls } = makeDeps({
    listChangesets: async () => [],
  });
  const result = await runVersionPackages(deps);
  expect(result.didBump).toBe(false);
  expect(calls.runChangesetVersion).toBe(0);
  expect(calls.gitCommit.length).toBe(0);
});

test('runVersionPackages: changesets present → version + commit + push', async () => {
  const { deps, calls } = makeDeps();
  const result = await runVersionPackages(deps);
  expect(result.didBump).toBe(true);
  expect(calls.runChangesetVersion).toBe(1);
  expect(calls.gitAdd[0]).toContain('package.json');
  expect(calls.gitAdd[0]).toContain('CHANGELOG.md');
  expect(calls.gitCommit[0]).toMatch(/chore.*version packages/i);
  expect(calls.gitPush[0]).toBe('main');
});

test('runVersionPackages commit message ends with [skip ci] so it does not re-trigger CI', async () => {
  const { deps, calls } = makeDeps();
  await runVersionPackages(deps);
  expect(calls.gitCommit[0]).toMatch(/\[skip ci\]/);
});

test('runVersionPackages syncs marketplace.json version from package.json after bump', async () => {
  const { deps, calls } = makeDeps();
  await runVersionPackages(deps);
  expect(calls.writeMarketplace).toHaveLength(1);
  const written = calls.writeMarketplace[0] as { plugins: Array<{ version: string }> };
  expect(written.plugins[0]!.version).toBe('new');
  expect(calls.gitAdd[0]).toContain('.claude-plugin/marketplace.json');
});

test('runVersionPackages also syncs plugin.json version (Claude reads it for display)', async () => {
  const { deps, calls } = makeDeps();
  await runVersionPackages(deps);
  expect(calls.writePluginJson).toHaveLength(1);
  const written = calls.writePluginJson[0] as { version: string };
  expect(written.version).toBe('new');
  expect(calls.gitAdd[0]).toContain('plugin.json');
});
