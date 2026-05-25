import chalk from 'chalk';

export function ok(msg: string): string {
  return `${chalk.green('✓')} ${msg}`;
}

export function warn(msg: string): string {
  return `${chalk.yellow('⚠')} ${msg}`;
}

export function fail(msg: string): string {
  return `${chalk.red('✗')} ${msg}`;
}

export function info(msg: string): string {
  return msg;
}

export function dim(msg: string): string {
  return chalk.dim(msg);
}

export function bold(msg: string): string {
  return chalk.bold(msg);
}
