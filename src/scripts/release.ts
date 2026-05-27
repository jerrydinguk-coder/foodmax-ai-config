import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseLatestVersion } from '../lib/changelog.js';

const execFileAsync = promisify(execFile);

export interface ReleaseDeps {
  readPackageVersion: () => Promise<string>;
  readChangelog: () => Promise<string>;
  tagCreate: (tag: string, msg: string) => Promise<void>;
  tagPush: (tag: string, remote: string) => Promise<void>;
  branchPush: (branch: string, remote: string) => Promise<void>;
  npmPublish: () => Promise<void>;
}

export const defaultDeps: ReleaseDeps = {
  readPackageVersion: async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    return pkg.version as string;
  },
  readChangelog: async () => readFile('CHANGELOG.md', 'utf8'),
  tagCreate: async (tag, msg) => {
    await execFileAsync('git', ['tag', '-a', tag, '-m', msg], { timeout: 10_000 });
  },
  tagPush: async (tag, remote) => {
    await execFileAsync('git', ['push', remote, tag], { timeout: 60_000 });
  },
  branchPush: async (branch, remote) => {
    await execFileAsync('git', ['push', remote, branch], { timeout: 60_000 });
  },
  npmPublish: async () => {
    // `npm publish` reads package.json + uses dist/ produced by the prepare
    // hook (tsup). `publishConfig.access=public` in package.json marks the
    // package as public on npm.
    await execFileAsync('npm', ['publish'], { timeout: 180_000 });
  },
};

/**
 * Release flow for v1.0.0+:
 *   1. Verify CHANGELOG.md latest matches package.json version
 *   2. Create + push git tag to origin (Codeup, the dev source)
 *   3. Push current branch to github remote (the public mirror)
 *   4. Push tag to github remote too
 *   5. npm publish (zero-auth install path for teammates)
 */
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
  await deps.tagPush(tag, 'origin');
  console.log(`✓ Tagged + pushed ${tag} to origin (Codeup)`);

  // Mirror to GitHub public repo (consumers' marketplace source). The remote
  // is named `github` by convention; first-time setup is documented in README.
  await deps.branchPush('main', 'github');
  await deps.tagPush(tag, 'github');
  console.log(`✓ Pushed main + ${tag} to github (public mirror)`);

  await deps.npmPublish();
  console.log(`✓ npm publish ${tag} — teammates can now \`npx -y foodmax-ai-config@${version} init\``);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRelease().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
