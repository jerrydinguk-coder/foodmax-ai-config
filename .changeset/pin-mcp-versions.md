---
"foodmax-ai-config": minor
---

feat(mcp): pin Playwright MCP and Feishu MCP to specific versions

Before:
- `@playwright/mcp@latest` — every Claude Code session could pull a different version
- `@larksuiteoapi/lark-mcp` (no version, implicit `@latest`) — same drift

After:
- `@playwright/mcp@0.0.75`
- `@larksuiteoapi/lark-mcp@0.5.1`

Both pinned in `src/lib/constants.ts`. Bumping = edit the constant, release a
new version, tell users to run `npx foodmax-ai update --force-mcp` (a plain
`update` sees the MCP already registered and skips re-registration, so the new
pin won't take effect without `--force-mcp`).

**Upgrade note for existing users**: after installing this release, run
`npx foodmax-ai update --force-mcp` once so the registered MCP command
switches from `@latest` to the pinned version.
