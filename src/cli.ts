import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { registerInit } from './commands/init.js';
import { registerVerify } from './commands/verify.js';
import { registerStatus } from './commands/status.js';
import { registerRepair } from './commands/repair.js';
import { registerUpdate } from './commands/update.js';
import { registerLock } from './commands/lock.js';
import { showStartupBannerIfDeprecated } from './lib/startup-banner.js';
import { fetchVersions } from './lib/versions.js';

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/cli.js sits at <pkg>/dist/cli.js, so pkg root is one level up
  const pkgPath = resolve(here, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  return pkg.version;
}

const program = new Command();
program
  .name('foodmax-ai')
  .description('FoodMax team-wide AI configuration manager')
  .version(readPackageVersion(), '-V, --pkg-version');

registerInit(program);
registerVerify(program);
registerStatus(program);
registerRepair(program);
registerUpdate(program);
registerLock(program);

async function maybeShowDeprecationBanner(): Promise<void> {
  const lockPath = join(process.cwd(), '.foodmax-ai.lock.json');
  await showStartupBannerIfDeprecated({
    readProjectLockfileVersion: async () => {
      if (!existsSync(lockPath)) return null;
      try {
        const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
        return (lock as { packageVersion?: string }).packageVersion ?? null;
      } catch {
        return null;
      }
    },
    fetchVersionsWithTimeout: async () => {
      try {
        // Short timeout: we don't want to slow down every CLI invocation
        const racePromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
        return await Promise.race([fetchVersions(), racePromise]);
      } catch {
        return null;
      }
    },
  });
}

// Fire-and-don't-await: do not block command execution on the banner
maybeShowDeprecationBanner().catch(() => {});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
