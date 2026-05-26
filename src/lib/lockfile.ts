import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep, posix } from 'node:path';
import { LOCKED_PATHS } from './paths.js';
import { sha256OfBuffer, sha256OfString } from './hash.js';

export interface Lockfile {
  version: 1;
  tool: string;
  generatedAt: string;
  algorithm: 'sha256';
  tree: Record<string, string>;
  rootHash: string;
}

/**
 * The lockfile written into a consumer project (.foodmax-ai.lock.json).
 * Distinct from the package-internal {@link Lockfile} (.locked.json):
 * this records what's pinned, not what the package contents are.
 */
export interface ProjectLockfile {
  version: 1;
  package: string;
  source: string;
  commitSha: string | null;
  packageVersion: string;
  packageRootHash: string;
  initializedAt: string;
  initializedBy: string;
  /** Channel the version was resolved from, undefined when --version was explicit. */
  channel?: string;
  /** How the version was selected. Undefined for pre-Sprint-1 lockfiles (backward compat). */
  resolvedFrom?: 'channel' | 'explicit-version';
  /** When this lockfile was last updated by `update`. Optional for backward compat. */
  updatedAt?: string;
}

export interface VerifyResult {
  ok: boolean;
  modified: string[];
  added: string[];
  removed: string[];
}

function toPosix(p: string): string {
  return p.split(sep).join(posix.sep);
}

function walk(absRoot: string, currentRel: string, out: string[]): void {
  const abs = join(absRoot, currentRel);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const rel = currentRel ? join(currentRel, e.name) : e.name;
    if (e.isDirectory()) {
      walk(absRoot, rel, out);
    } else if (e.isFile()) {
      out.push(toPosix(rel));
    }
  }
}

function collectLockedFiles(absRoot: string): string[] {
  const found: string[] = [];
  for (const p of LOCKED_PATHS) {
    if (p.endsWith('/')) {
      walk(absRoot, p.slice(0, -1), found);
    } else {
      try {
        if (statSync(join(absRoot, p)).isFile()) {
          found.push(toPosix(p));
        }
      } catch {
        // missing single file is ok (e.g. no commands/ dir yet)
      }
    }
  }
  return found.sort();
}

export function generateLockfile(absRoot: string, tool: string): Lockfile {
  const files = collectLockedFiles(absRoot);
  const tree: Record<string, string> = {};
  for (const rel of files) {
    const buf = readFileSync(join(absRoot, rel));
    tree[rel] = sha256OfBuffer(buf);
  }
  const sortedPaths = Object.keys(tree).sort();
  const concat = sortedPaths.map((p) => `${p}:${tree[p]}`).join('\n');
  const rootHash = sha256OfString(concat);
  return {
    version: 1,
    tool,
    generatedAt: new Date().toISOString(),
    algorithm: 'sha256',
    tree,
    rootHash,
  };
}

export function readLockfile(absPath: string): Lockfile {
  const raw = readFileSync(absPath, 'utf8');
  return JSON.parse(raw) as Lockfile;
}

export function verifyLockfile(absRoot: string, expected: Lockfile): VerifyResult {
  const actual = generateLockfile(absRoot, expected.tool);
  const modified: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [path, hash] of Object.entries(expected.tree)) {
    const actualHash = actual.tree[path];
    if (actualHash === undefined) {
      removed.push(path);
    } else if (actualHash !== hash) {
      modified.push(path);
    }
  }
  for (const path of Object.keys(actual.tree)) {
    if (!(path in expected.tree)) {
      added.push(path);
    }
  }
  return {
    ok: modified.length === 0 && added.length === 0 && removed.length === 0,
    modified: modified.sort(),
    added: added.sort(),
    removed: removed.sort(),
  };
}
