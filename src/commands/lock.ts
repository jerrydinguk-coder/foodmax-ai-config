import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateLockfile, readLockfile } from '../lib/lockfile.js';
import { packageLockfileName } from '../lib/paths.js';
import { ok, info } from '../lib/log.js';

export interface RunLockOptions {
  cwd: string;
}

export async function runLock(opts: RunLockOptions): Promise<void> {
  const pkgPath = join(opts.cwd, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name: string; version: string };
  const tool = `${pkg.name}@${pkg.version}`;
  const next = generateLockfile(opts.cwd, tool);
  const outPath = join(opts.cwd, packageLockfileName());

  // If existing lockfile has the same rootHash, leave it alone — preserves
  // generatedAt so CI git-diff freshness checks aren't tripped by timestamp drift.
  if (existsSync(outPath)) {
    try {
      const existing = readLockfile(outPath);
      if (existing.rootHash === next.rootHash) {
        console.log(
          ok(
            `${packageLockfileName()} already up to date (${Object.keys(next.tree).length} files, rootHash=${next.rootHash.slice(0, 12)}…)`,
          ),
        );
        return;
      }
    } catch {
      // corrupt or unreadable; fall through and overwrite
    }
  }

  writeFileSync(outPath, JSON.stringify(next, null, 2) + '\n');
  console.log(
    ok(
      `Wrote ${packageLockfileName()} (${Object.keys(next.tree).length} files, rootHash=${next.rootHash.slice(0, 12)}…)`,
    ),
  );
  console.log(info('Commit it: `git add .locked.json && git commit -m "chore: relock"`'));
}

export function registerLock(program: Command): void {
  program
    .command('lock')
    .description('[maintainer] Regenerate .locked.json from current tree')
    .action(async () => {
      await runLock({ cwd: process.cwd() });
    });
}
