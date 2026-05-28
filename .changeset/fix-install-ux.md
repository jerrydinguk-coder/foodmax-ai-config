---
'foodmax-ai-config': patch
---

fix(init): surface real failure causes + stop falsely claiming success

Three teammate-reported install-UX fixes (all from a real failed install where init printed "✓ Done" while the plugin never installed):

- **Surface real stderr.** Failed `claude` / `npm` commands now include their actual stderr instead of a bare "Command failed: …". The real git error (`remote: Repository not found`) and EACCES details were being swallowed by `err.message`-only handling in `plugin-install.ts` and `integrations.ts`.
- **EACCES hint that warns against sudo.** When `npm install -g` is denied (homebrew's root-owned global node_modules), init/update now print an actionable hint: set an npm prefix, and explicitly DON'T use `sudo` (it can install into root's HOME so Claude never finds the plugin, or leave root-owned files that break later updates).
- **Honest Done message.** `init` no longer prints "Done. Team AI config installed." when the foodmax plugin install fails — it reports "Init incomplete — the foodmax plugin did NOT install", shows the reason, and gives the retry command.
