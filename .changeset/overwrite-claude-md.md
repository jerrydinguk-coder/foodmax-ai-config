---
"foodmax-ai-config": patch
---

`~/.claude/CLAUDE.md` is now a verbatim copy of the team's `CLAUDE.md` (full overwrite), with the previous file backed up to `CLAUDE-OLD.md`. Earlier versions merged the rules between `BEGIN/END` markers, but since a teammate's global file is typically 100% the managed block, that was effectively a full replace anyway — and the marker wrapper added confusion. init/update/repair now write the package's `CLAUDE.md` exactly; when the existing file differs it is first saved to `~/.claude/CLAUDE-OLD.md` (and never clobbered on idempotent re-runs). `CLAUDE-OLD.md` is inert — Claude does not load it. Removes the now-unused `mergeClaudeMd` helper.
