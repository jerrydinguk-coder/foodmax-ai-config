import type { Command } from 'commander';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Bootstrap this project with foodmax-ai-config')
    .option('--dry-run', 'Print what would happen, do not write')
    .option('--yes', 'Skip interactive confirmations')
    .action(async (opts) => {
      console.log('init: not implemented');
      process.exit(1);
    });
}
