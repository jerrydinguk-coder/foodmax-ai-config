---
"foodmax-ai-config": minor
---

feat(mcp): eager-install MCP packages at init/update time

Previously the MCP registration command (`npx -y @playwright/mcp@<v>` /
`npx -y @larksuiteoapi/lark-mcp@<v>`) downloaded the package the first time
Claude Code spawned the MCP — slow on first use, and a hard failure when the
user happened to be offline at that moment.

`registerPlaywrightMcp` and `registerFeishuMcp` now shell `npm install -g
<pkg>@<pinned-version>` BEFORE `claude mcp add`, so the package is on disk
by the time Claude needs it. The install runs even when the MCP is already
registered, so a re-run guarantees the pinned version is materialized
regardless of registration state.

Trade-off: first `init` / `update` takes longer (two `npm install -g`
operations); subsequent MCP spawns are instant and work offline.
