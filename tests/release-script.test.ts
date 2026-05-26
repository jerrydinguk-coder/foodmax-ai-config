import { test, expect } from 'vitest';
import { runRelease, type ReleaseDeps } from '../src/scripts/release.js';
import type { VersionsJson } from '../src/lib/versions.js';

const baseVersions: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '0.1.0', tag: 'v0.1.0', publishedAt: '2026-01-01T00:00:00Z' },
  },
  deprecated: [],
  minSupportedVersion: '0.1.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

function makeDeps(overrides: Partial<ReleaseDeps> = {}): {
  deps: ReleaseDeps;
  calls: {
    tagCreate: string[];
    tagPush: string[];
    gitAdd: string[][];
    gitCommit: string[];
    gitPush: string[];
  };
  writtenVersions: { current?: VersionsJson };
} {
  const writtenVersions: { current?: VersionsJson } = {};
  const calls = {
    tagCreate: [] as string[],
    tagPush: [] as string[],
    gitAdd: [] as string[][],
    gitCommit: [] as string[],
    gitPush: [] as string[],
  };
  const deps: ReleaseDeps = {
    readPackageVersion: async () => '0.2.0',
    readChangelog: async () => `# CHANGELOG\n\n## [0.2.0] - 2026-05-26\n\n### Added\n- thing\n`,
    readVersionsJson: async () => baseVersions,
    writeVersionsJson: async (v) => {
      writtenVersions.current = v;
    },
    now: () => '2026-05-26T10:00:00Z',
    tagCreate: async (tag) => {
      calls.tagCreate.push(tag);
    },
    tagPush: async (tag) => {
      calls.tagPush.push(tag);
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
  return { deps, calls, writtenVersions };
}

test('runRelease creates annotated tag v<version> and pushes it', async () => {
  const { deps, calls } = makeDeps();
  await runRelease(deps);
  expect(calls.tagCreate).toEqual(['v0.2.0']);
  expect(calls.tagPush).toEqual(['v0.2.0']);
});

test('runRelease updates versions.json latest channel + commits with [skip ci]', async () => {
  const { deps, calls, writtenVersions } = makeDeps();
  await runRelease(deps);
  expect(writtenVersions.current!.channels.latest).toEqual({
    version: '0.2.0',
    tag: 'v0.2.0',
    publishedAt: '2026-05-26T10:00:00Z',
  });
  expect(calls.gitAdd[0]).toContain('versions.json');
  expect(calls.gitCommit[0]).toMatch(/release.*v0\.2\.0.*\[skip ci\]/i);
  expect(calls.gitPush[0]).toBe('main');
});

test('runRelease fails when CHANGELOG.md has no entry for current package version', async () => {
  const { deps } = makeDeps({
    readPackageVersion: async () => '0.3.0',
    readChangelog: async () => `# CHANGELOG\n\n## [0.2.0] - 2026-05-26\n`,
  });
  await expect(runRelease(deps)).rejects.toThrow(/CHANGELOG.*0\.3\.0/);
});

test('runRelease idempotent: if tag already exists locally, fails clearly', async () => {
  const { deps } = makeDeps({
    tagCreate: async () => {
      throw new Error("fatal: tag 'v0.2.0' already exists");
    },
  });
  await expect(runRelease(deps)).rejects.toThrow(/already exists/);
});
