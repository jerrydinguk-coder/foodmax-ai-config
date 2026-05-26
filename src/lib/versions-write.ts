import type { VersionsJson, ChannelEntry } from './versions.js';
export type { VersionsJson, ChannelEntry } from './versions.js';

export function updateLatestChannel(
  current: VersionsJson,
  newVersion: string,
  publishedAt: string
): VersionsJson {
  return updateChannel(current, 'latest', newVersion, publishedAt);
}

export function updateChannel(
  current: VersionsJson,
  channelName: string,
  newVersion: string,
  publishedAt: string
): VersionsJson {
  const tag = newVersion.startsWith('v') ? newVersion : `v${newVersion}`;
  const version = newVersion.replace(/^v/, '');
  const nextEntry: ChannelEntry = { version, tag, publishedAt };
  return {
    ...current,
    channels: {
      ...current.channels,
      [channelName]: nextEntry,
    },
  };
}
