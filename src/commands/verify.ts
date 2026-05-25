import type { Command } from 'commander';

export function registerVerify(program: Command): void {
  program
    .command('verify')
    .description('Check current install vs locked version')
    .option('--strict', 'Exit 1 on drift (for CI)')
    .action(async (opts) => {
      console.log('verify: not implemented');
      process.exit(1);
    });
}
