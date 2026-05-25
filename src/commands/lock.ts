import type { Command } from 'commander';

export function registerLock(program: Command): void {
  program
    .command('lock')
    .description('[maintainer] Regenerate .locked.json from current tree')
    .action(async () => {
      console.log('lock: not implemented');
      process.exit(1);
    });
}
