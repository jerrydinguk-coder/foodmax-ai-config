# CHANGELOG

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
