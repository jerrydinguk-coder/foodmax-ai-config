import type { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readLockfile,
  verifyLockfile,
} from '../lib/lockfile.js';
import {
  packageLockfileName,
  projectLockfileName,
} from '../lib/paths.js';
import { ok, warn, fail, info, dim } from '../lib/log.js';
import { FOODMAX_NPM_PACKAGE as PACKAGE_NAME, npmInstallSpec } from '../lib/constants.js';

export interface RunVerifyOptions {
  cwd: string;
  packageRootOverride?: string;
  strict: boolean;
}

export interface VerifyOutcome {
  ok: boolean;
  exitCode: number;
  driftedFiles: string[];
}

export async function runVerify(opts: RunVerifyOptions): Promise<VerifyOutcome> {
  const pkgRoot = opts.packageRootOverride ?? join(opts.cwd, 'node_modules', PACKAGE_NAME);
  const projectLockPath = join(opts.cwd, projectLockfileName());

  if (!existsSync(pkgRoot) || !existsSync(join(pkgRoot, 'package.json'))) {
    console.error(fail(`Package ${PACKAGE_NAME} not installed. Run: npx -y ${npmInstallSpec()} init`));
    return { ok: false, exitCode: 2, driftedFiles: [] };
  }
  if (!existsSync(projectLockPath)) {
    console.error(fail(`${projectLockfileName()} not found. Run: npx -y ${npmInstallSpec()} init`));
    return { ok: false, exitCode: 2, driftedFiles: [] };
  }
  const internalLockPath = join(pkgRoot, packageLockfileName());
  if (!existsSync(internalLockPath)) {
    console.error(fail(`Package missing ${packageLockfileName()} — installation corrupt.`));
    return { ok: false, exitCode: 3, driftedFiles: [] };
  }

  const internalLock = readLockfile(internalLockPath);
  const result = verifyLockfile(pkgRoot, internalLock);

  const projectLock = JSON.parse(readFileSync(projectLockPath, 'utf8')) as {
    packageRootHash: string;
    packageVersion: string;
  };

  const versionDrift = projectLock.packageRootHash !== internalLock.rootHash;

  if (result.ok && !versionDrift) {
    console.log(ok(`All checks pass (${internalLock.tool}, rootHash=${internalLock.rootHash.slice(0, 12)}…)`));
    return { ok: true, exitCode: 0, driftedFiles: [] };
  }

  const verb = opts.strict ? fail : warn;
  if (!result.ok) {
    console.log(verb(`Drift detected in ${internalLock.tool}`));
    if (result.modified.length) {
      console.log(info(`  Modified (${result.modified.length}):`));
      for (const p of result.modified) console.log(info(`    M  ${p}`));
    }
    if (result.added.length) {
      console.log(info(`  Added (${result.added.length}):`));
      for (const p of result.added) console.log(info(`    +  ${p}`));
    }
    if (result.removed.length) {
      console.log(info(`  Removed (${result.removed.length}):`));
      for (const p of result.removed) console.log(info(`    -  ${p}`));
    }
  }
  if (versionDrift) {
    console.log(verb(`Project lockfile references a different package version`));
    console.log(info(`  Project pinned to rootHash: ${projectLock.packageRootHash.slice(0, 12)}…`));
    console.log(info(`  Installed rootHash:         ${internalLock.rootHash.slice(0, 12)}…`));
    console.log(info(`  Run: npx foodmax-ai update`));
  }
  console.log('');
  console.log(dim(`  Inspect: npx foodmax-ai status --diff`));
  console.log(dim(`  Repair:  npx foodmax-ai repair`));

  const drifted = [...result.modified, ...result.added, ...result.removed].sort();
  return {
    ok: false,
    exitCode: opts.strict ? 1 : 0,
    driftedFiles: drifted,
  };
}

export function registerVerify(program: Command): void {
  program
    .command('verify')
    .description('Check current install vs locked version')
    .option('--strict', 'Exit 1 on drift (for CI)')
    .action(async (opts) => {
      const r = await runVerify({
        cwd: process.cwd(),
        strict: Boolean(opts.strict),
      });
      process.exit(r.exitCode);
    });
}
