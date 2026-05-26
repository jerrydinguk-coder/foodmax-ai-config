import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VersionPackagesDeps {
  /** Returns array of changeset filenames (e.g., ['fix-thing.md']). Excludes README.md. */
  listChangesets: () => Promise<string[]>;
  /** Runs `pnpm changeset version` which writes package.json + CHANGELOG.md. */
  runChangesetVersion: () => Promise<void>;
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
  await deps.gitAdd(['package.json', 'CHANGELOG.md', '.changeset/']);
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
