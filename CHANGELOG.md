# CHANGELOG

## 1.0.0

### Major Changes

- 0dd0388: feat!: switch distribution to npm public registry (BREAKING)

  **For teammates: install is now one zero-auth command.**

  ```bash
  npx -y foodmax-ai-config@latest init
  ```

  No more Codeup SSO, no PAT setup, no `git ls-remote` preflight — npm public
  registry is anonymous-readable from anywhere.

  **Why it broke**

  Codeup tenant (`bgs2026-...`) force-redirects all HTTPS traffic to SSO
  login, and teammates authed via 飞书 SSO have no git CLI credentials to
  respond with. That made "one-line install" impossible on the Codeup path
  without per-teammate setup work.

  **What changed**

  - **Distribution**: package now publishes to **npm public registry** as
    `foodmax-ai-config`. Install spec is plain `foodmax-ai-config@<version>`
    (no git URL).
  - **Plugin marketplace**: registered to Claude via
    `claude plugin marketplace add https://github.com/jerrydinguk-coder/foodmax-ai-config.git#v<X.Y.Z>`
    — the GitHub public mirror serves the marketplace catalog (anonymous
    HTTPS clone, no auth). Codeup remains the **dev source** but is never
    reached by teammates.
  - **Version flags**: `--channel <name>` renamed to `--tag <name>` to match
    npm dist-tag terminology (`latest`, `beta`, etc.). `--version <semver>`
    unchanged.
  - **Project package.json devDep** is now written as semver caret range
    (`^X.Y.Z`), not a git URL.
  - **versions.json + deprecation block mechanism removed**. Channel selection
    uses npm dist-tags natively. Deprecation uses `npm deprecate` (warn-only;
    no hard block — npm doesn't support that, but the warning surfaces in
    every `npm install` output).
  - **LICENSE**: added MIT.

  **Migration from v0.x**

  Existing projects on v0.x: re-run `npx -y foodmax-ai-config@latest init` to
  rewrite project files. `npx foodmax-ai update` from v0.x won't migrate
  because v0.x's update calls Codeup; it has to be a fresh init.

  **Maintainer setup (one-time before publishing this release)**

  1. Create empty public repo `jerrydinguk-coder/foodmax-ai-config` on GitHub.
  2. `git remote add github git@github.com:jerrydinguk-coder/foodmax-ai-config.git`
  3. `git push -u github main && git push github --tags`
  4. `npm login` (so `npm publish` works during release).

  **Release flow gains an `npm-login` pre-release gate** and `pnpm release`
  now does `git tag → push tag (Codeup) → push main+tag (github) → npm publish`.

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
