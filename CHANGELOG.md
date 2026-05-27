# CHANGELOG

## 0.3.0

### Minor Changes

- 6e370af: feat(mcp): eager-install MCP packages at init/update time

  Previously the MCP registration command (`npx -y @playwright/mcp@latest` /
  `npx -y @larksuiteoapi/lark-mcp@latest`) downloaded the package the first
  time Claude Code spawned the MCP — slow on first use, and a hard failure
  when the user happened to be offline at that moment.

  `registerPlaywrightMcp` and `registerFeishuMcp` now shell `npm install -g
<pkg>@latest` BEFORE `claude mcp add`, so the package is on disk by the
  time Claude needs it. The install runs even when the MCP is already
  registered, so a re-run guarantees the package is materialized regardless
  of registration state.

  Trade-off: first `init` / `update` takes longer (two `npm install -g`
  operations); subsequent MCP spawns are instant and work offline (until
  npm publishes a newer version, at which point `npx -y …@latest` will
  re-fetch on the next spawn).

- f8dd699: feat(init): self-install the package when missing from cwd `node_modules`

  `init` previously required users to run `npm install --no-save <url>#vX.Y.Z`
  first, then `npx foodmax-ai init` — the single-command `npx -y <url>.git init`
  entry point that the old README advertised never actually worked because the
  npx cache lives outside the project's `node_modules`.

  `init` now detects that case and runs `npm install --no-save <SOURCE>#<tag>`
  itself before continuing, so the single-command bootstrap from `npx` works
  end-to-end. `--dry-run` prints the would-install line and exits without
  touching the filesystem. If the install fails to materialize the package, init
  throws a clearer error pointing at the likely Codeup auth issue.

### Patch Changes

- 8c3ed11: fix(repair): honor pinned `packageVersion` from `.foodmax-ai.lock.json`

  `repair` previously ran `npm install --no-save <bare-url>`, which silently
  moved projects pinned to an older release to bootstrapper main. It now reads
  `packageVersion` from the project lockfile and pins the reinstall to
  `<url>#v<version>`. Falls back to the bare URL only when the lockfile is
  absent or malformed.

## 0.2.1

### Patch Changes

- fd162d4: Pre-rollout BLOCKER fixes:

  - session-start-banner.sh: correct install URL (was a stale github:... reference that returned 404)
  - marketplace.json: sync plugin version with package.json; auto-sync in version-packages.ts going forward
  - README: remove `--channel beta` references (no beta channel exists in versions.json yet)

  Includes regression-guard tests so each blocker class is caught in CI.

## 0.2.0

### Minor Changes

- 3a3b9b0: Sprint 2: 发布自动化 — 接入 changesets + commitlint + husky；新增 Codeup pipeline；CI 自动 tag + push + 更新 versions.json；新增 CHANGELOG.md / RELEASING.md
- e263d24: Sprint 3: 安全 & 可信 — DeprecatedEntry 加 severity (warn|block)，init/update 在 block 时硬拦；CLI startup 检测项目 lockfile 版本是否 deprecated 并提示；新增 pre-release 自检脚本（typecheck/test/build/lockfile/pnpm audit/working-tree）；新增 SECURITY.md 漏洞响应策略。

  GPG signing intentionally omitted — internal trust boundary is the Codeup repo write ACL; lockfile sha256 covers tamper detection.

本项目使用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式（中文版）。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-05-26

### Added

- 初始 release。
- `init` / `update` / `verify` / `status` / `repair` / `lock` CLI 命令。
- 4 个团队默认集成：superpowers plugin、Playwright MCP、Feishu MCP、`@larksuite/cli`。
- Sprint 1: `--version` / `--channel` flag 支持版本/channel 选择；启动检查 Claude Code 版本（peerRequirements）；deprecation 警告；ProjectLockfile 记录 channel/resolvedFrom；versions.json 元数据文件 + Codeup raw URL fetch + shallow-clone fallback。
