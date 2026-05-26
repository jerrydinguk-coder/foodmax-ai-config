import { test, expect, vi } from 'vitest';
import { warnIfDeprecated, requireNotBlocked } from '../src/lib/deprecation.js';
import type { VersionsJson } from '../src/lib/versions.js';

const base: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '2.0.0', tag: 'v2.0.0', publishedAt: '2026-05-26T00:00:00Z' },
  },
  deprecated: [
    {
      version: '1.0.0',
      reason: 'minor cosmetic issue',
      fixedIn: '1.0.1',
      deprecatedAt: '2026-05-10T00:00:00Z',
    },
    {
      version: '1.5.0',
      reason: 'critical: MCP registration leaks secret to logs',
      fixedIn: '1.5.1',
      deprecatedAt: '2026-05-20T00:00:00Z',
      severity: 'block',
    },
  ],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

test('warnIfDeprecated prints a warning when version is deprecated (warn severity)', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    warnIfDeprecated(base, '1.0.0');
    expect(spy).toHaveBeenCalled();
    const allOutput = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/deprecated/i);
    expect(allOutput).toMatch(/1\.0\.1/);
  } finally {
    spy.mockRestore();
  }
});

test('warnIfDeprecated also warns for block-severity entries', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    warnIfDeprecated(base, '1.5.0');
    expect(spy).toHaveBeenCalled();
    const allOutput = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/blocked|critical/i);
  } finally {
    spy.mockRestore();
  }
});

test('warnIfDeprecated silent when version is fine', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    warnIfDeprecated(base, '2.0.0');
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test('requireNotBlocked throws on block-severity', () => {
  expect(() => requireNotBlocked(base, '1.5.0')).toThrow(/blocked/i);
});

test('requireNotBlocked allows warn-severity (does not throw)', () => {
  expect(() => requireNotBlocked(base, '1.0.0')).not.toThrow();
});

test('requireNotBlocked allows non-deprecated', () => {
  expect(() => requireNotBlocked(base, '2.0.0')).not.toThrow();
});

test('requireNotBlocked error message includes fixedIn', () => {
  try {
    requireNotBlocked(base, '1.5.0');
    expect.fail('should have thrown');
  } catch (e) {
    expect((e as Error).message).toMatch(/1\.5\.1/);
  }
});
