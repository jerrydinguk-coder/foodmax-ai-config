import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { registerInit } from './commands/init.js';
import { registerVerify } from './commands/verify.js';
import { registerStatus } from './commands/status.js';
import { registerRepair } from './commands/repair.js';
import { registerUpdate } from './commands/update.js';
import { registerLock } from './commands/lock.js';

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

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
