import { test, expect } from 'vitest';
import { runPreRelease, type PreReleaseDeps, type CheckResult } from '../src/scripts/pre-release.js';

function makeDeps(overrides: Partial<PreReleaseDeps> = {}): PreReleaseDeps {
  return {
    runTypecheck: async () => ({ ok: true }),
    runTests: async () => ({ ok: true }),
    runBuild: async () => ({ ok: true }),
    checkLockfileDrift: async () => ({ ok: true }),
    runAudit: async () => ({ ok: true }),
    checkWorkingTreeClean: async () => ({ ok: true }),
    checkNpmLoggedIn: async () => ({ ok: true }),
    ...overrides,
  };
}

test('runPreRelease succeeds when all checks pass', async () => {
  const result = await runPreRelease(makeDeps());
  expect(result.ok).toBe(true);
  expect(result.failures).toEqual([]);
});

test('runPreRelease reports typecheck failure', async () => {
  const result = await runPreRelease(
    makeDeps({ runTypecheck: async () => ({ ok: false, reason: 'TS2322 in foo.ts' }) })
  );
  expect(result.ok).toBe(false);
  expect(result.failures).toContainEqual({ check: 'typecheck', reason: 'TS2322 in foo.ts' });
});

test('runPreRelease aggregates multiple failures, does not short-circuit', async () => {
  const result = await runPreRelease(
    makeDeps({
      runTests: async () => ({ ok: false, reason: '3 tests failed' }),
      runAudit: async () => ({ ok: false, reason: '1 high CVE: lodash<4.17.21' }),
    })
  );
  expect(result.ok).toBe(false);
  expect(result.failures).toHaveLength(2);
  expect(result.failures.map((f) => f.check).sort()).toEqual(['audit', 'tests']);
});

test('runPreRelease working tree dirty -> failure', async () => {
  const result = await runPreRelease(
    makeDeps({ checkWorkingTreeClean: async () => ({ ok: false, reason: '2 uncommitted files' }) })
  );
  expect(result.ok).toBe(false);
  expect(result.failures[0]?.check).toBe('working-tree');
});

test('runPreRelease lockfile drift -> failure', async () => {
  const result = await runPreRelease(
    makeDeps({ checkLockfileDrift: async () => ({ ok: false, reason: '.locked.json out of date' }) })
  );
  expect(result.ok).toBe(false);
  expect(result.failures[0]?.check).toBe('lockfile');
});
