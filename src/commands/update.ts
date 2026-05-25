import type { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readLockfile,
} from '../lib/lockfile.js';
import {
  packageLockfileName,
  projectLockfileName,
} from '../lib/paths.js';
import { installPlugin, defaultExec, type Exec } from '../lib/plugin-install.js';
import { ok, fail, info } from '../lib/log.js';
import {
  FOODMAX_PACKAGE as PACKAGE_NAME,
  FOODMAX_SOURCE as SOURCE,
  FOODMAX_MARKETPLACE as MARKETPLACE_NAME,
  FOODMAX_PLUGIN as PLUGIN_NAME,
} from '../lib/constants.js';

const _exec = promisify(execFile);

export interface RunUpdateOptions {
  cwd: string;
  packageRootOverride?: string;
  reinstall?: () => Promise<void>;
  exec?: Exec;
}

export async function runUpdate(opts: RunUpdateOptions): Promise<void> {
  const pkgRoot = opts.packageRootOverride ?? join(opts.cwd, 'node_modules', PACKAGE_NAME);
  const exec = opts.exec ?? defaultExec;
  const reinstall =
    opts.reinstall ??
    (async () => {
      await _exec('npm', ['install', '--no-save', SOURCE], { cwd: opts.cwd, timeout: 120_000 });
    });

  console.log(info('Re-fetching latest from source…'));
  await reinstall();

  // Refresh marketplace (claude plugin marketplace update is the right verb; install is idempotent)
  try {
    await exec('claude', ['plugin', 'marketplace', 'update', MARKETPLACE_NAME]);
  } catch {
    // first-time update may need the install path; do it
    await installPlugin({
      source: SOURCE,
      marketplaceName: MARKETPLACE_NAME,
      pluginName: PLUGIN_NAME,
      scope: 'user',
      exec,
    });
  }

  const internalLockPath = join(pkgRoot, packageLockfileName());
  if (!existsSync(internalLockPath)) {
    console.error(fail(`Package missing ${packageLockfileName()} after update.`));
    process.exitCode = 3;
    return;
  }
  const internalLock = readLockfile(internalLockPath);
  const projectLockPath = join(opts.cwd, projectLockfileName());
  const existing = (existsSync(projectLockPath)
    ? JSON.parse(readFileSync(projectLockPath, 'utf8'))
    : {}) as Record<string, unknown>;
  const next = {
    ...existing,
    version: 1,
    package: PACKAGE_NAME,
    source: SOURCE,
    commitSha: await tryReadInstalledCommitSha(pkgRoot),
    packageVersion: readPackageVersion(pkgRoot),
    packageRootHash: internalLock.rootHash,
    initializedAt: (existing as { initializedAt?: string }).initializedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(projectLockPath, JSON.stringify(next, null, 2) + '\n');
  console.log(ok(`Updated. Project pinned to packageRootHash=${internalLock.rootHash.slice(0, 12)}…`));
}

async function tryReadInstalledCommitSha(pkgRoot: string): Promise<string> {
  try {
    const { stdout } = await _exec('git', ['rev-parse', 'HEAD'], { cwd: pkgRoot });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

function readPackageVersion(pkgRoot: string): string {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  return pkg.version as string;
}

export function registerUpdate(program: Command): void {
  program
    .command('update')
    .description('Re-fetch latest, refresh plugin, rewrite project lockfile')
    .action(async () => {
      try {
        await runUpdate({ cwd: process.cwd() });
      } catch (err) {
        console.error(fail(err instanceof Error ? err.message : String(err)));
        process.exit(2);
      }
    });
}
