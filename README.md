# foodmax-ai-config

> FoodMax 团队统一的 AI 助手配置 — 既是 **Claude Code plugin**（team skills、hooks、CLAUDE.md），也是 **npm CLI**（`npx foodmax-ai` 锁版本、CI 守门）。

一行命令把团队规则、Claude Code skills、MCP 集成统一落到你的开发环境，并由 lockfile 保证大家用的是同一份。

---

## 目录

- [快速开始](#快速开始) · 90% 读者
- [日常操作](#日常操作)
- [Feishu 凭据](#feishu-凭据)
- [预装 Skill](#预装-skill)
- [安全 & deprecation](#安全--deprecation)
- [Troubleshooting](#troubleshooting)
- [给维护者](#给维护者) · 5% 读者
- [v1 不做的事](#v1-不做的事)
- [反馈 & 贡献](#反馈--贡献)

---

## 快速开始

### 前置条件

| 工具 | 版本 | 说明 |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | `>=1.0.0` | 不满足 `init` 会直接报错 |
| Node | `18+` | |
| Git | 任意 | 需能 clone Codeup 私有 repo（公司 SSO 或 git credential helper） |

### 安装

在你的 FoodMax 项目根目录（例如 `~/CodeBuddy/foodmax-backend/`）跑：

```bash
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init
```

### 之后 3 步

1. **重启 Claude Code** — 让 plugin / MCP 生效
2. **配置 Feishu 凭据** — 见 [Feishu 凭据](#feishu-凭据)
3. **Commit `.github/workflows/ai-config-verify.yml`** — 让 CI 帮你守门

---

## init 做了什么

| 项目内改动 | 全局安装（best-effort） |
|---|---|
| 插入团队规则到 `CLAUDE.md` | `superpowers` plugin (TDD / brainstorming / parallel-agents 等) |
| `foodmax-ai-config` 加进 `package.json` devDependencies | Playwright MCP |
| `.claude/settings.local.json` 加进 `.gitignore` | Feishu MCP (`@larksuiteoapi/lark-mcp`) |
| `.github/workflows/ai-config-verify.yml` | `@larksuite/cli` (`lark-cli`) |
| `.foodmax-ai.lock.json` 记录版本 | |

> 全局集成是 **best-effort**：任一失败只打 `⚠` 警告，不会中断 init。重跑 `init` 会自动补装。

---

## 日常操作

### 同步最新配置

```bash
npx foodmax-ai update
```

拉最新包 → 刷 plugin → 重跑集成 → 重写 lockfile。

### 装/降到指定版本

```bash
npx foodmax-ai update --version 0.2.1
```

可用版本见 [versions.json](versions.json)。

### MCP 注册参数变了？加 `--force-mcp`

如果维护者改了某个 MCP 的注册参数（例如 `@playwright/mcp` 从 `latest` 改成 `1.0.5`），普通 `update` 看到 MCP 已注册会跳过。维护者通知"请加 `--force-mcp`"时：

```bash
npx foodmax-ai update --force-mcp
```

会先 `claude mcp remove` 包内管理的 MCP（playwright + feishu），再重新注册。

### 状态查询

```bash
npx foodmax-ai status              # 列出与团队版本的 drift
npx foodmax-ai status --diff       # 看 drift 具体内容
npx foodmax-ai verify              # CI 用：--strict 时 drift exit 1
npx foodmax-ai repair              # 一键覆盖回团队版本
```

### 本地实验改 skill

直接改 `node_modules/foodmax-ai-config/skills/.../SKILL.md`。本地 `verify` 软警告，不挡你。

- 实验成功想保留 → 提 PR 到 [Codeup repo](https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init)
- 想丢弃 → `npx foodmax-ai repair`

---

## Feishu 凭据

Feishu MCP 启动时读 `$LARK_APP_ID` / `$LARK_APP_SECRET`。`init` **不会**帮你写这两个变量（团队公用一组 token 不安全）。

从飞书管理员那里拿，或在 [open.feishu.cn](https://open.feishu.cn) 自建应用拿，然后：

```bash
echo 'export LARK_APP_ID=cli_xxxxx' >> ~/.zshrc
echo 'export LARK_APP_SECRET=xxxxx' >> ~/.zshrc
# 重启 Claude Code 让 MCP 读到新 env
```

没设也能跑，但每次调用都会 `lark unauthorized`。

---

## 预装 Skill

`init` 后这些 skill 自动可用（来自社区生态，团队公用一份）。**用自然语言直接说就行** —— "帮我把这两个 PDF 合一个"、"读 xlsx 第 2 sheet 的数据"等等，Claude 会自动选择匹配的 skill，不需要记 slash 命令。

**文档处理**

| Skill | 用途 |
|---|---|
| `docx` | Word `.docx` 读 / 写 / 编辑（表格、目录、页眉等） |
| `pdf` | PDF 合并 / 拆分 / 水印 / 表单 / 加密 / OCR |
| `pptx` | PowerPoint 演示文稿创建 + 解析 + 编辑 |
| `xlsx` | Excel / CSV / TSV 读写 + 数据清洗 |
| `prd` | 生成结构化 PRD（含 user stories、技术规格、风险分析） |

**构建 / 设计**

| Skill | 用途 |
|---|---|
| `frontend-design` | 高质量前端 UI 生成，避开 generic AI 美学 |
| `theme-factory` | 给 artifact 套主题样式（10 个预设主题或现场生成） |
| `webapp-testing` | 用 Playwright 测试本地 web 应用、抓截图、读 console log |

**Meta**

| Skill | 用途 |
|---|---|
| `skill-creator` | 创建 / 改 / 评测 skill |
| `find-skills` | 帮你找一个能解决某问题的 skill |

> **没有 FoodMax team-specific slash 命令**（PR 模板、新模块脚手架等团队自定义 skill 还没人写）。想加 → 见 [给维护者 § 加新 skill](#给维护者)。

---

## 安全 & deprecation

每次跑 `foodmax-ai <任何命令>`，CLI 启动时会悄悄检查项目当前版本是否被维护者标记为 deprecated：

| Prefix | 含义 | 行为 |
|---|---|---|
| `⚠️  DEPRECATED:` | 老版本有问题但不严重 | 警告，命令照常执行 |
| `🚫 BLOCKED:` | 严重 bug 或安全问题 | `init` / `update` **硬拦**，必须升级到 `fixedIn` 版本 |

发现漏洞请通过 [SECURITY.md](SECURITY.md) 私下联系，不要提 public issue。

---

## Troubleshooting

| 现象 | 解 |
|---|---|
| `claude: command not found` | 装 [Claude Code](https://claude.com/claude-code) |
| `verify` 在 CI exit 1 | 本地跑 `npx foodmax-ai status --diff` 看 drift |
| 第一次 init 拉不下 repo | 检查公司 SSO / git credential helper |
| `init` 跑一半失败 | 重跑就行，init 是 idempotent 的 |
| `pnpm lock` 在 CI 失败 | 本地跑 `pnpm lock`，commit `.locked.json` |
| Feishu MCP 全 401 | `echo $LARK_APP_ID` 是否空；写 `~/.zshrc` 后**重启** Claude Code |
| `lark-cli: command not found` 但 init 报已装 | 开新 terminal 或 `source ~/.zshrc` |
| `MCP "X" already registered` 警告 | 本地已有同名 MCP；想换成团队版跑 `update --force-mcp` |
| `🚫 BLOCKED: v...` 报错 | 装的版本被维护者禁用；`update --version <fixedIn>` 升级 |

---

## 给维护者

### 加新 skill

```bash
mkdir skills/foodmax-new-thing
# 写 skills/foodmax-new-thing/SKILL.md (带 frontmatter)
pnpm lock                                    # 重算 .locked.json
git add skills/ .locked.json
git commit -m "feat(skills): add foodmax-new-thing"
git push origin feat/new-thing
# 提 PR
```

### 日常 PR

```bash
pnpm changeset                               # 选 patch/minor/major + 一行人话描述
git add . && git commit -m "feat: ..." && git push
```

`pre-push` hook 会拦没 changeset 的 PR（除非 commit message 含 `[skip-changeset]`，仅限纯 docs/test/ci 改动）。

### Cut a release

```bash
pnpm pre-release                             # 自检：typecheck + test + build + lockfile + audit + git
pnpm version-packages                        # bump version + 写 CHANGELOG
pnpm release                                 # tag + push + update versions.json
```

完整流程 + 漏洞响应 + rollback 见 [RELEASING.md](RELEASING.md)。

> ⚠️ Release 当前手动。Codeup 不自动识别 repo 内 CI 文件，等管理员接入云效 Flow 才能自动化。

### 改了 MCP 注册参数

changeset 描述里点明，release 后在飞书群提醒：

> ⚠️ 本次升级修改了 MCP 注册参数，请用 `npx foodmax-ai update --force-mcp` 升级。

---

## v1 不做的事

明确不支持 — 不是优先级问题，是设计边界：

- Cursor / Codex 集成
- 数字签名 / GPG（信任边界是 Codeup repo ACL + lockfile sha256）
- Windows
- Web UI
- 私有 npm registry 适配

理由详见 [设计文档 §14](docs/superpowers/specs/2026-05-25-foodmax-ai-config-design.md)。

---

## 反馈 & 贡献

| 类型 | 渠道 |
|---|---|
| 用法问题 / Bug | 飞书 @epingpong 或团队群 at |
| 漏洞 | [SECURITY.md](SECURITY.md) — **不要发 public issue** |
| 想贡献新 skill / 改进 | 提 PR 到 [Codeup repo](https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init) |
