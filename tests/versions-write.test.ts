import { test, expect } from 'vitest';
import {
  updateLatestChannel,
  updateChannel,
  type VersionsJson,
} from '../src/lib/versions-write.js';

const base: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '0.1.0', tag: 'v0.1.0', publishedAt: '2026-01-01T00:00:00Z' },
    beta: { version: '0.2.0-rc.1', tag: 'v0.2.0-rc.1', publishedAt: '2026-02-01T00:00:00Z' },
  },
  deprecated: [],
  minSupportedVersion: '0.1.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

test('updateLatestChannel updates latest with new version + tag + timestamp', () => {
  const next = updateLatestChannel(base, '1.0.0', '2026-05-26T10:00:00Z');
  expect(next.channels.latest).toEqual({
    version: '1.0.0',
    tag: 'v1.0.0',
    publishedAt: '2026-05-26T10:00:00Z',
  });
  expect(next.channels.beta).toEqual(base.channels.beta);
});

test('updateLatestChannel does not mutate input', () => {
  const original = JSON.parse(JSON.stringify(base));
  updateLatestChannel(base, '1.0.0', '2026-05-26T10:00:00Z');
  expect(base).toEqual(original);
});

test('updateChannel works for arbitrary channel name (e.g., beta)', () => {
  const next = updateChannel(base, 'beta', '0.3.0-rc.1', '2026-05-26T10:00:00Z');
  expect(next.channels.beta).toEqual({
    version: '0.3.0-rc.1',
    tag: 'v0.3.0-rc.1',
    publishedAt: '2026-05-26T10:00:00Z',
  });
  expect(next.channels.latest).toEqual(base.channels.latest);
});

test('updateChannel creates new channel if not present', () => {
  const next = updateChannel(base, 'lts', '0.1.5', '2026-05-26T10:00:00Z');
  expect(next.channels.lts).toBeDefined();
  expect(next.channels.lts!.version).toBe('0.1.5');
});

test('updateChannel accepts version with v-prefix and strips it for the version field', () => {
  const next = updateChannel(base, 'latest', 'v2.0.0', '2026-05-26T10:00:00Z');
  expect(next.channels.latest!.version).toBe('2.0.0');
  expect(next.channels.latest!.tag).toBe('v2.0.0');
});
