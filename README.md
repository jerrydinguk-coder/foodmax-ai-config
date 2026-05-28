# foodmax-ai-config

> FoodMax 团队 AI 助手统一配置 — 既是 **Claude Code plugin**（团队 skills、hooks、CLAUDE.md），也是 **CLI 工具**（lockfile 锁版本、drift 检测、CI 守门）。

通过 npm 公开 registry 分发，**同事完全零配置一行命令安装**。

---

## 快速开始

### 前置条件

| 工具 | 版本 | 说明 |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | `>=1.0.0` | init 启动时校验，不满足直接报错 |
| Node | `>=18` | init 启动时校验 |

> 同事**不需要任何**账号配置：不需要 npm login，不需要 GitHub 账号，不需要 Codeup 权限，也不需要先 `git init`。npm 公共 registry 匿名下载、GitHub public repo 匿名拉 marketplace 都是零认证路径。

### 安装

在你的项目根目录（例如 `~/CodeBuddy/foodmax-backend/`）执行：

```bash
npx -y foodmax-ai-config@latest init
```

这一条命令做了所有事：

1. npx 临时拉 bootstrapper 跑起来
2. init 自动 `npm install --no-save foodmax-ai-config@latest` 把包装到你 `node_modules/`
3. 写全局 `~/.claude/CLAUDE.md`（团队规则，所有项目生效）+ 项目内文件（package.json / .gitignore / CI workflow / lockfile）
4. `claude plugin marketplace add https://github.com/jerrydinguk-coder/foodmax-ai-config.git#v<X.Y.Z>` 注册到 Claude（GitHub public，匿名访问）
5. `claude plugin install foodmax-ai-config@foodmax-ai-config --scope user` 装到用户级
6. 注册 Playwright MCP / Feishu MCP / 装 lark-cli（best-effort）

### init 跑完后必做 3 件事

1. **导出 Feishu 凭据到 shell rc** — 见下方「Feishu 凭据」一节。
2. **重启 Claude Code** — plugin 和 MCP 是 SessionStart 时加载；env 变了也要重启才能被 MCP 读到。
3. **commit CI workflow** — `git add .github/workflows/ai-config-verify.yml && git commit`。

---

## init 做了什么

### A. 写 1 个全局文件 + 4 个项目文件

**全局**（用户级，装一次所有项目生效，像 Claude Code 本身）：

| 路径 | 行为 | 重跑 init |
|---|---|---|
| `~/.claude/CLAUDE.md` | 在 `<!-- BEGIN/END foodmax-ai -->` 之间插入团队规则 | 覆写标记内，标记外不动（保留你已有的全局规则） |

**项目内**（当前目录）：

| 路径 | 行为 | 重跑 init |
|---|---|---|
| `package.json` | 加 `devDependencies["foodmax-ai-config"] = "^X.Y.Z"`（npm semver caret 范围） | 已有该 key 则不动 |
| `.gitignore` | 追加 `.claude/settings.local.json` | 已有该行则跳过 |
| `.github/workflows/ai-config-verify.yml` | 写入 GitHub Actions CI 工作流 | 文件已存在则跳过 |
| `.foodmax-ai.lock.json` | 记录 `packageVersion` + `packageRootHash` + `initializedAt` + `channel`（npm dist-tag）| 每次重写 |

### B. 注册 foodmax-ai-config plugin 到 Claude Code

```
claude plugin marketplace add https://github.com/jerrydinguk-coder/foodmax-ai-config.git#v<X.Y.Z>
claude plugin install foodmax-ai-config@foodmax-ai-config --scope user
```

`<X.Y.Z>` 是 init 时刚装到 `node_modules/foodmax-ai-config/` 的实际版本（保证 plugin 内容 = npm 包内容 = GitHub tag 内容）。失败只打 ⚠ 警告，不会中断 init。

### C. 全局 4 项 best-effort 集成

每项失败都只打 ⚠ 警告，不会中断 init。

| 集成 | 命令 | 已装时 |
|---|---|---|
| superpowers plugin | `claude plugin install superpowers@superpowers-dev --scope user` | 不检测，直接重跑（Claude 自己去重）|
| Playwright MCP | `npm install -g @playwright/mcp@latest` + `claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest` | npm install **总是**重跑；claude mcp add 在 `claude mcp list` 已有 `playwright` 时跳过 |
| Feishu MCP | `npm install -g @larksuiteoapi/lark-mcp@latest` + `claude mcp add feishu --scope user -- sh -c '...lark-mcp...'` | npm install **总是**重跑；claude mcp add 在 `claude mcp list` 已有 `feishu` 时跳过 |
| `@larksuite/cli` | `npm install -g @larksuite/cli` | `which lark-cli` 看到则跳过 |

> 两个 MCP 的 `npm install -g` 即使 Claude 已注册也会重跑 — 目的是保证全局 node_modules 有这个包，让 Claude 第一次 spawn MCP 即时启动、离线可用。
>
> 被跳过的 claude mcp 注册如果是别人的版本而不是团队版（命令行参数不同），跑 `npx foodmax-ai update --force-mcp` 强制重装。

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
| `--yes` | 跳过交互式确认（v1.0.3 起 init 没有交互 prompt，本 flag 保留向后兼容，是 no-op）|
| `--version <semver>` | pin 到具体版本（如 `1.0.0`），与 `--tag` 互斥 |
| `--tag <name>` | 选 npm dist-tag（默认 `latest`），与 `--version` 互斥 |

---

## 日常操作

### 同步最新

```bash
npx foodmax-ai update                # 拉 latest dist-tag
npx foodmax-ai update --version 1.0.0  # pin 到具体版本
npx foodmax-ai update --tag beta     # 切到 beta dist-tag
npx foodmax-ai update --force-mcp    # 维护者通知 MCP 注册参数变了时用
```

update 会：从 npm 重装包 → 刷 plugin marketplace（按新版本号同步 GitHub tag）→ 重跑 4 项集成 → 重写 `.foodmax-ai.lock.json`。
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

reinstall 时尊重 `.foodmax-ai.lock.json` 里的 `packageVersion`（用 `foodmax-ai-config@<pinned-version>` 作 npm spec），不会偷偷把项目从 pin 拉到 latest。如果项目根没有 `.foodmax-ai.lock.json`（没跑过 init），会 fallback 到 `foodmax-ai-config@latest`。

### 本地实验改 skill

直接改 `node_modules/foodmax-ai-config/skills/.../SKILL.md`。本地 `verify`（不带 `--strict`）会软警告，不强拦。

- 想保留 → 提 PR 到 [GitHub repo](https://github.com/jerrydinguk-coder/foodmax-ai-config)
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

## 版本管理

| 机制 | 来源 | 怎么用 |
|---|---|---|
| **npm dist-tags**（channels）| npm registry 原生 | `npx foodmax-ai update --tag latest` / `--tag beta` |
| **npm deprecate**（warn）| `npm deprecate foodmax-ai-config@X.Y.Z "<reason>"` | 同事跑 `npm install` 时 npm 自动打 warning |
| **`.locked.json` sha256**（drift detection）| 包内构建产物 | `npx foodmax-ai verify` 检查 |
| **`.foodmax-ai.lock.json`**（项目 pin）| init/update 写 | `npx foodmax-ai repair` 按这里的 packageVersion 重装 |

> v1 没有"硬 block"机制 — 如果某个版本必须禁用，用 `npm deprecate` 打 warning + 飞书群通知。npm 不支持强制阻止 install，但 `npm deprecate` 的 warning 在 install 输出里很显眼。

---

## Troubleshooting

| 现象 | 解 |
|---|---|
| `npx foodmax-ai-config@latest init` 卡住、`ETIMEDOUT` 或 `ENOTFOUND registry.npmjs.org` | 你的网络访问不了 npm 公共 registry — 切到团队内网镜像（`npm config set registry https://...`）或检查 VPN / 代理 |
| `claude: command not found` | 装 [Claude Code](https://claude.com/claude-code) |
| `Installed package not found at .../node_modules/foodmax-ai-config even after \`npm install\`` | init 已经尝试自动安装但失败 — 跑 `npm install --no-save foodmax-ai-config@latest` 看具体错误 |
| `Claude Code X.Y.Z does not satisfy required range >=1.0.0` | 升级 Claude Code（`claude update` 或重装）|
| `Node 18+ required` | `nvm install 18` 或 `asdf` 切到 18+ |
| `verify --strict` 在 CI exit 1 | 本地跑 `npx foodmax-ai status --diff` 看 drift；恢复用 `repair` |
| Feishu MCP 全 401 | `echo $LARK_APP_ID` 是不是空；写 `~/.zshrc` 后**重启** Claude Code |
| `lark-cli: command not found` 但 init 报已装 | `source ~/.zshrc` 或开新 terminal |
| `MCP "X" already registered` 警告 | 本地已有同名 MCP；想换成团队版用 `update --force-mcp` |
| `claude plugin marketplace add` 失败访问 GitHub | 你的网络访问不了 github.com — 检查 VPN / 代理。GitHub mirror 是 marketplace 入口（不是 npm 包内容来源）|
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

### 一次性 setup（已完成，新维护者接手时参考）

1. **建 GitHub public repo** `jerrydinguk-coder/foodmax-ai-config`（empty，不要 init README/license/.gitignore）。
2. **加 github remote 到本地** Codeup repo（HTTPS 走 macOS Keychain 缓存，比 SSH 少踩坑）：
   ```bash
   git remote add github https://github.com/jerrydinguk-coder/foodmax-ai-config.git
   git push -u github main
   git push github --tags
   ```
3. **npm 账号**：`npm login`（用你的 npm 账号；包名 `foodmax-ai-config` 归在你 npm 账号下）。
4. **2FA + granular token**：npm 现在强制 publish 走 2FA，要让 `pnpm release` 的 `npm publish` 非交互成功：
   - 在 npm 网页开 2FA（Authenticator app / Security key / Passkey 任一都行，过程中遇到 macOS Passkey 弹窗别取消、跟着走完）
   - 创建 **Granular Access Token** at `https://www.npmjs.com/settings/<your-username>/tokens/new`：选 "Read and write" + 勾 **"Bypass 2FA when publishing"** + 选 `foodmax-ai-config`（或 "All packages"）
   - 把 token 写入 `~/.npmrc`：
     ```bash
     echo "//registry.npmjs.org/:_authToken=npm_xxxxx" >> ~/.npmrc
     ```

### Plugin 内部结构（v1.0.1+ 必须遵守）

Claude Code 对 plugin 文件结构有 schema 校验，乱写会让 `claude plugin install` 报 `source type not supported`：

- `.claude-plugin/marketplace.json` — marketplace 元数据。**不要**在这里写 `hooks` / `skills` 这些 plugin-level 字段。plugin entry 的 `source` 必须是 `"./"`（注意尾部斜杠，不是 `"."`）。
- `plugin.json`（包根）— plugin manifest。声明 `name` / `version` / `skills: "./skills/"` / `hooks: "./hooks/hooks.json"`。
- `hooks/hooks.json` — 实际 hook 命令。schema 是 `{ "hooks": { "<EventName>": [{ "matcher": "...", "hooks": [{ "type": "command", "command": "...", "async": ... }] }] } }`。command 里用 `${CLAUDE_PLUGIN_ROOT}` 引用 plugin 根。
- skills 内容在 `skills/` 目录，自动被 plugin manifest 引用。

### Cut a release

```bash
pnpm pre-release           # 7 个 gate：working-tree + typecheck + test + build + lockfile + audit + npm-login
pnpm version-packages      # 跑 changeset version → bump package.json + marketplace.json + plugin.json + CHANGELOG → commit + push main
pnpm release               # git tag vX.Y.Z + push tag 到 origin (Codeup) + push main+tag 到 github + npm publish
```

注意：

- **npm publish 是不可逆的**（72 小时窗口内能 unpublish，但会留下"卡位"防止重发同版本号）— pre-release 7 个 gate 是为这个不可逆操作准备的。
- `pnpm version-packages` 同步**三个**版本号到一致：`package.json` + `.claude-plugin/marketplace.json`（plugins[0].version）+ `plugin.json`（Claude 从这里读 "Version" 显示）。任何一个 stale 都会让 `claude plugin list` 显示错版本号。
- **如果 `pnpm release` 在 `npm publish` 步报 403**：`~/.npmrc` 里的 granular token 失效 / 过期 / 不带 Bypass 2FA。临时跑可用：`npm publish "--//registry.npmjs.org/:_authToken=npm_xxx"`。
- **Release 目前完全手动** — Codeup Flow CI 还没接入，所有自动化脚本本身都跑得通，只缺 trigger。

### 改了 MCP 注册参数

changeset 描述里点明，release 后在团队飞书群发：

> ⚠️ 本次升级修改了 MCP 注册参数，请用 `npx foodmax-ai update --force-mcp` 升级。

### 标记一个 release 为有问题

```bash
npm deprecate foodmax-ai-config@1.4.2 "Critical: MCP secret leak. Use 1.4.3+"
```

同事跑 `npm install` / `npx foodmax-ai-config@1.4.2 init` 时 npm 会打 warning：
```
npm WARN deprecated foodmax-ai-config@1.4.2: Critical: MCP secret leak. Use 1.4.3+
```

`npm deprecate` 不能阻止 install（npm 没这能力），但 warning 在 install 输出里很显眼。配合飞书群通知，足够覆盖 v1 安全响应需求。

---

## v1 不做的事

明确不支持，是设计边界、不是优先级问题：

- Cursor / Codex 集成
- 数字签名 / GPG（信任边界是 npm publish ownership + GitHub mirror tag + lockfile sha256）
- Windows
- Web UI
- 私有 npm registry（强制走 registry.npmjs.org 公共 registry — 同事如有镜像可自行 `npm config set registry`，但 release 写死 public 发布）

---

## 反馈与贡献

| 类型 | 渠道 |
|---|---|
| 用法问题 / Bug | 飞书 @epingpong 或团队群 at |
| 漏洞 | [SECURITY.md](SECURITY.md) — **不要发 public issue** |
| 加新 skill / 改进 | 提 PR 到 [GitHub repo](https://github.com/jerrydinguk-coder/foodmax-ai-config)（或 Codeup repo，两边都接）|
