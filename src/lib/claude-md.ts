import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mergeClaudeMd } from './merge.js';
import { PROJECT_CLAUDE_MD_BLOCK } from '../templates/project-claude-md.js';
import { ok } from './log.js';

/**
 * Merge the team CLAUDE.md region into the user-global ~/.claude/CLAUDE.md.
 * Content outside the BEGIN/END markers (the user's own global rules) is
 * preserved. Used by init (first write) and update/repair (refresh when team
 * rules change). homeDir is injectable so tests never touch the real ~/.claude.
 */
export function writeGlobalClaudeMd(homeDir: string = homedir()): string {
  const dir = join(homeDir, '.claude');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'CLAUDE.md');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const merged = mergeClaudeMd(existing, PROJECT_CLAUDE_MD_BLOCK);
  writeFileSync(path, merged);
  console.log(ok(`Wrote ${path} (team region merged)`));
  return path;
}
