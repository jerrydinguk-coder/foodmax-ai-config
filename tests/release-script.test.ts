import { test, expect } from 'vitest';
import { runRelease, type ReleaseDeps } from '../src/scripts/release.js';

function makeDeps(overrides: Partial<ReleaseDeps> = {}): {
  deps: ReleaseDeps;
  calls: {
    tagCreate: string[];
    tagPushOrigin: string[];
    tagPushGithub: string[];
    branchPushGithub: string[];
    npmPublish: number;
  };
} {
  const calls = {
    tagCreate: [] as string[],
    tagPushOrigin: [] as string[],
    tagPushGithub: [] as string[],
    branchPushGithub: [] as string[],
    npmPublish: 0,
  };
  const deps: ReleaseDeps = {
    readPackageVersion: async () => '1.0.0',
    readChangelog: async () => `# CHANGELOG\n\n## 1.0.0\n\n- thing\n`,
    tagCreate: async (tag) => {
      calls.tagCreate.push(tag);
    },
    tagPush: async (tag, remote) => {
      if (remote === 'origin') calls.tagPushOrigin.push(tag);
      else if (remote === 'github') calls.tagPushGithub.push(tag);
    },
    branchPush: async (branch, remote) => {
      if (remote === 'github') calls.branchPushGithub.push(branch);
    },
    npmPublish: async () => {
      calls.npmPublish += 1;
    },
    ...overrides,
  };
  return { deps, calls };
}

test('runRelease creates annotated tag v<version> and pushes to origin', async () => {
  const { deps, calls } = makeDeps();
  await runRelease(deps);
  expect(calls.tagCreate).toEqual(['v1.0.0']);
  expect(calls.tagPushOrigin).toEqual(['v1.0.0']);
});

test('runRelease pushes branch main + tag to github mirror', async () => {
  const { deps, calls } = makeDeps();
  await runRelease(deps);
  expect(calls.branchPushGithub).toEqual(['main']);
  expect(calls.tagPushGithub).toEqual(['v1.0.0']);
});

test('runRelease publishes to npm exactly once', async () => {
  const { deps, calls } = makeDeps();
  await runRelease(deps);
  expect(calls.npmPublish).toBe(1);
});

test('runRelease fails when CHANGELOG.md has no entry for current package version', async () => {
  const { deps } = makeDeps({
    readPackageVersion: async () => '1.0.1',
    readChangelog: async () => `# CHANGELOG\n\n## 1.0.0\n`,
  });
  await expect(runRelease(deps)).rejects.toThrow(/CHANGELOG.*1\.0\.1/);
});

test('runRelease bubbles up tag-already-exists error', async () => {
  const { deps } = makeDeps({
    tagCreate: async () => {
      throw new Error("fatal: tag 'v1.0.0' already exists");
    },
  });
  await expect(runRelease(deps)).rejects.toThrow(/already exists/);
});

test('runRelease bubbles up npm publish failure', async () => {
  const { deps } = makeDeps({
    npmPublish: async () => {
      throw new Error('npm ERR! 403 Forbidden');
    },
  });
  await expect(runRelease(deps)).rejects.toThrow(/403/);
});
