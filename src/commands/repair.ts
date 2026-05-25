import type { Command } from 'commander';

export function registerRepair(program: Command): void {
  program
    .command('repair')
    .description('Overwrite local edits back to package contents')
    .action(async () => {
      console.log('repair: not implemented');
      process.exit(1);
    });
}
