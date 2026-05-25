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
npx -y github:foodmax/ai-config-init init
```

它会：
1. 把团队 CLAUDE.md 规则区块插入项目的 `CLAUDE.md`
2. 把 `foodmax-ai-config` 加进 `package.json` 的 devDependencies
3. 把 `.claude/settings.local.json` 加进 `.gitignore`
4. 在 `.github/workflows/` 写一个 verify workflow
5. 安装 Claude Code plugin 到 `~/.claude/`（让 skills/hooks 全局可用）
6. 写一个 `.foodmax-ai.lock.json` 记录当前版本

**前置条件：** 已安装 [Claude Code](https://claude.com/claude-code)、Node 18+、本机 git 有访问 `foodmax/ai-config-init` 私有 repo 的权限（SSH key 或 `gh auth login`）。

### 重启 Claude Code

让 plugin 生效。

### 团队 skill 使用

- 写 PR 描述：`/foodmax-pr-description`
- 创建新模块脚手架：`/foodmax-new-module`

### 同步最新规则

```bash
npx foodmax-ai update
```

### 在 CI 里守门

`init` 已经写好了 `.github/workflows/ai-config-verify.yml`。commit 进项目后，每个 PR 都会跑 `npx foodmax-ai verify --strict` —— 谁改了 node_modules/foodmax-ai-config/ 里的文件，PR 就过不去。

### 本地实验性改 skill

直接改 `node_modules/foodmax-ai-config/skills/.../SKILL.md` 就行。本地 `verify` 是软警告不挡路。

- 实验成功想保留 → 提 PR 到 foodmax/ai-config-init
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

```bash
pnpm test
pnpm lock         # 必须最新；CI 也会拦
git tag v0.2.0
git push --tags
```

团队成员通过 commit SHA 或 tag pin：

```json
"devDependencies": { "foodmax-ai-config": "github:foodmax/ai-config-init#v0.2.0" }
```

---

## Troubleshooting

| 现象 | 解 |
|---|---|
| `claude: command not found` | 装 [Claude Code](https://claude.com/claude-code) |
| `verify` 在 CI exit 1 | 本地 `npx foodmax-ai status --diff` 看 drift |
| 第一次 init 拉不下来 repo | `gh auth login` 或检查 SSH key 是否能 clone `foodmax/ai-config-init` |
| `pnpm lock` CI 失败 | 本地跑 `pnpm lock` 并把 `.locked.json` 一起 commit |

---

## 显式不做（v1 YAGNI）

- Cursor / Codex 支持
- 数字签名 / GPG
- Windows
- Web UI
- 私有 npm registry 适配

详见 [设计文档](docs/superpowers/specs/2026-05-25-foodmax-ai-config-design.md) §14。
