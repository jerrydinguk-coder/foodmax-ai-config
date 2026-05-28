---
'foodmax-ai-config': minor
---

feat: write team CLAUDE.md to global ~/.claude/CLAUDE.md (init + update + repair)

Teammates expected team rules to apply everywhere like Claude Code itself, but init wrote CLAUDE.md into each project's root — so rules were per-project and every new repo needed its own init.

- **init** now merges the team region into `~/.claude/CLAUDE.md` (user-global, all projects), preserving any rules the user already has outside the `BEGIN/END` markers.
- **update** and **repair** refresh it too, so team-rule changes reach users who already ran init (previously only init ever wrote it).
- The other 4 files (package.json devDep, .gitignore, CI workflow, lockfile) stay project-level.

The writer is extracted to `src/lib/claude-md.ts`, shared by all three commands, with a `homeDirOverride` injection point so tests never touch the real `~/.claude`.
