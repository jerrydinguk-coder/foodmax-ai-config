import semver from 'semver';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

// --- fetchVersions: hit Codeup raw URL, fallback to shallow clone ---

const execFileAsync = promisify(execFile);

const RAW_URL =
  'https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init/-/raw/main/versions.json';

const CLONE_URL =
  'https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git';

export interface FetchVersionsDeps {
  httpGet: (url: string) => Promise<{ ok: boolean; body: string }>;
  shallowCloneVersionsJson: () => Promise<string>;
}

export const defaultFetchDeps: FetchVersionsDeps = {
  httpGet: async (url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return { ok: res.ok, body: await res.text() };
    } catch (e) {
      return { ok: false, body: e instanceof Error ? e.message : String(e) };
    }
  },
  shallowCloneVersionsJson: async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'foodmax-versions-'));
    try {
      await execFileAsync(
        'git',
        ['clone', '--depth=1', '--filter=blob:none', '--no-checkout', CLONE_URL, tmp],
        { timeout: 30_000 }
      );
      await execFileAsync('git', ['-C', tmp, 'checkout', 'main', '--', 'versions.json'], { timeout: 10_000 });
      return await readFile(join(tmp, 'versions.json'), 'utf8');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  },
};

export async function fetchVersions(deps: FetchVersionsDeps = defaultFetchDeps): Promise<VersionsJson> {
  const direct = await deps.httpGet(RAW_URL);
  if (direct.ok) {
    return JSON.parse(direct.body) as VersionsJson;
  }
  try {
    const body = await deps.shallowCloneVersionsJson();
    return JSON.parse(body) as VersionsJson;
  } catch (e) {
    throw new Error(
      `failed to fetch versions.json: raw URL failed (${direct.body}); shallow clone failed (${e instanceof Error ? e.message : String(e)})`
    );
  }
}
