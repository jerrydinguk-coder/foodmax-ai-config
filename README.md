# foodmax-ai-config

> FoodMax 团队统一的 AI 助手配置（Claude Code plugin + npm CLI）

一个 git 仓库，既是 Claude Code plugin、也是 npm 包：

- **Plugin 形态**：team skills、hooks、CLAUDE.md 通过 `claude plugin install` 落到每个工程师本地
- **npm 形态**：`npx foodmax-ai` CLI 提供 init / verify / status / repair / update，让项目级配置可锁版本、可在 CI 守门

---

## 给团队成员（90% 读者）

### 第一次设置

在你的 FoodMax 项目根目录（例如 `~/CodeBuddy/foodmax-backend/`）下跑：

```bash
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init
```

它会：
1. 把团队 CLAUDE.md 规则区块插入项目的 `CLAUDE.md`
2. 把 `foodmax-ai-config` 加进 `package.json` 的 devDependencies
3. 把 `.claude/settings.local.json` 加进 `.gitignore`
4. 在 `.github/workflows/` 写一个 verify workflow
5. 安装 Claude Code plugin 到 `~/.claude/`（让 skills/hooks 全局可用）
6. 写一个 `.foodmax-ai.lock.json` 记录当前版本
7. 自动装 4 个团队默认集成（见下方"`init` installs what?"）

**前置条件：** 已安装 [Claude Code](https://claude.com/claude-code) `>=1.0.0`、Node 18+、本机 git 有访问 Codeup `kos/dev-tools/foodmax-ai-config-init` 私有 repo 的权限（公司 SSO 或 git credential helper）。Claude Code 版本不达标 `init` 会直接报错。

### 装特定版本 / channel

```bash
# 装指定 release tag
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init --version 1.2.3

# 装 beta channel（尝鲜）
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init --channel beta
```

可用 channel 在 [versions.json](versions.json) 里查（`latest`、`beta` 等）。`--version` 和 `--channel` 互斥。两者都不传 = 默认 `latest`。同样的 flag 也适用于 `update` 命令。

### `init` installs what?

除了 `foodmax-ai-config` plugin 本身，`init` 还会自动落 4 个生产力集成（已注册的会跳过，不会重复装）：

| 集成 | 装什么 | 怎么落 |
|---|---|---|
| superpowers plugin | obra/superpowers — TDD / brainstorming / parallel-agents 等元 skill | `claude plugin install superpowers@superpowers-dev --scope user` |
| Playwright MCP | 让 Claude 能开浏览器自动化 | `claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest` |
| Feishu MCP | 飞书机器人 / 多维表格 / 消息 API | `claude mcp add feishu --scope user -- sh -c '…lark-mcp…'`（用环境变量读 token） |
| `@larksuite/cli` | `lark-cli` 命令行（机器人调试、登录、推消息） | 检测到没装就 `npm install -g @larksuite/cli` |

**这些集成是 best-effort：** 任何一个失败不会让 `init` 整体退出，只会打 `⚠` 警告。如果你想后悔某个，手动 `claude plugin remove <name>` / `claude mcp remove <name>` / `npm uninstall -g @larksuite/cli` 即可。

### Setup Feishu credentials

Feishu MCP 在每次启动时会从你的 shell env 读 `$LARK_APP_ID` / `$LARK_APP_SECRET`。`init` **不会** 帮你写这两个变量（团队公用一组 token 不安全）。第一次 `init` 之后，从团队飞书管理员那里拿 token，或在 [open.feishu.cn](https://open.feishu.cn) 自建应用拿，然后：

```bash
# Get from team Feishu admin or your own app at open.feishu.cn
echo 'export LARK_APP_ID=cli_xxxxx' >> ~/.zshrc
echo 'export LARK_APP_SECRET=xxxxx' >> ~/.zshrc
# 重启 Claude Code 让 MCP 进程读到新 env
```

没设也没事，feishu MCP 会启动，但每次调用都会 `lark unauthorized`。

### 重启 Claude Code

让 plugin 生效。

### 团队 skill 使用

- 写 PR 描述：`/foodmax-pr-description`
- 创建新模块脚手架：`/foodmax-new-module`

### 同步最新规则

```bash
npx foodmax-ai update
```

这会：拉最新包 → 刷 Claude plugin → **重跑所有集成**（superpowers / playwright MCP / feishu MCP / lark-cli，新增的集成自动装上）→ 重写项目锁。

#### 升降级到指定版本

```bash
npx foodmax-ai update --version 1.2.3   # 强制装 1.2.3
npx foodmax-ai update --channel beta    # 切到 beta channel
```

如果你装的版本被维护者标记为 deprecated，`update` 会在 stdout 警告并给出建议升级目标（`Fixed in vX.Y.Z`）。

#### MCP 参数变了？加 `--force-mcp`

如果维护者改了某个 MCP 的注册参数（例如 `@playwright/mcp` 从 `latest` 改成 `1.0.5`），普通 `update` 看到 MCP 已注册会 skip。这时需要：

```bash
npx foodmax-ai update --force-mcp
```

它会先 `claude mcp remove` 包内管理的 MCP（playwright + feishu），再重新注册。维护者发这种变更时会在 announce 里点名要求加这个 flag。

### 在 CI 里守门

`init` 已经写好了 `.github/workflows/ai-config-verify.yml`。commit 进项目后，每个 PR 都会跑 `npx foodmax-ai verify --strict` —— 谁改了 node_modules/foodmax-ai-config/ 里的文件，PR 就过不去。

### 本地实验性改 skill

直接改 `node_modules/foodmax-ai-config/skills/.../SKILL.md` 就行。本地 `verify` 是软警告不挡路。

- 实验成功想保留 → 提 PR 到 Codeup `kos/dev-tools/foodmax-ai-config-init`
- 想放弃 → `npx foodmax-ai repair`

---

## 给维护者（5% 读者）

### 加新 skill

```bash
# 1. 写
mkdir skills/foodmax-new-thing
cat > skills/foodmax-new-thing/SKILL.md <<'EOF'
---
name: foodmax-new-thing
description: ...
---
# Foodmax New Thing
...
EOF

# 2. 重算锁
pnpm lock

# 3. 提 PR
git add skills/ .locked.json
git commit -m "skills: add foodmax-new-thing"
git push origin feat/new-thing
```

### Release

我们用 [changesets](https://github.com/changesets/changesets) 管理版本和 CHANGELOG。日常 PR 流程：

```bash
# 写代码、测试，然后：
pnpm changeset                  # 选 patch/minor/major + 写一行人类可读描述
git add . && git commit -m "feat: ..." && git push
```

`pre-push` hook 会拦没 changeset 的 PR（除非 commit message 有 `[skip-changeset]`）。

PR merge 到 main 后，维护者本地跑：

```bash
pnpm version-packages    # 累积 changesets → bump version + 写 CHANGELOG
pnpm release             # tag + push + 更新 versions.json
```

⚠️ Sprint 2 当前 release 是手动的（Codeup 仓库不自动识别 CI 文件，等管理员接入云效 Flow 才能自动化）。详见 [RELEASING.md](RELEASING.md)。

团队成员通过 tag pin（自动获得最新可用版本）：

```json
"devDependencies": { "foodmax-ai-config": "https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git#v0.2.0" }
```

或者用 `npx foodmax-ai update --version 0.2.0` / `--channel beta`（Sprint 1 引入的 flag）。

### 改了 MCP 注册参数时

如果 changeset 里包含 `## MCP 参数变更` section，CHANGELOG 会被特殊渲染提醒同事。同时在飞书群点名：

> ⚠️ 本次升级修改了 MCP 注册参数，请用 `npx foodmax-ai update --force-mcp` 升级。

（Sprint 2 当前 changesets 默认 changelog generator 还不会自动加这段警告；维护者 release 后须手动核对一次 CHANGELOG.md 的相关条目。Sprint 3 计划接入 custom generator 自动化此事。）

---

## Troubleshooting

| 现象 | 解 |
|---|---|
| `claude: command not found` | 装 [Claude Code](https://claude.com/claude-code) |
| `verify` 在 CI exit 1 | 本地 `npx foodmax-ai status --diff` 看 drift |
| 第一次 init 拉不下来 repo | 检查 git credential helper 或 SSO，能否 clone `https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git` |
| `pnpm lock` CI 失败 | 本地跑 `pnpm lock` 并把 `.locked.json` 一起 commit |
| feishu MCP 所有调用 401 | `echo $LARK_APP_ID` 看是不是空；写到 `~/.zshrc` 后**重启** Claude Code |
| `lark-cli: command not found` 但 `init` 报 installed | 新装的 npm global bin 还没 source；开新 terminal 或 `source ~/.zshrc` |
| `init`/`update` 输出 `MCP "X" already registered` 的 warning | 你本地已有同名 MCP，团队规范的注册参数没贴上。`claude mcp list` 确认；想替换成团队版跑 `npx foodmax-ai update --force-mcp` |

---

## 显式不做（v1 YAGNI）

- Cursor / Codex 支持
- 数字签名 / GPG
- Windows
- Web UI
- 私有 npm registry 适配

详见 [设计文档](docs/superpowers/specs/2026-05-25-foodmax-ai-config-design.md) §14。
