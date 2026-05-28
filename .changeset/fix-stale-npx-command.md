---
"foodmax-ai-config": patch
---

Fix stale-CLI footgun in user-facing commands. `foodmax-ai` is only the bin name, not a published package — so `npx foodmax-ai <cmd>` resolved to a stale local `node_modules/.bin` (which never upgrades) or 404'd when run outside a project. That's why `update` never refreshed the global `~/.claude/CLAUDE.md` for users on older installs. All docs + CLI output + integration hints now use the always-fresh `npx -y foodmax-ai-config@latest <cmd>` form. (The CI workflow keeps its local-bin invocation: it `npm install`s the latest package first.)
