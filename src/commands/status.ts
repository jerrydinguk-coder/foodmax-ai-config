import type { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPatch } from 'diff';
import {
  readLockfile,
  verifyLockfile,
} from '../lib/lockfile.js';
import { packageLockfileName } from '../lib/paths.js';
import { ok, warn, fail, info, dim } from '../lib/log.js';

const PACKAGE_NAME = 'foodmax-ai-config';

export interface StatusEntry {
  path: string;
  kind: 'modified' | 'added' | 'removed';
  expectedHash?: string;
  actualHash?: string;
  diff?: string;
}

export interface RunStatusOptions {
  cwd: string;
  packageRootOverride?: string;
  diff: boolean;
}

export interface StatusOutcome {
  entries: StatusEntry[];
}

export async function runStatus(opts: RunStatusOptions): Promise<StatusOutcome> {
  const pkgRoot = opts.packageRootOverride ?? join(opts.cwd, 'node_modules', PACKAGE_NAME);
  const internalLockPath = join(pkgRoot, packageLockfileName());
  if (!existsSync(internalLockPath)) {
    console.error(fail(`${packageLockfileName()} not found at ${pkgRoot}`));
    return { entries: [] };
  }
  const internalLock = readLockfile(internalLockPath);
  const result = verifyLockfile(pkgRoot, internalLock);

  const entries: StatusEntry[] = [];
  for (const path of result.modified) {
    const entry: StatusEntry = {
      path,
      kind: 'modified',
      expectedHash: internalLock.tree[path],
    };
    if (opts.diff) {
      const actual = readFileSync(join(pkgRoot, path), 'utf8');
      entry.diff = createPatch(path, '', actual, 'expected (hash only)', 'actual');
    }
    entries.push(entry);
  }
  for (const path of result.added) {
    entries.push({ path, kind: 'added' });
  }
  for (const path of result.removed) {
    entries.push({ path, kind: 'removed', expectedHash: internalLock.tree[path] });
  }

  if (entries.length === 0) {
    console.log(ok('No drift.'));
  } else {
    console.log(warn(`${entries.length} drifted file(s):`));
    for (const e of entries) {
      const marker = e.kind === 'modified' ? 'M' : e.kind === 'added' ? '+' : '-';
      console.log(info(`  ${marker}  ${e.path}`));
      if (e.diff) {
        console.log(dim(e.diff));
      }
    }
  }
  return { entries };
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show drift detail')
    .option('--diff', 'Show file content of drifted files')
    .action(async (opts) => {
      await runStatus({
        cwd: process.cwd(),
        diff: Boolean(opts.diff),
      });
    });
}
