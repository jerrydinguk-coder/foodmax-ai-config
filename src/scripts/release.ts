import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { VersionsJson } from '../lib/versions.js';
import { updateLatestChannel } from '../lib/versions-write.js';
import { parseLatestVersion } from '../lib/changelog.js';

const execFileAsync = promisify(execFile);

export interface ReleaseDeps {
  readPackageVersion: () => Promise<string>;
  readChangelog: () => Promise<string>;
  readVersionsJson: () => Promise<VersionsJson>;
  writeVersionsJson: (v: VersionsJson) => Promise<void>;
  now: () => string;
  tagCreate: (tag: string, msg: string) => Promise<void>;
  tagPush: (tag: string) => Promise<void>;
  gitAdd: (paths: string[]) => Promise<void>;
  gitCommit: (msg: string) => Promise<void>;
  gitPush: (branch: string) => Promise<void>;
}

export const defaultDeps: ReleaseDeps = {
  readPackageVersion: async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    return pkg.version as string;
  },
  readChangelog: async () => readFile('CHANGELOG.md', 'utf8'),
  readVersionsJson: async () =>
    JSON.parse(await readFile('versions.json', 'utf8')) as VersionsJson,
  writeVersionsJson: async (v) =>
    writeFile('versions.json', JSON.stringify(v, null, 2) + '\n'),
  now: () => new Date().toISOString(),
  tagCreate: async (tag, msg) => {
    await execFileAsync('git', ['tag', '-a', tag, '-m', msg], { timeout: 10_000 });
  },
  tagPush: async (tag) => {
    await execFileAsync('git', ['push', 'origin', tag], { timeout: 60_000 });
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

export async function runRelease(deps: ReleaseDeps = defaultDeps): Promise<void> {
  const version = await deps.readPackageVersion();
  const tag = `v${version}`;
  console.log(`Releasing ${tag}…`);

  const changelog = await deps.readChangelog();
  const latestInChangelog = parseLatestVersion(changelog);
  if (latestInChangelog !== version) {
    throw new Error(
      `CHANGELOG.md latest entry is ${latestInChangelog ?? '(none)'} but package.json version is ${version}. Run \`pnpm changeset version\` first.`
    );
  }

  await deps.tagCreate(tag, `Release ${tag}`);
  await deps.tagPush(tag);
  console.log(`✓ Tagged + pushed ${tag}`);

  const current = await deps.readVersionsJson();
  const updated = updateLatestChannel(current, version, deps.now());
  await deps.writeVersionsJson(updated);
  await deps.gitAdd(['versions.json']);
  await deps.gitCommit(`chore(release): bump versions.json to ${tag} [skip ci]`);
  await deps.gitPush('main');
  console.log(`✓ Updated versions.json + pushed`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRelease().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
