import { test, expect, vi } from 'vitest';
import { showStartupBannerIfDeprecated, type StartupBannerDeps } from '../src/lib/startup-banner.js';
import type { VersionsJson } from '../src/lib/versions.js';

const versionsWithDeprecated: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '2.0.0', tag: 'v2.0.0', publishedAt: '2026-05-26T00:00:00Z' },
  },
  deprecated: [
    {
      version: '1.0.0',
      reason: 'has a bug',
      fixedIn: '1.0.1',
      deprecatedAt: '2026-05-10T00:00:00Z',
    },
  ],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

function makeDeps(
  projectVersion: string | null,
  versions: VersionsJson | null,
  fetchTimedOut = false
): StartupBannerDeps {
  return {
    readProjectLockfileVersion: async () => projectVersion,
    fetchVersionsWithTimeout: async () => {
      if (fetchTimedOut) return null;
      return versions;
    },
  };
}

test('shows banner when project lockfile version is deprecated', async () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await showStartupBannerIfDeprecated(makeDeps('1.0.0', versionsWithDeprecated));
    const out = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toMatch(/deprecated/i);
    expect(out).toMatch(/1\.0\.1/);
  } finally {
    spy.mockRestore();
  }
});

test('silent when project version is fine', async () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await showStartupBannerIfDeprecated(makeDeps('2.0.0', versionsWithDeprecated));
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test('silent when no project lockfile present (project may not be init-ed yet)', async () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await showStartupBannerIfDeprecated(makeDeps(null, versionsWithDeprecated));
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test('silent when versions.json fetch times out (offline / mirror down)', async () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await showStartupBannerIfDeprecated(makeDeps('1.0.0', versionsWithDeprecated, true));
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});
