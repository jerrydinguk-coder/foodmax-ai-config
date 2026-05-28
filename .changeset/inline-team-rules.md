---
"foodmax-ai-config": patch
---

Write the real team rules into `~/.claude/CLAUDE.md`, not a pointer. `writeGlobalClaudeMd` now inlines the installed package's own `CLAUDE.md` (the team's actual rules) between the `BEGIN/END` markers, instead of the old placeholder that only said "继承自团队 plugin, see the cache". A plugin's `CLAUDE.md` is not loaded as global instructions — only `~/.claude/CLAUDE.md` is — so the placeholder meant teammates never actually received the team rules. The repo root `CLAUDE.md` is now the single source of truth, propagated by init/update/repair.
