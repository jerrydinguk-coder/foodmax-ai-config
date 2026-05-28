import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mergeClaudeMd } from './merge.js';
import { ok } from './log.js';

/** Header of the managed region so users know not to hand-edit it. */
export const MANAGED_REGION_NOTICE =
  '<!-- 本区块内容由 foodmax-ai-config 维护，`npx -y foodmax-ai-config@latest update` 会刷新；你自己的全局规则写在 BEGIN/END 标记之外，不会被覆盖。 -->';

/**
 * Merge the team's actual rules into the user-global ~/.claude/CLAUDE.md, inside
 * the BEGIN/END markers. The rules are read from the installed package's own
 * CLAUDE.md so the repo root CLAUDE.md is the single source of truth — editing it
 * and releasing propagates to every teammate via init/update/repair. Content
 * outside the markers (the user's own global rules) is preserved.
 */
export function writeGlobalClaudeMd(homeDir: string, pkgRoot: string): string {
  const teamRules = readFileSync(join(pkgRoot, 'CLAUDE.md'), 'utf8').trim();
  const teamContent = `${MANAGED_REGION_NOTICE}\n\n${teamRules}`;
  const dir = join(homeDir, '.claude');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'CLAUDE.md');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const merged = mergeClaudeMd(existing, teamContent);
  writeFileSync(path, merged);
  console.log(ok(`Wrote ${path} (team rules merged)`));
  return path;
}
