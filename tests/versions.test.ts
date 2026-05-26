import { test, expect } from 'vitest';
import { resolveVersion, checkDeprecated, type VersionsJson } from '../src/lib/versions.js';

const fakeVersions: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '1.2.3', tag: 'v1.2.3', publishedAt: '2026-05-26T00:00:00Z' },
    beta: { version: '1.3.0-rc.1', tag: 'v1.3.0-rc.1', publishedAt: '2026-05-25T00:00:00Z' },
  },
  deprecated: [
    { version: '1.1.0', reason: 'critical bug', fixedIn: '1.1.1', deprecatedAt: '2026-05-10T00:00:00Z' },
  ],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

test('resolveVersion default returns latest channel tag', () => {
  const r = resolveVersion(fakeVersions, {});
  expect(r).toEqual({ tag: 'v1.2.3', version: '1.2.3', source: 'channel', channel: 'latest' });
});

test('resolveVersion --channel beta returns beta tag', () => {
  const r = resolveVersion(fakeVersions, { channel: 'beta' });
  expect(r).toEqual({ tag: 'v1.3.0-rc.1', version: '1.3.0-rc.1', source: 'channel', channel: 'beta' });
});

test('resolveVersion --version 1.2.3 returns explicit tag', () => {
  const r = resolveVersion(fakeVersions, { version: '1.2.3' });
  expect(r).toEqual({ tag: 'v1.2.3', version: '1.2.3', source: 'explicit-version' });
});

test('resolveVersion --version with v prefix is accepted', () => {
  const r = resolveVersion(fakeVersions, { version: 'v1.2.3' });
  expect(r.tag).toBe('v1.2.3');
  expect(r.version).toBe('1.2.3');
});

test('resolveVersion errors when both --version and --channel given', () => {
  expect(() => resolveVersion(fakeVersions, { version: '1.2.3', channel: 'beta' })).toThrow(/mutually exclusive/i);
});

test('resolveVersion errors when channel does not exist', () => {
  expect(() => resolveVersion(fakeVersions, { channel: 'nonexistent' })).toThrow(/channel "nonexistent"/i);
});

test('resolveVersion errors when --version is not a valid semver', () => {
  expect(() => resolveVersion(fakeVersions, { version: 'not-a-version' })).toThrow(/invalid semver/i);
});

test('checkDeprecated returns matching entry when version is deprecated', () => {
  const r = checkDeprecated(fakeVersions, '1.1.0');
  expect(r).toEqual(fakeVersions.deprecated[0]);
});

test('checkDeprecated returns null when version is fine', () => {
  expect(checkDeprecated(fakeVersions, '1.2.3')).toBeNull();
});
