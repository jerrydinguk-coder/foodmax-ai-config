import type { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateLockfile } from '../lib/lockfile.js';
import { packageLockfileName } from '../lib/paths.js';
import { ok, info } from '../lib/log.js';

export interface RunLockOptions {
  cwd: string;
}

export async function runLock(opts: RunLockOptions): Promise<void> {
  const pkgPath = join(opts.cwd, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name: string; version: string };
  const tool = `${pkg.name}@${pkg.version}`;
  const lock = generateLockfile(opts.cwd, tool);
  const outPath = join(opts.cwd, packageLockfileName());
  writeFileSync(outPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(
    ok(
      `Wrote ${packageLockfileName()} (${Object.keys(lock.tree).length} files, rootHash=${lock.rootHash.slice(0, 12)}…)`,
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
