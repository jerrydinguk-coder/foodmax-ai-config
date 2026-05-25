import type { Command } from 'commander';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show drift detail')
    .option('--diff', 'Show full content diff')
    .action(async (opts) => {
      console.log('status: not implemented');
      process.exit(1);
    });
}
