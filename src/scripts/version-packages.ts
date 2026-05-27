import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VersionPackagesDeps {
  /** Returns array of changeset filenames (e.g., ['fix-thing.md']). Excludes README.md. */
  listChangesets: () => Promise<string[]>;
  /** Runs `pnpm changeset version` which writes package.json + CHANGELOG.md. */
  runChangesetVersion: () => Promise<void>;
  /** Reads the current version from package.json after changeset version has run. */
  readPackageVersion: () => Promise<string>;
  /** Reads the current .claude-plugin/marketplace.json as a plain object. */
  readMarketplace: () => Promise<unknown>;
  /** Writes the updated marketplace.json data back to disk. */
  writeMarketplace: (data: unknown) => Promise<void>;
  /** Reads the current plugin.json as a plain object. */
  readPluginJson: () => Promise<unknown>;
  /** Writes the updated plugin.json data back to disk. */
  writePluginJson: (data: unknown) => Promise<void>;
  gitAdd: (paths: string[]) => Promise<void>;
  gitCommit: (msg: string) => Promise<void>;
  gitPush: (branch: string) => Promise<void>;
}

export interface RunVersionPackagesResult {
  didBump: boolean;
}

export const defaultDeps: VersionPackagesDeps = {
  listChangesets: async () => {
    try {
      const all = await readdir('.changeset');
      return all.filter((f) => f.endsWith('.md') && f !== 'README.md');
    } catch {
      return [];
    }
  },
  runChangesetVersion: async () => {
    await execFileAsync('pnpm', ['changeset', 'version'], { timeout: 60_000 });
  },
  readPackageVersion: async () => {
    const raw = await readFile('package.json', 'utf8');
    return (JSON.parse(raw) as { version: string }).version;
  },
  readMarketplace: async () => {
    const raw = await readFile('.claude-plugin/marketplace.json', 'utf8');
    return JSON.parse(raw) as unknown;
  },
  writeMarketplace: async (data) => {
    await writeFile('.claude-plugin/marketplace.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
  },
  readPluginJson: async () => {
    const raw = await readFile('plugin.json', 'utf8');
    return JSON.parse(raw) as unknown;
  },
  writePluginJson: async (data) => {
    await writeFile('plugin.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
  },
  gitAdd: async (paths) => {
    await execFileAsync('git', ['add', ...paths], { timeout: 10_000 });
  },
  gitCommit: async (msg) => {
    await execFileAsync('git', ['commit', '-m', msg], { timeout: 10_000 });
  },
  gitPush: async (branch) => {
    await execFileAsync('git', ['push', 'origin', branch], { timeout: 60_000 });
  },
};

export async function runVersionPackages(
  deps: VersionPackagesDeps = defaultDeps
): Promise<RunVersionPackagesResult> {
  const changesets = await deps.listChangesets();
  if (changesets.length === 0) {
    console.log('No changesets found; skipping version bump.');
    return { didBump: false };
  }
  console.log(`Found ${changesets.length} changeset(s); bumping version…`);
  await deps.runChangesetVersion();

  // Sync marketplace.json + plugin.json versions to match package.json.
  // Claude Code reads plugin version from plugin.json (shown in `claude plugin
  // list`), so if we don't bump it, every release looks like "Version: <stale>".
  const newVersion = await deps.readPackageVersion();
  const marketplace = await deps.readMarketplace() as { plugins?: Array<{ version: string }> };
  if (marketplace.plugins?.[0]) {
    marketplace.plugins[0].version = newVersion;
  }
  await deps.writeMarketplace(marketplace);

  const pluginJson = await deps.readPluginJson() as { version?: string };
  pluginJson.version = newVersion;
  await deps.writePluginJson(pluginJson);

  await deps.gitAdd([
    'package.json',
    'CHANGELOG.md',
    '.changeset/',
    '.claude-plugin/marketplace.json',
    'plugin.json',
  ]);
  await deps.gitCommit('chore(release): version packages [skip ci]');
  await deps.gitPush('main');
  return { didBump: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVersionPackages().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
