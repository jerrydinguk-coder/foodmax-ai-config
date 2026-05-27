---
"foodmax-ai-config": patch
---

fix(plugin): correct marketplace.json + plugin.json schema so `claude plugin install` works

v1.0.0 silently failed at the `claude plugin install foodmax-ai-config@foodmax-ai-config`
step ("This plugin uses a source type your Claude Code version does not support").
Two schema issues:

1. `.claude-plugin/marketplace.json` carried a `hooks` array inside its
   `plugins[0]` entry. Claude Code expects hooks to live in a separate
   `plugin.json` + `hooks/hooks.json`, not inline in marketplace metadata.
   Inline hooks made Claude reject the plugin source as "unsupported type."

2. `plugins[0].source` was bare `"."`. The schema requires `^\./.*`, and
   in practice Claude accepts `"./"` (whole plugin dir).

Fix:

- `.claude-plugin/marketplace.json`: drop `hooks`, set `source: "./"`, add
  marketplace `description` and plugin `author` (matches superpowers shape).
- New `plugin.json` at package root: declares `skills`, `hooks` paths.
- New `hooks/hooks.json`: the actual SessionStart hook command, in
  `{matcher, hooks: [{type, command, async}]}` shape Claude expects.
- `src/lib/constants.ts`: `SUPERPOWERS_SOURCE` from `github:obra/superpowers`
  → bare `obra/superpowers`. New Claude rejects the `github:` prefix with
  "Invalid marketplace source format."

After this patch, smoke test from a cold `/tmp` directory:
`npx -y foodmax-ai-config@latest init` now successfully completes the
plugin install (verified locally with `npm pack` + `claude plugin install`).
