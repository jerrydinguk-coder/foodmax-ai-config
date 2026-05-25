import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TempProject {
  dir: string;
  cleanup: () => void;
}

/**
 * Create a tempdir that simulates a consumer project (git-init'd, empty).
 * Caller is responsible for calling cleanup() in afterEach.
 */
export function makeTempProject(seedFiles: Record<string, string> = {}): TempProject {
  const dir = mkdtempSync(join(tmpdir(), 'fmax-consumer-'));
  // Mark it as a git repo (init.ts checks)
  mkdirSync(join(dir, '.git'), { recursive: true });
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  // Seed any files caller wants
  for (const [rel, content] of Object.entries(seedFiles)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Create a tempdir that simulates a fake installed package (node_modules layout).
 * The package contains CLAUDE.md, .claude-plugin/, skills/, hooks/, .locked.json.
 */
export function makeFakeInstalledPackage(parentDir: string): string {
  const pkgRoot = join(parentDir, 'node_modules', 'foodmax-ai-config');
  mkdirSync(pkgRoot, { recursive: true });
  writeFileSync(join(pkgRoot, 'CLAUDE.md'), '# team rules\n');
  mkdirSync(join(pkgRoot, '.claude-plugin'), { recursive: true });
  writeFileSync(join(pkgRoot, '.claude-plugin', 'marketplace.json'), '{"name":"foodmax-ai-config","plugins":[]}');
  mkdirSync(join(pkgRoot, 'skills', 'demo'), { recursive: true });
  writeFileSync(join(pkgRoot, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n');
  mkdirSync(join(pkgRoot, 'hooks'), { recursive: true });
  writeFileSync(join(pkgRoot, 'hooks', 'h.sh'), '#!/bin/sh\necho hi\n');
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: 'foodmax-ai-config', version: '0.1.0' }));
  return pkgRoot;
}
