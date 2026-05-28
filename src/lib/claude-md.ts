import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ok, info } from './log.js';

/**
 * Overwrite the user-global ~/.claude/CLAUDE.md with the installed package's
 * CLAUDE.md (the team rules), verbatim. Claude only loads ~/.claude/CLAUDE.md
 * (and project CLAUDE.md) as global instructions, so the rules must live there
 * in full — not behind a pointer. If an existing file differs, it is copied to
 * CLAUDE-OLD.md first so the user's previous content stays recoverable
 * (CLAUDE-OLD.md is inert — Claude does not load it). init/update/repair all
 * funnel through here.
 */
export function writeGlobalClaudeMd(homeDir: string, pkgRoot: string): string {
  const teamRules = readFileSync(join(pkgRoot, 'CLAUDE.md'), 'utf8');
  const dir = join(homeDir, '.claude');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'CLAUDE.md');
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current !== teamRules) {
      const backup = join(dir, 'CLAUDE-OLD.md');
      writeFileSync(backup, current);
      console.log(info(`Backed up previous CLAUDE.md → ${backup}`));
    }
  }
  writeFileSync(path, teamRules);
  console.log(ok(`Wrote ${path} (= team CLAUDE.md)`));
  return path;
}
