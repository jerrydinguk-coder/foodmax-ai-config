import type { Command } from 'commander';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  readLockfile,
  verifyLockfile,
  type ProjectLockfile,
} from '../lib/lockfile.js';
import { packageLockfileName, projectLockfileName } from '../lib/paths.js';
import { defaultExec, type Exec } from '../lib/plugin-install.js';
import { ok, warn, fail, info } from '../lib/log.js';
import {
  FOODMAX_PACKAGE as PACKAGE_NAME,
  FOODMAX_SOURCE as SOURCE,
} from '../lib/constants.js';

export interface RunRepairOptions {
  cwd: string;
  packageRootOverride?: string;
  reinstall?: () => Promise<void>;
  exec?: Exec;
}

export interface RepairOutcome {
  ok: boolean;
}

/**
 * Build the npm install target for repair. Honors the pinned version recorded
 * in .foodmax-ai.lock.json so a project pinned to an older release does not
 * silently drift to main.
 */
export function resolveRepairTarget(cwd: string): string {
  const projectLockPath = join(cwd, projectLockfileName());
  if (!existsSync(projectLockPath)) return SOURCE;
  try {
    const parsed = JSON.parse(readFileSync(projectLockPath, 'utf8')) as Partial<ProjectLockfile>;
    const v = parsed.packageVersion;
    if (typeof v === 'string' && v.length > 0) {
      return `${SOURCE}#v${v}`;
    }
  } catch {
    // unreadable lockfile → fall back to bare source
  }
  return SOURCE;
}

export async function runRepair(opts: RunRepairOptions): Promise<RepairOutcome> {
  const pkgRoot = opts.packageRootOverride ?? join(opts.cwd, 'node_modules', PACKAGE_NAME);
  const exec = opts.exec ?? defaultExec;
  const target = resolveRepairTarget(opts.cwd);
  const reinstall =
    opts.reinstall ??
    (async () => {
      await exec('npm', ['install', '--no-save', target]);
    });

  console.log(info(`Re-installing from ${target} to overwrite local edits…`));
  try {
    await reinstall();
  } catch (err) {
    console.error(fail(`reinstall failed: ${err instanceof Error ? err.message : String(err)}`));
    return { ok: false };
  }

  const lockPath = join(pkgRoot, packageLockfileName());
  if (!existsSync(lockPath)) {
    console.error(fail(`After repair, ${packageLockfileName()} still missing.`));
    return { ok: false };
  }
  const lock = readLockfile(lockPath);
  const result = verifyLockfile(pkgRoot, lock);
  if (result.ok) {
    console.log(ok('Repaired. Verify passes.'));
    return { ok: true };
  }
  console.log(warn(`Repair completed but verify still reports drift: ${result.modified.join(', ')}`));
  return { ok: false };
}

export function registerRepair(program: Command): void {
  program
    .command('repair')
    .description('Overwrite local edits back to package contents (npm install --no-save)')
    .action(async () => {
      const r = await runRepair({ cwd: process.cwd() });
      process.exit(r.ok ? 0 : 1);
    });
}
