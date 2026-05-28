# CHANGELOG

## 1.1.3

### Patch Changes

- 6f89ecd: `~/.claude/CLAUDE.md` is now a verbatim copy of the team's `CLAUDE.md` (full overwrite), with the previous file backed up to `CLAUDE-OLD.md`. Earlier versions merged the rules between `BEGIN/END` markers, but since a teammate's global file is typically 100% the managed block, that was effectively a full replace anyway — and the marker wrapper added confusion. init/update/repair now write the package's `CLAUDE.md` exactly; when the existing file differs it is first saved to `~/.claude/CLAUDE-OLD.md` (and never clobbered on idempotent re-runs). `CLAUDE-OLD.md` is inert — Claude does not load it. Removes the now-unused `mergeClaudeMd` helper.

## 1.1.2

### Patch Changes

- e8d20ab: Write the real team rules into `~/.claude/CLAUDE.md`, not a pointer. `writeGlobalClaudeMd` now inlines the installed package's own `CLAUDE.md` (the team's actual rules) between the `BEGIN/END` markers, instead of the old placeholder that only said "继承自团队 plugin, see the cache". A plugin's `CLAUDE.md` is not loaded as global instructions — only `~/.claude/CLAUDE.md` is — so the placeholder meant teammates never actually received the team rules. The repo root `CLAUDE.md` is now the single source of truth, propagated by init/update/repair.

## 1.1.1

### Patch Changes

- 1a4fae2: Fix stale-CLI footgun in user-facing commands. `foodmax-ai` is only the bin name, not a published package — so `npx foodmax-ai <cmd>` resolved to a stale local `node_modules/.bin` (which never upgrades) or 404'd when run outside a project. That's why `update` never refreshed the global `~/.claude/CLAUDE.md` for users on older installs. All docs + CLI output + integration hints now use the always-fresh `npx -y foodmax-ai-config@latest <cmd>` form. (The CI workflow keeps its local-bin invocation: it `npm install`s the latest package first.)

## 1.1.0

### Minor Changes

- d670208: feat: write team CLAUDE.md to global ~/.claude/CLAUDE.md (init + update + repair)

  Teammates expected team rules to apply everywhere like Claude Code itself, but init wrote CLAUDE.md into each project's root — so rules were per-project and every new repo needed its own init.

  - **init** now merges the team region into `~/.claude/CLAUDE.md` (user-global, all projects), preserving any rules the user already has outside the `BEGIN/END` markers.
  - **update** and **repair** refresh it too, so team-rule changes reach users who already ran init (previously only init ever wrote it).
  - The other 4 files (package.json devDep, .gitignore, CI workflow, lockfile) stay project-level.

  The writer is extracted to `src/lib/claude-md.ts`, shared by all three commands, with a `homeDirOverride` injection point so tests never touch the real `~/.claude`.

## 1.0.4

### Patch Changes

- 21efe17: fix(init): surface real failure causes + stop falsely claiming success

  Three teammate-reported install-UX fixes (all from a real failed install where init printed "✓ Done" while the plugin never installed):

  - **Surface real stderr.** Failed `claude` / `npm` commands now include their actual stderr instead of a bare "Command failed: …". The real git error (`remote: Repository not found`) and EACCES details were being swallowed by `err.message`-only handling in `plugin-install.ts` and `integrations.ts`.
  - **EACCES hint that warns against sudo.** When `npm install -g` is denied (homebrew's root-owned global node_modules), init/update now print an actionable hint: set an npm prefix, and explicitly DON'T use `sudo` (it can install into root's HOME so Claude never finds the plugin, or leave root-owned files that break later updates).
  - **Honest Done message.** `init` no longer prints "Done. Team AI config installed." when the foodmax plugin install fails — it reports "Init incomplete — the foodmax plugin did NOT install", shows the reason, and gives the retry command.

## 1.0.3

### Patch Changes

- 45299fb: fix(init): drop git-repo preflight check so `npx -y foodmax-ai-config@latest init` succeeds in any directory.

  Previously init threw `... is not a git repository. Re-run with --yes ...` when the cwd had no `.git/`, which blocked teammates who ran the install command in their home dir or a fresh project before `git init`. The check was UX defense, not a technical requirement — init writes plain text files (`CLAUDE.md`, `package.json` devDep, `.gitignore`, `.github/workflows/ai-config-verify.yml`, `.foodmax-ai.lock.json`) and shells out to `claude plugin install` + MCP setup, none of which need git.

  `--yes` is retained as a no-op flag for backward compat (older docs and scripts reference it).

## 1.0.2

### Patch Changes

- 144db94: fix(release): version-packages now syncs plugin.json version too

  Claude Code reads plugin version from `plugin.json` (shown in
  `claude plugin list`). Previously version-packages only synced
  `.claude-plugin/marketplace.json`, leaving `plugin.json.version`
  stuck at whatever was last hand-edited. After v1.0.0 published with
  plugin.json hand-written at "1.0.0", v1.0.1 published with the same
  "1.0.0" string — installed plugin showed "Version: 1.0.0" even though
  the npm package was 1.0.1.

  Now version-packages also rewrites `plugin.json.version` and stages
  it in the version-bump commit, so future releases stay in sync.

## 1.0.1

### Patch Changes

- 9f2d256: fix(plugin): correct marketplace.json + plugin.json schema so `claude plugin install` works

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
