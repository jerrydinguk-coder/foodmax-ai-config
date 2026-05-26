import semver from 'semver';

export interface ChannelEntry {
  version: string;
  tag: string;
  publishedAt: string;
  notes?: string;
}

export interface DeprecatedEntry {
  version: string;
  reason: string;
  fixedIn: string;
  deprecatedAt: string;
}

export interface VersionsJson {
  schemaVersion: number;
  channels: Record<string, ChannelEntry>;
  deprecated: DeprecatedEntry[];
  minSupportedVersion: string;
  peerRequirements: {
    claudeCode: string;
    node: string;
  };
}

export interface ResolveOpts {
  channel?: string;
  version?: string;
}

export type ResolvedVersion =
  | { tag: string; version: string; source: 'channel'; channel: string }
  | { tag: string; version: string; source: 'explicit-version' };

export function resolveVersion(v: VersionsJson, opts: ResolveOpts): ResolvedVersion {
  if (opts.version && opts.channel) {
    throw new Error('--version and --channel are mutually exclusive');
  }
  if (opts.version) {
    const clean = opts.version.replace(/^v/, '');
    if (!semver.valid(clean)) {
      throw new Error(`invalid semver: ${opts.version}`);
    }
    return { tag: `v${clean}`, version: clean, source: 'explicit-version' };
  }
  const channelName = opts.channel ?? 'latest';
  const entry = v.channels[channelName];
  if (!entry) {
    const available = Object.keys(v.channels).join(', ');
    throw new Error(`channel "${channelName}" not found (available: ${available})`);
  }
  return { tag: entry.tag, version: entry.version, source: 'channel', channel: channelName };
}

export function checkDeprecated(v: VersionsJson, version: string): DeprecatedEntry | null {
  return v.deprecated.find((d) => d.version === version) ?? null;
}
