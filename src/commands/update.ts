import type { Command } from 'commander';

export function registerUpdate(program: Command): void {
  program
    .command('update')
    .description('Re-fetch latest, re-install plugin, rewrite project lockfile')
    .action(async () => {
      console.log('update: not implemented');
      process.exit(1);
    });
}
