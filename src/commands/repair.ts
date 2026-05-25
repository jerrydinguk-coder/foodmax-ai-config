import type { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  readLockfile,
  verifyLockfile,
} from '../lib/lockfile.js';
import { packageLockfileName } from '../lib/paths.js';
import { ok, warn, fail, info } from '../lib/log.js';

const _exec = promisify(execFile);

const PACKAGE_NAME = 'foodmax-ai-config';
const SOURCE = 'github:foodmax/ai-config-init';

export interface RunRepairOptions {
  cwd: string;
  packageRootOverride?: string;
  reinstall?: () => Promise<void>;
}

export interface RepairOutcome {
  ok: boolean;
}

export async function runRepair(opts: RunRepairOptions): Promise<RepairOutcome> {
  const pkgRoot = opts.packageRootOverride ?? join(opts.cwd, 'node_modules', PACKAGE_NAME);
  const reinstall =
    opts.reinstall ??
    (async () => {
      await _exec(
        'npm',
        ['install', '--no-save', SOURCE],
        { cwd: opts.cwd, timeout: 120_000 }
      );
    });

  console.log(info('Re-installing from source to overwrite local edits…'));
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
