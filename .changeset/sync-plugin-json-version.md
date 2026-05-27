---
"foodmax-ai-config": patch
---

fix(release): version-packages now syncs plugin.json version too

Claude Code reads plugin version from `plugin.json` (shown in
`claude plugin list`). Previously version-packages only synced
`.claude-plugin/marketplace.json`, leaving `plugin.json.version`
stuck at whatever was last hand-edited. After v1.0.0 published with
plugin.json hand-written at "1.0.0", v1.0.1 published with the same
"1.0.0" string — installed plugin showed "Version: 1.0.0" even though
the npm package was 1.0.1.

Now version-packages also rewrites `plugin.json.version` and stages
it in the version-bump commit, so future releases stay in sync.
