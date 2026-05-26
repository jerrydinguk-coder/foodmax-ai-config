# foodmax-ai-config — 设计文档

> **状态**：草案，待 review
> **日期**：2026-05-25
> **作者**：epingpong（with Claude Opus 4.7）
> **scope 预估**：2–3 人天（与原简报一致）

---

## 1. Executive Summary

`foodmax-ai-config` 是一个 **同时是 Claude Code plugin、又是 npm 包** 的 git 仓库，解决 FoodMax 团队成员之间 AI 工具配置漂移的问题。

团队成员通过一行命令落地：

```bash
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init
```

工程师本地的 Claude Code 会获得统一的 skills / hooks / CLAUDE.md 团队规则；项目根会落一个小巧的 `CLAUDE.md` + `.foodmax-ai.lock.json`；CI 通过 `npx foodmax-ai verify --strict` 守门，保证 main 分支永远在团队约定的版本上。

不重造 Claude Code 已有的 plugin 分发能力，npm 这一层只做 plugin 做不了的事：**项目级锁版本 + CI 守门 + 一行 npx 体验**。

---

## 2. Problem Statement

**痛点**（来自简报，验证有效）：

1. **配置漂移**：同事 A 本地装了 superpowers，同事 B 没装；A 的 CLAUDE.md 写了 "TDD first"，B 的没写；同一份代码两人让 Claude 改出来质量天差地别。
2. **新人入职折腾**：新人入职折腾半天才让 Claude Code 加载到团队的 skills 和规则，期间产出质量低。
3. **团队约定无强制**：群里 @ 提醒"记得装 X 插件"，没人执行，群消息冲散后约定丢失。

**简报中我们排除的痛点（非本项目目标）**：

- ❌ 多 AI 工具协同（Cursor / Codex 暂不覆盖，单一 Claude Code）
- ❌ 防御内部恶意篡改（当前威胁模型是"防意外漂移"，不引入签名/PKI）

---

## 3. Goals / Non-Goals

### Goals

1. **G1 易安装**：在干净 macOS / Linux 环境，一行 `npx` 命令完成全部配置落地，无需手动 ln/cp
2. **G2 易维护**：维护者 push commit → 团队成员 `npx ... update` 即可同步；零额外基础设施（无私有 npm registry）
3. **G3 可校验**：CI 能机械地判断"这个项目当前是否在团队约定的版本上"，drift 必拦
4. **G4 不挡路**：工程师本地实验性改动不被强制拦截；提供 `repair` 一键还原
5. **G5 可演进**：skills / hooks / CLAUDE.md 都是可增量扩展的，加新 skill 只需 commit + 推

### Non-Goals

- **NG1** 不覆盖 Cursor / Codex / 其他 AI 工具
- **NG2** 不提供数字签名 / GPG 校验（threat model 不需要）
- **NG3** 不做 Web UI / 仪表盘
- **NG4** 不重新实现 Claude plugin 系统（直接复用 `claude plugin` CLI）
- **NG5** 不在 v1 里强制每次 Claude Code 启动都自动 verify（可选 hook）

---

## 4. Decisions Log

| # | 决策点 | 选定 | 排除项 + 原因 |
|---|---|---|---|
| D1 | 目标 AI 工具 | 只 Claude Code | + Cursor / + Codex：scope 爆炸、Cursor 无 skill 原生概念 |
| D2 | 仓库形态 | Plugin + 薄 npm CLI（双形态） | 纯 plugin：丢项目级锁；纯 npm：重造分发轮子 |
| D3 | FoodMax 性质 | 真实团队，约定未梳理 | 最小可扩展骨架：1 CLAUDE.md + 2 skill + 1 hook |
| D4 | 校验失败行为 | 双模式：默认软警告，`--strict` 硬拦 | 硬拦默认：阻挡实验；软警告默认：CI 无法守门 |
| D5 | 分发渠道 | 私有 git（github org） | 公开 npm：可能泄密；私有 registry：基础设施重 |
| D6 | 技术栈 | TypeScript + tsx + pnpm | 简报指定，无异议 |

---

## 5. Architecture

### 5.1 双形态：一个仓库，两种装法

```
                  https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
   /plugin marketplace add        npx -y github:... init
   /plugin install                       │
              │                          │
              ▼                          ▼
   ~/.claude/plugins/...     ~/.claude/plugins/... (同上)
   (用户全局)                    +
                              <project>/CLAUDE.md
                              <project>/.foodmax-ai.lock.json
                              <project>/package.json (devDep)
                              <project>/.claude/settings.json
                              <project>/.github/workflows/ (示例)
```

- **plugin 安装路径**：个人 / 临时项目用，零依赖 Node
- **npm init 安装路径**：团队正式 repo 用，附带项目级锁 + CI 集成

两条路径可共存：npm `init` 命令内部就是调 `claude plugin marketplace add` + `claude plugin install`，再加项目级文件。

### 5.2 关注点分离

| 层 | 职责 | 文件 |
|---|---|---|
| **plugin manifest** | 让 Claude Code 识别为 plugin | `.claude-plugin/marketplace.json` |
| **plugin content** | 被 Claude 真正消费的内容 | `CLAUDE.md`、`skills/`、`hooks/`、`commands/`、`agents/` |
| **npm CLI** | plugin 做不到的编排 | `src/cli.ts`、`src/commands/*` |
| **integrity** | 锁版本 + 校验 | `.locked.json`（包内）、`.foodmax-ai.lock.json`（项目内） |
| **maintainer tooling** | 维护者侧 release | `pnpm run lock`、`pnpm run release` scripts |

---

## 6. Repository Layout

```
foodmax-ai-config/
├── package.json                        ← name: "foodmax-ai-config"
│                                          bin: { "foodmax-ai": "dist/cli.js" }
│                                          engines.node: ">=18"
├── pnpm-lock.yaml
├── tsconfig.json
├── .npmrc
├── .gitignore                          ← 排除 dist/、node_modules/
├── .claude-plugin/
│   └── marketplace.json                ← Claude Code plugin manifest
├── CLAUDE.md                           ← 团队级规则，plugin 加载时自动注入
├── skills/
│   ├── foodmax-pr-description/
│   │   └── SKILL.md                    ← 示例 skill 1
│   └── foodmax-new-module/
│       └── SKILL.md                    ← 示例 skill 2
├── hooks/
│   └── session-start-banner.sh         ← 示例 hook
├── commands/                           ← 预留，v1 空
├── agents/                             ← 预留，v1 空
├── src/
│   ├── cli.ts                          ← commander 路由
│   ├── commands/
│   │   ├── init.ts
│   │   ├── verify.ts
│   │   ├── status.ts
│   │   ├── repair.ts
│   │   ├── update.ts
│   │   └── lock.ts                     ← 维护者用
│   ├── lib/
│   │   ├── plugin-install.ts           ← 包 `claude plugin ...` 调用
│   │   ├── lockfile.ts                 ← 生成/读/校验 .locked.json
│   │   ├── hash.ts                     ← 稳定 sha256
│   │   ├── paths.ts                    ← 解析 ~/.claude/、项目根、包根
│   │   ├── claude-detect.ts            ← 探测 claude CLI 是否安装
│   │   └── merge.ts                    ← settings.json / CLAUDE.md 幂等合并
│   └── templates/
│       ├── project-claude-md.tpl       ← 写入消费者 CLAUDE.md 的模板
│       ├── ci-workflow.tpl             ← .github/workflows/ai-config-verify.yml
│       └── settings-json.tpl
├── tests/
│   ├── init.test.ts                    ← 临时目录模拟 init
│   ├── verify.test.ts                  ← drift / strict / soft
│   ├── lockfile.test.ts                ← hash 稳定 + 跨平台一致
│   ├── merge.test.ts                   ← BEGIN/END 区块幂等
│   └── helpers/
│       └── tempProject.ts
├── .locked.json                        ← 维护者 `pnpm run lock` 生成
└── README.md                           ← 团队 + 维护者两段
```

**关键点**：
- `.locked.json` **commit 进 git**（不是 .gitignore）
- 锁哈希范围 = `CLAUDE.md` + `.claude-plugin/**` + `skills/**` + `hooks/**` + `commands/**` + `agents/**`。**不** 包含 `src/` / `tests/` / `dist/` / `package.json`
- 简报中的 `bin/init.ts` 被改为 `src/commands/init.ts` + commander 路由（更标准）

---

## 7. `init` Flow

```
$ cd ~/my-foodmax-project
$ npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init
```

### Step 0: 环境探测（不写任何文件）

- `claude --version` 是否能跑 → 否则 exit 1，提示装 Claude Code
- `git rev-parse --is-inside-work-tree` → 否则交互确认是否继续
- 包内 `.locked.json` 是否存在且自洽 → 否则 exit 1，提示包损坏
- Node ≥ 18 → 否则 exit 1
- **私有仓库鉴权**：`npx -y github:foodmax/...` 底层走 git clone；用户需提前配置 SSH key 或 `gh auth login`。init 不做鉴权管理；clone 失败时打印 npm/git 原生错误并提示"check your GitHub access to foodmax/ai-config-init"

### Step 1: 写消费者项目级文件

| 操作 | 文件 | 行为 |
|---|---|---|
| 创建/合并 | `<project>/CLAUDE.md` | 不存在则写入完整模板；存在则在文件头插入 `<!-- BEGIN foodmax-ai -->` … `<!-- END foodmax-ai -->` 区块，其余原样保留 |
| 修改 | `<project>/package.json` | `devDependencies["foodmax-ai-config"]` = `"https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git#<commit-sha>"` |
| 创建/追加 | `<project>/.gitignore` | 确保 `.claude/settings.local.json` 已忽略；幂等检查 |
| 创建 | `<project>/.github/workflows/ai-config-verify.yml` | 仅当目录不存在或文件缺失时创建；存在则跳过并提示 |

**v1 不动 `.claude/settings.json`**：所有 hook 注册通过 plugin manifest（`.claude-plugin/marketplace.json` 的 `hooks: []`）完成，避免与用户项目级 settings.json 的其他字段产生 merge 风险。后续如需写项目级 settings（如禁用某 MCP），单独 ADR 评估。

### Step 2: 装 Claude plugin（覆盖用户全局 `~/.claude/`）

```bash
claude plugin marketplace add https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git
claude plugin install foodmax-ai-config@foodmax-ai-config --scope user
```

- 幂等：已装且版本一致则跳过；版本不同则升级
- 失败处理：若 `claude` CLI 调用失败，打印底层错误 + 提示用 `--manual` 重新跑（fallback: 手工写 `~/.claude/plugins/marketplaces/...` 与 `installed_plugins.json`）

### Step 3: 写项目级锁文件

`<project>/.foodmax-ai.lock.json`：

```json
{
  "version": 1,
  "package": "foodmax-ai-config",
  "source": "https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git",
  "commitSha": "abc123def456...",
  "packageVersion": "1.3.0",
  "packageRootHash": "9f8e7d6c5b4a...",
  "initializedAt": "2026-05-25T10:30:00Z",
  "initializedBy": "foodmax-ai@1.3.0"
}
```

### Step 4: 打印 next-steps（详见 §10）

### 幂等性保证

- 多次跑 init 不会累积副作用
- BEGIN/END 区块策略防止 CLAUDE.md 被多次插入
- settings.json 深合并不丢用户其他配置
- plugin install 通过 version 检测决定 skip/upgrade

---

## 8. Lockfile + Verify

### 8.1 `.locked.json`（包内）结构

```json
{
  "version": 1,
  "tool": "foodmax-ai-config@1.3.0",
  "generatedAt": "2026-05-25T08:00:00Z",
  "algorithm": "sha256",
  "tree": {
    "CLAUDE.md": "a1b2c3...",
    ".claude-plugin/marketplace.json": "d4e5f6...",
    "skills/foodmax-pr-description/SKILL.md": "...",
    "skills/foodmax-new-module/SKILL.md": "...",
    "hooks/session-start-banner.sh": "..."
  },
  "rootHash": "9f8e7d..."
}
```

### 8.2 哈希规则

- **算法**：sha256(file_bytes)，**不做任何 normalize**（不转 LF、不 trim、不忽略 BOM）
- **路径选择**：白名单目录 — `CLAUDE.md` + `.claude-plugin/**` + `skills/**` + `hooks/**` + `commands/**` + `agents/**`
- **rootHash**：tree 按路径字典序排序后，`<path>:<hash>\n` 拼接再 sha256
- **生成时机**：维护者 `pnpm run lock`；CI 在 publish 前再跑一次 verify-lock 确认是最新

### 8.3 verify 行为矩阵

| 条件 | 默认模式 | `--strict` 模式 |
|---|---|---|
| 包内 hash 不匹配（本地改了 node_modules/） | ⚠ 黄色警告 + diff，exit 0 | ✗ exit 1 + diff + 修复提示 |
| 包内 hash 匹配但项目锁过期（包更新了） | ⚠ 提示 `update`，exit 0 | ✗ exit 1，提示 `update` |
| 全部一致 | ✓ "All checks pass"，exit 0 | ✓ 同左 |
| 包未安装（缺 node_modules） | ✗ exit 2，提示 `init` | ✗ 同左 |
| `.foodmax-ai.lock.json` 缺失 | ✗ exit 2，提示 `init` | ✗ 同左 |

### 8.4 drift 输出示例

```
$ npx foodmax-ai verify
⚠ Drift detected in foodmax-ai-config@1.3.0

  Modified (2):
    M  skills/foodmax-pr-description/SKILL.md
       expected: a1b2c3d4e5f6...
       actual:   9f8e7d6c5b4a...
    M  CLAUDE.md

  To inspect diff:  npx foodmax-ai status --diff
  To repair:        npx foodmax-ai repair
  To accept:        contribute back via PR (see CONTRIBUTING.md)

  Soft mode: exit 0. Use --strict in CI to fail the build.
```

### 8.5 逃生通道

- 工程师改 `node_modules/foodmax-ai-config/skills/.../SKILL.md` 实验调效果 — 默认 verify 软警告不挡路
- 想保留：丢回团队仓库走 PR → 维护者 merge → `pnpm run lock` → push → 团队 `update`
- 想放弃：`npx foodmax-ai repair` 还原
- CI `--strict` 模式拦截 main：偷塞本地实验改进不了生产

---

## 9. CLI Surface

```
foodmax-ai <command> [options]

Commands:
  init           Bootstrap this project with foodmax-ai-config (writes
                 project-level files + installs Claude plugin)
  verify         Check current install vs locked version (default: soft)
                 Options: --strict (exit 1 on drift)
  status         Show drift detail (--diff for full diff)
  repair         Overwrite node_modules/foodmax-ai-config/ back to package
                 contents (undo local edits)
  update         Re-fetch latest from git, re-run plugin install, rewrite
                 project lockfile
  lock           [maintainer] Regenerate .locked.json from current tree
  --version, -v
  --help, -h
```

---

## 10. 示例内容（v1 ships with）

### 10.1 CLAUDE.md（团队级，plugin 加载时注入）

```markdown
# FoodMax AI 规则

## 1. 写代码先写测试
所有代码变更从失败测试开始。bug 复现测试先于修复；新功能行为测试先于实现。

## 2. 改动最小化
匹配已有风格；不顺手改无关代码；发现不相关问题口头汇报不动手。

## 3. 使用团队 skill
- 写 PR 描述用 `/foodmax-pr-description`
- 创建新模块用 `/foodmax-new-module`

## 4. 不引入未审计依赖
任何新 npm/python 依赖在 PR 描述里单独标注，原因 + 替代方案评估。
```

> _后续可由 FoodMax 内部 review 后扩充。当前是 v1 占位骨架。_

### 10.2 示例 skill 1: `foodmax-pr-description`

`skills/foodmax-pr-description/SKILL.md`：

```markdown
---
name: foodmax-pr-description
description: Generate a PR description following FoodMax team format (Why / What / How verified / Risk)
---

# FoodMax PR Description

When user asks to write a PR description (or `/foodmax-pr-description`):

1. Run `git log <base>..HEAD` to collect commits
2. Run `git diff <base>...HEAD` to summarize changes
3. Output in this exact format:

\`\`\`markdown
## Why
<one paragraph: business or technical motivation>

## What
- <bullet per significant change>

## How verified
- [ ] <test command 1>
- [ ] <manual check 1>

## Risk
<one sentence: what breaks if this ships wrong>

## Rollback
<one sentence: how to revert quickly>
\`\`\`
```

### 10.3 示例 skill 2: `foodmax-new-module`

`skills/foodmax-new-module/SKILL.md`：

```markdown
---
name: foodmax-new-module
description: Scaffold a new module following FoodMax conventions (placeholder, customize per team stack)
---

# FoodMax New Module Scaffold

> v1 占位。后续根据 FoodMax 实际技术栈（TS/Python/Go）展开具体目录结构。

When user runs `/foodmax-new-module <module-name>`:
1. Confirm module name + target language with user
2. Generate skeleton: index file, test file, README stub
3. Run team linter / formatter
4. Stage files for commit
```

### 10.4 示例 hook: `session-start-banner.sh`

`hooks/session-start-banner.sh`：

```bash
#!/usr/bin/env bash
# SessionStart hook: print team reminder + lockfile status
set -euo pipefail

if [[ -f ".foodmax-ai.lock.json" ]]; then
  LOCKED_VERSION=$(node -p "require('./.foodmax-ai.lock.json').packageVersion" 2>/dev/null || echo "?")
  echo "FoodMax AI config: locked to v${LOCKED_VERSION}"
  # 不阻塞会话：如果想做 drift check 改成 npx foodmax-ai verify
else
  echo "⚠ FoodMax AI config not initialized. Run: npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init"
fi
```

注册位置（在 `.claude-plugin/marketplace.json` 或 plugin manifest 中）：`SessionStart` 事件触发。

### 10.5 `.claude-plugin/marketplace.json`

```json
{
  "name": "foodmax-ai-config",
  "owner": { "name": "FoodMax Engineering" },
  "plugins": [
    {
      "name": "foodmax-ai-config",
      "source": ".",
      "description": "FoodMax team-wide AI rules, skills, and hooks",
      "version": "1.0.0",
      "hooks": [
        { "event": "SessionStart", "command": "bash ${PLUGIN_DIR}/hooks/session-start-banner.sh" }
      ]
    }
  ]
}
```

---

## 11. 维护者侧 Workflow（发布新版本）

```
# 1. 维护者改完 skill / CLAUDE.md / hook
git add skills/foodmax-pr-description/SKILL.md

# 2. 重算锁
pnpm run lock        # 内部: foodmax-ai lock; 改写 .locked.json
git add .locked.json

# 3. 提 PR
git commit -m "skills: update PR description format"
git push origin feat/pr-desc-update
# → PR review → merge to main

# 4. 打 tag（语义化版本）
git tag v1.4.0
git push --tags

# 5. （可选）GitHub Release 自动化
# .github/workflows/release.yml 在 tag push 时跑测试 + verify-lock
```

**关键守则**：
- `.locked.json` 必须随每个改动 skills/hooks/CLAUDE.md 的 PR 一起更新；CI 里加 `pnpm run lock:check` 拦截
- 版本号语义：major = breaking（删 skill / 改 CLAUDE.md 强制规则）；minor = 加 skill / 加 hook；patch = 文案修订
- 团队成员通过 commit SHA 或 tag 指定版本：`devDependencies["foodmax-ai-config"]: "https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git#v1.4.0"`

---

## 12. Test Strategy

### 12.1 单元测试

| 文件 | 测什么 |
|---|---|
| `tests/hash.test.ts` | sha256 跨平台一致（mac/linux/win 同输入同输出）；空文件、二进制、CRLF/LF 差异都能被检测 |
| `tests/lockfile.test.ts` | 同 tree 生成同 rootHash；任一文件改一字节，rootHash 必变；白名单外的 src/ 改动不影响 hash |
| `tests/merge.test.ts` | CLAUDE.md BEGIN/END 区块幂等；settings.json 深合并不丢用户字段 |

### 12.2 集成测试

| 文件 | 测什么 |
|---|---|
| `tests/init.test.ts` | 临时 tempDir：跑 `init` → 检查所有应写文件存在、内容正确；再跑一次 `init` → 文件无新增 diff |
| `tests/verify.test.ts` | init 后 verify pass → 改 `node_modules/.../skill.md` → 默认 warn exit 0；`--strict` exit 1；`repair` 后 verify pass |
| `tests/update.test.ts` | 模拟"包升级"（修改包内文件 + 重生成 .locked.json）→ verify 提示过期 → update 后 verify pass |

### 12.3 E2E 验收（对应简报"怎么算解完了"）

| 验收项 | 测试方法 |
|---|---|
| `npx <包名> init` 在干净环境跑通 | CI 跑在 `ubuntu-latest` clean runner |
| 目标 AI 工具启动后能看到 skill 出现在列表 | `claude -p "list available skills" --print` 输出含 `foodmax-pr-description` |
| 故意改一个 skill 文件，校验脚本能 reject | `tests/verify.test.ts` 中的 strict 用例 |

### 12.4 不测什么

- ❌ 不测 Claude API 本身的行为
- ❌ 不在 v1 测 Windows（Cross-platform 仅 macOS + Linux；Windows 后续按需）

---

## 13. Cross-Platform + Error Handling

### 13.1 平台

- v1 支持 macOS（darwin）+ Linux（ubuntu / debian / alpine）
- Windows：v1 不支持，bin 入口加 platform check，明确报错"Windows not supported in v1"
- Node ≥ 18（用 `node:fs/promises`、原生 fetch、`URL`）

### 13.2 错误分类与 exit code

| Exit | 含义 |
|---|---|
| 0 | 成功 |
| 1 | drift / verify failed in strict mode |
| 2 | 环境问题（claude 未装、Node 版本不够、包未 init） |
| 3 | 不可恢复错误（包损坏、IO 失败） |
| 130 | 用户 ctrl+c |

### 13.3 错误信息原则

- 每个错误必须告诉用户**下一步做什么**（"Run `npx foodmax-ai init`" 而不是"file not found"）
- 用 emoji 前缀分级：✓ 成功 / ⚠ 警告 / ✗ 错误
- 不输出 stack trace 给终端用户；写到 `~/.foodmax-ai/debug.log` 给维护者排查

---

## 14. 显式 YAGNI / Out of Scope（v1 不做）

- ❌ Cursor / Codex / Aider 等其他 AI 工具支持
- ❌ 数字签名 / GPG / 公钥 PKI
- ❌ Web UI / 仪表盘
- ❌ 每次 Claude Code 启动自动 verify（改用可选 SessionStart hook，团队可选）
- ❌ skill 二进制资源 / 图片 / 大文件特殊处理（v1 全 markdown）
- ❌ 多团队 multi-tenant（每个团队 fork 一份独立的 foodmax-ai-config 仓库）
- ❌ rollback 历史 / 时光机
- ❌ Windows 平台
- ❌ private npm registry 适配（git 已够）
- ❌ skill marketplace / 第三方贡献机制

---

## 15. Acceptance Criteria（对应简报"怎么算解完了"）

| 简报要求 | 验收方法 | 落在哪个 test |
|---|---|---|
| `npx <包名> init` 在干净环境跑通 | CI: `ubuntu-latest` runner，跑 init → 检查文件树 | `tests/init.test.ts` + `.github/workflows/e2e.yml` |
| 目标 AI 工具启动后能看到 skill 出现在列表 | `claude -p "list skills"` 含 `foodmax-pr-description` | `tests/e2e-claude.test.ts` |
| 改一个 skill 文件，校验脚本 reject | `verify --strict` exit 1 + 输出 diff | `tests/verify.test.ts:strictMode` |
| ≥ 10 个 skill | **简报这条被 push back**：v1 ship 2 个示例 skill。"10 个 skill" 当前没有对应真实需求，强行凑数会污染团队规则。架构支持 N 个 skill 增量加，团队按需提 PR。 | 见 §3 Non-Goals + §10 |
| 一份完整性签名 | `.locked.json` rootHash + verify | `tests/lockfile.test.ts` |
| README 写明发布 / 安装 / 升级 | README 三段：consumer 1 段 + maintainer 1 段 + troubleshooting 1 段 | n/a |

---

## 16. README 结构

```markdown
# foodmax-ai-config

> FoodMax 团队统一的 AI 助手配置

## For team members（90% 读者）

### 第一次设置
\`\`\`bash
cd ~/my-foodmax-project
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init
\`\`\`

### 日常使用
- 重启 Claude Code，团队 skills 自动加载
- 写 PR 描述：`/foodmax-pr-description`
- 创建新模块：`/foodmax-new-module`

### 同步最新规则
\`\`\`bash
npx foodmax-ai update
\`\`\`

### 在 CI 里守门
将 `.github/workflows/ai-config-verify.yml` commit 进项目，CI 自动跑 `verify --strict`。

---

## For maintainers（5% 读者）

### 加新 skill
1. 在 `skills/<name>/SKILL.md` 写 frontmatter + 内容
2. `pnpm run lock` 重算锁
3. PR → review → merge → tag

### Release
\`\`\`bash
pnpm test
pnpm run lock
git tag v1.x.0
git push --tags
\`\`\`

---

## Troubleshooting（5% 读者）

- `claude command not found` → 装 [Claude Code](https://claude.com/claude-code)
- `verify exit 1 in CI` → 本地 `npx foodmax-ai status --diff` 看 drift
- 想看完整调试日志 → `~/.foodmax-ai/debug.log`
```

---

## 17. Open Questions（待 review 时确认）

| # | 问题 | 默认假设（无 push back 即采纳）|
|---|---|---|
| OQ1 | 仓库名是 `foodmax/ai-config-init` 还是 `foodmax/ai-config`？ | 用 `ai-config-init`（与项目目录名一致）|
| OQ2 | 包名是 `foodmax-ai-config` 还是 `@foodmax/ai-config`？ | 用 `foodmax-ai-config`（避免 scoped 包对 private registry 的耦合）|
| OQ3 | CLI bin 名是 `foodmax-ai` 还是 `foodmax-config`？ | 用 `foodmax-ai`（短）|
| OQ4 | session-start hook 默认开还是默认关？ | 默认**关**；init 时询问是否启用 |
| OQ5 | 团队成员是否需要 `.claude/settings.json` 里写自定义 hooks 配置？还是全部由 plugin manifest 处理？| **已决**：全部由 plugin manifest，v1 不动 settings.json（已反映在 §7 Step 1）|
| OQ6 | `init` 是否需要支持 `--dry-run`？ | v1 加：低成本高价值（让用户预览） |

---

## 18. 实现里程碑（待 writing-plans 展开）

1. **M1 骨架**：repo 目录、package.json、tsconfig、commander CLI 路由 → 跑得起 `foodmax-ai --help`
2. **M2 hash + lockfile**：`lib/hash.ts` + `lib/lockfile.ts` + `lock` 命令 + 单测
3. **M3 init 核心**：`commands/init.ts` + `lib/merge.ts` + `lib/paths.ts` + 集成测
4. **M4 verify + status + repair**：drift 检测 + diff 输出 + 修复
5. **M5 update**：再装 + 重写项目锁
6. **M6 示例内容**：2 skill + 1 hook + CLAUDE.md + marketplace.json
7. **M7 CI + E2E**：GitHub Actions workflow + e2e clean-room 测试
8. **M8 README + 发布**：文档 + tag + 验收

---

## Appendix A: 锁哈希范围决策记录

为什么哈希范围只包 plugin content，不包 src/：

- **src/ 频繁变更**：CLI 实现迭代 → hash 频繁变 → 团队 skill 没变也得跑 update，噪音大
- **src/ 已被 npm 版本锁**：consumer 的 package.json 已经 pin commit-SHA，src 改动会触发 npm install 触发版本检查
- **plugin content 是 Claude 真正消费的内容**：变了才会改变 Claude 行为，才值得团队同步

## Appendix B: 与 Claude Code plugin 系统的衔接细节

- 用 `claude plugin marketplace add <source>` 注册，`<source>` 支持 `github:owner/repo` 简写
- 用 `claude plugin install <name>@<marketplace-name> --scope user` 安装
- plugin 内的 `marketplace.json` 必须有 `name` / `plugins[]` 字段，每个 plugin 含 `name` / `source` / `version`
- hook 注册路径：plugin manifest 里的 `hooks: [{ event, command }]`，Claude 会自动注入到用户的 session
- skills 自动发现：plugin 目录下的 `skills/*/SKILL.md` 被 Claude 自动 index 进 Skill list
