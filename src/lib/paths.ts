import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repo root. At runtime (tests via tsx): src/lib/paths.ts → parent of src/ is root.
 * At build time (dist/cli.js): dist/ → parent of dist/ is root.
 */
export function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Whether we're at src/lib/ (tsx dev/test) or dist/ (built), go up to a dir
  // containing package.json. Simplest: src/lib → up 2, dist → up 1. We detect.
  if (here.endsWith('/src/lib') || here.endsWith('\\src\\lib')) {
    return resolve(here, '..', '..');
  }
  return resolve(here, '..');
}

export function claudeHome(): string {
  return resolve(homedir(), '.claude');
}

export function projectLockfileName(): string {
  return '.foodmax-ai.lock.json';
}

export function packageLockfileName(): string {
  return '.locked.json';
}

/**
 * Files / dir prefixes covered by the package-internal lockfile hash.
 * NOT included: src/, tests/, dist/, package.json, node_modules/.
 */
export const LOCKED_PATHS = [
  'CLAUDE.md',
  '.claude-plugin/',
  'skills/',
  'hooks/',
  'commands/',
  'agents/',
] as const;
