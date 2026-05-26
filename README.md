# foodmax-ai-config

> FoodMax 团队 AI 助手统一配置 — 既是 **Claude Code plugin**（团队 skills、hooks、CLAUDE.md），也是 **CLI 工具**（lockfile 锁版本、drift 检测、CI 守门）。

一组命令把团队规则、Claude Code skills、MCP 集成铺到你的开发环境，并由 lockfile 保证大家用的是同一份。

---

## 快速开始

### 前置条件

| 工具 | 版本 | 说明 |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | `>=1.0.0` | init 启动时校验，不满足直接报错 |
| Node | `>=18` | init 启动时校验 |
| Git | 任意 | 必须能 clone Codeup 私有 repo — 见下方 |

### 关于 Codeup 认证

这个包**不发布到任何 npm registry**，所有分发都通过 Codeup git URL 直接 clone。所以每台用 `foodmax-ai` 的机器都需要先能访问下面这个 repo：

```bash
git ls-remote https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git
```

如果这条挂住或报 `ETIMEDOUT`，说明 git auth 没就绪 — 见本文末尾 Troubleshooting 章节第一行。

### 安装

在你的项目根目录（例如 `~/CodeBuddy/foodmax-backend/`）执行：

```bash
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git#v0.2.1 init
```

这一条命令做了所有事：npx 把 bootstrapper 从 Codeup 拉下来 → init 检测到项目里还没装 `foodmax-ai-config`、自动跑 `npm install --no-save` 把它装到你的 `node_modules/` → 写项目内文件、注册 plugin、装 MCP。

> 当前各 channel 的版本号见 [versions.json](versions.json)。想跟踪团队 `latest` channel（README 偶尔滞后），init 完之后跑一次 `npx foodmax-ai update`。

### init 跑完后必做 3 件事

1. **导出 Feishu 凭据到 shell rc** — 见下方「Feishu 凭据」一节。
2. **重启 Claude Code** — plugin 和 MCP 是 SessionStart 时加载；env 变了也要重启才能被 MCP 读到。
3. **commit CI workflow** — `git add .github/workflows/ai-config-verify.yml && git commit`。

---

## init 做了什么

### A. 在你的项目里改 5 个文件

| 路径 | 行为 | 重跑 init |
|---|---|---|
| `CLAUDE.md` | 在 `<!-- BEGIN/END foodmax-ai -->` 之间插入团队规则 | 覆写标记内，标记外不动 |
| `package.json` | 加 `devDependencies["foodmax-ai-config"] = "<url>#vX.Y.Z"` | 已有该 key 则不动（不会自动升 version）|
| `.gitignore` | 追加 `.claude/settings.local.json` | 已有该行则跳过 |
| `.github/workflows/ai-config-verify.yml` | 写入 GitHub Actions CI 工作流 | 文件已存在则跳过 |
| `.foodmax-ai.lock.json` | 记录 `packageVersion` + `commitSha` + `packageRootHash` + `initializedAt` | 每次重写 |

> CI workflow 钉的是 bootstrapper repo 的 `#main` 分支，**不是**你 init 时的 tag — CI 验证会随 bootstrapper main 漂移。

### B. 注册 foodmax-ai-config plugin 到 Claude Code

```
claude plugin marketplace add <Codeup URL>#<tag>
claude plugin install foodmax-ai-config@foodmax-ai-config --scope user
```

这一步装的就是本仓库 — 它带来下方 § D 列出的 10 个预装 skill。失败只打 ⚠ 警告，不会中断 init。

### C. 全局 4 项 best-effort 集成

每项失败都只打 ⚠ 警告，不会中断 init。

| 集成 | 命令 | 已装时 |
|---|---|---|
| superpowers plugin | `claude plugin install superpowers@superpowers-dev --scope user` | 不检测，直接重跑（Claude 自己去重）|
| Playwright MCP | `claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest` | `claude mcp list` 看到则跳过 |
| Feishu MCP | `claude mcp add feishu --scope user -- sh -c '...lark-mcp...'` | `claude mcp list` 看到则跳过 |
| `@larksuite/cli` | `npm install -g @larksuite/cli` | `which lark-cli` 看到则跳过 |

被跳过的 MCP 如果是别人的版本而不是团队版，跑 `npx foodmax-ai update --force-mcp` 强制重装。

### D. 自带的 10 个预装 Skill

这 10 个 skill 是 § B 装的 plugin 的一部分，init 完成后立刻可用。用自然语言说就行 —— "把这两个 PDF 合一个"、"读 xlsx 第二个 sheet" —— Claude 会自动选 skill，不用记 slash 命令。

| Skill | 用途 |
|---|---|
| `docx` | Word `.docx` 读 / 写 / 编辑 |
| `pdf` | PDF 合并、拆分、加密、OCR、水印、表单 |
| `pptx` | PowerPoint 创建、解析、编辑 |
| `xlsx` | Excel / CSV / TSV 读写 + 数据清洗 |
| `prd` | 生成 PRD（含 user stories、技术规格、风险）|
| `frontend-design` | 高质量前端 UI 生成 |
| `theme-factory` | 给 artifact 套主题样式（10 个预设主题）|
| `webapp-testing` | Playwright 测试本地 web app + 截图 |
| `skill-creator` | 创建 / 改 / 评测 skill |
| `find-skills` | 帮你找一个能解决某问题的 skill |

> **没有 FoodMax-specific slash 命令** — repo 里 `commands/` 和 `agents/` 目录目前都不存在。想加新 skill 见下方「给维护者」一节的「加新 skill」。

### E. init 的 flags

| Flag | 行为 |
|---|---|
| `--dry-run` | 只打印"将执行"的动作，不写文件、不 shell out |
| `--yes` | 跳过 "必须在 git repo 里" 这一条 preflight |
| `--version <semver>` | pin 到具体版本（与 `--channel` 互斥）|
| `--channel <name>` | 从 versions.json 选 channel（默认 `latest`）|

---

## 日常操作

### 同步最新

```bash
npx foodmax-ai update                  # 拉 latest channel
npx foodmax-ai update --version 0.2.1  # pin 到具体版本
npx foodmax-ai update --force-mcp      # 维护者通知 MCP 注册参数变了时用
```

update 会：reinstall 包 → 刷 plugin marketplace → 重跑 4 项集成 → 重写 `.foodmax-ai.lock.json`。
`--force-mcp` 先 `claude mcp remove playwright feishu`，再走集成 B/C 重新注册。

### 状态查询

```bash
npx foodmax-ai status              # 列 modified / added / removed
npx foodmax-ai status --diff       # 同上，每个 modified 出一段 diff
```

drift 的范围 = `node_modules/foodmax-ai-config/` 下被 lock 的内容（`CLAUDE.md`、`.claude-plugin/`、`skills/`、`hooks/`、`commands/`、`agents/`）跟内置 `.locked.json` 的 sha256 不一致。status 永远 exit 0。

### CI 守门

```bash
npx foodmax-ai verify              # 有 drift 也 exit 0
npx foodmax-ai verify --strict     # 有 drift exit 1（init 写出来的 CI workflow 就用这条）
```

### 一键修复

```bash
npx foodmax-ai repair
```

reinstall 时尊重 `.foodmax-ai.lock.json` 里的 `packageVersion`，不会偷偷把项目从 pin 拉到 main。如果项目根没有 `.foodmax-ai.lock.json`（没跑过 init），会 fallback 到 bootstrapper main。

### 本地实验改 skill

直接改 `node_modules/foodmax-ai-config/skills/.../SKILL.md`。本地 `verify`（不带 `--strict`）会软警告，不强拦。

- 想保留 → 提 PR 到 [Codeup repo](https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init)
- 想丢 → `npx foodmax-ai repair`

---

## Feishu 凭据

Feishu MCP 启动时读 `$LARK_APP_ID` / `$LARK_APP_SECRET`。**init 不会**写这两个变量（团队公用一组 token 不安全），每人自己配。

从飞书管理员处拿、或在 [open.feishu.cn](https://open.feishu.cn) 自建应用拿，然后：

```bash
echo 'export LARK_APP_ID=cli_xxxxx' >> ~/.zshrc
echo 'export LARK_APP_SECRET=xxxxx' >> ~/.zshrc
# 然后重启 Claude Code，MCP 才会读到新 env
```

不设也能跑，但每次 Feishu MCP 调用都会 401。

---

## 版本安全

`versions.json`（远端真相，init/update 时从 Codeup 拉）可以把某个版本标记成：

| severity | 显示 | 行为 |
|---|---|---|
| `warn`（默认）| `⚠️  DEPRECATED: vX.Y.Z — <reason>. Fixed in vA.B.C.` | 命令照常执行 |
| `block` | 同上 + 抛错 `vX.Y.Z is BLOCKED: ...` | **只对 `init` / `update` 硬拦**，要求 `update --version <fixedIn>` |

注意：

- **只有 `init` 和 `update` 真硬拦**。`status` / `verify` / `repair` / `lock` 启动时会跑一个 fire-and-forget banner 检查（2 秒 timeout，要求 `.foodmax-ai.lock.json` 存在），**不会**因为 BLOCKED 中断执行。
- **没有 bypass 机制** — 没有 env var、没有 `--force-deprecated`。绕过 BLOCKED 的唯一办法是 `--version <非 blocked 版本>` 或 `--channel <其他>`。
- 漏洞请通过 [SECURITY.md](SECURITY.md) 私下报告，**不要**发 public issue。

---

## Troubleshooting

| 现象 | 解 |
|---|---|
| `npm install ... .git` / `npx ... init` 卡住、`ETIMEDOUT` | Codeup auth 没就绪 — 任选其一：<br>① 浏览器登录一次 Codeup（macOS 会写到 keychain）<br>② 带 PAT：`https://<user>:<token>@bgs2026-ap-southeast-1.devops.alibabacloudcs.com/...`<br>③ 换 SSH URL：`git+ssh://bgs2026@bgs2026-ap-southeast-1.devops.alibabacloudcs.com:codeup/kos/dev-tools/foodmax-ai-config-init.git#v0.2.1` |
| `claude: command not found` | 装 [Claude Code](https://claude.com/claude-code) |
| `Installed package not found at .../node_modules/foodmax-ai-config even after \`npm install...\`` | init 已经尝试自动安装但失败，多半是 Codeup auth 没就绪 — 跑 `git ls-remote <url>` 验证你能 clone，然后重跑 init |
| `Claude Code X.Y.Z does not satisfy required range >=1.0.0` | 升级 Claude Code |
| `Node 18+ required` | `nvm install 18` 或 `asdf` 切到 18+ |
| `verify --strict` 在 CI exit 1 | 本地跑 `npx foodmax-ai status --diff` 看 drift；恢复用 `repair` |
| Feishu MCP 全 401 | `echo $LARK_APP_ID` 是不是空；写 `~/.zshrc` 后**重启** Claude Code |
| `lark-cli: command not found` 但 init 报已装 | `source ~/.zshrc` 或开新 terminal |
| `MCP "X" already registered` 警告 | 本地已有同名 MCP；想换成团队版用 `update --force-mcp` |
| `v... is BLOCKED` 报错 | 装的版本被维护者禁用；`update --version <fixedIn>` |
| `pnpm lock` 在 pre-release 失败 | 本地跑 `pnpm lock`，commit `.locked.json` |

---

## 给维护者

### 加新 skill

```bash
mkdir -p skills/foodmax-new-thing
# 写 skills/foodmax-new-thing/SKILL.md（frontmatter 至少需 name + description）
pnpm lock                                    # 重算 .locked.json
git checkout -b feat/new-thing
git add skills/ .locked.json
git commit -m "feat(skills): add foodmax-new-thing"
pnpm changeset                               # 选 minor + 一行人话描述
git add .changeset/ && git commit -m "chore: add changeset"
git push origin feat/new-thing
# 在 Codeup 上提 PR
```

### Commit / push 约束

- **`.husky/commit-msg`** 跑 commitlint：只允许 `feat | fix | docs | chore | refactor | test | perf | build | ci`，header ≤ 100 char。`subject-case` 和 `subject-full-stop` 已关（允许中文标点和专有名词）。
- **`.husky/pre-push`** 强制：非-`main` 分支的 push 必须在 commit range 里包含 `.changeset/*.md`（不算 `README.md`），除非 commit message 含 `[skip-changeset]`（仅限纯 docs / test / ci 改动）。

### Cut a release

完整流程 + 漏洞响应 + rollback 见 [RELEASING.md](RELEASING.md)。简版：

```bash
pnpm pre-release           # 6 个 gate：working-tree + typecheck + test + build + lockfile + audit
pnpm version-packages      # 跑 changeset version → bump package.json + marketplace.json + CHANGELOG → commit + push main
pnpm release               # git tag vX.Y.Z + push tag + 更新 versions.json channels.latest + commit + push main
```

注意：

- **不发布到任何 npm registry** — release 只打 git tag + 更新 versions.json，分发完全靠 Codeup git URL。
- `pnpm version-packages` 顺带同步 `.claude-plugin/marketplace.json` 里的 `plugins[0].version`。
- **Release 目前完全手动** — Codeup Flow CI 还没接入，所有自动化脚本本身都跑得通，只缺 trigger。

### 改了 MCP 注册参数

changeset 描述里点明，release 后在团队飞书群发：

> ⚠️ 本次升级修改了 MCP 注册参数，请用 `npx foodmax-ai update --force-mcp` 升级。

### 标记一个 release 为有问题

往 `versions.json` 的 `deprecated[]` 加一条：

```json
{
  "version": "0.2.0",
  "reason": "MCP secret 在日志里泄漏",
  "fixedIn": "0.2.1",
  "deprecatedAt": "2026-05-26T00:00:00Z",
  "severity": "block"
}
```

- 不写 `severity` 或 `"warn"` → 用户看到 ⚠ 但命令继续执行
- `"block"` → `init` / `update` 直接抛错；用户必须 `update --version <fixedIn>`

---

## v1 不做的事

明确不支持，是设计边界、不是优先级问题：

- Cursor / Codex 集成
- 数字签名 / GPG（信任边界是 Codeup repo ACL + lockfile sha256）
- Windows
- Web UI
- 公共 / 私有 npm registry 适配（只走 Codeup git URL）

---

## 反馈与贡献

| 类型 | 渠道 |
|---|---|
| 用法问题 / Bug | 飞书 @epingpong 或团队群 at |
| 漏洞 | [SECURITY.md](SECURITY.md) — **不要发 public issue** |
| 加新 skill / 改进 | 提 PR 到 [Codeup repo](https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init) |
