# foodmax-ai-config 版本管理生产化升级 — 设计文档

> **状态**：草案，待 review
> **日期**：2026-05-26
> **作者**：epingpong（with Claude Opus 4.7）
> **scope 预估**：4 个 sprint，约 12–16 人天
> **前置文档**：[v1 总体设计](./2026-05-25-foodmax-ai-config-design.md)

---

## 1. Executive Summary

`foodmax-ai-config-init` v1 上线后，发现版本管理停留在 "git URL + sha256 自校验" 的中级水准——能防本地篡改、能 CI 守门，但**缺少一个生产级内部工具应有的版本语义、发布自动化、安全可信、和网络韧性**。

本 spec 把版本管理升级到 **"内部专业工具级"**，对标 LinkedIn/Stripe 等公司内部 dev tooling 标准。具体落地 4 个 sprint：

| Sprint | 主题 | 解决的核心问题 | 工期 |
|---|---|---|---|
| S1 | 版本语义 | 同事能 `--version 1.2.3` / `--channel beta`；启动检测 Claude Code 版本 | 3-4 天 |
| S2 | 发布自动化 | 维护者 merge PR → 自动 bump + tag + CHANGELOG | 3-4 天 |
| S3 | 安全 & 可信 | tag 签名 + 弃用机制 + Dependabot + SECURITY.md | 3-4 天 |
| S4 | 韧性 & E2E | 网络 retry + 国内 mirror + 真实安装 E2E 测试 + lockfile 版本迁移 | 3-4 天 |

**最终交付的同事侧体验**：

```bash
npx foodmax-ai init --channel latest          # 默认 channel
npx foodmax-ai init --version 1.2.3           # pin 版本
npx foodmax-ai update --version 1.3.0         # 升降级
npx foodmax-ai update --channel beta          # 切 channel
npx foodmax-ai status                         # 报告 deprecated/EOL 警告
```

**维护者侧体验**：

```bash
# 提 PR 时
pnpm changeset                                # 描述本次变更（patch/minor/major）

# Merge 后 CI 自动
# → 累积 changesets → bump version → 生成 CHANGELOG.md → git tag v1.2.3 → push tag → 签名
```

---

## 2. Problem Statement

### 2.1 v1 现状的 17 个 gap（基于 audit）

按优先级分三档：

**P0 — 阻塞生产化（6 项）**
1. init/update 没有 `--version` / `--channel` flag，硬编码追 main
2. 没有 dist-tag / channel 概念
3. 没有 Claude Code 最低版本声明，运行时崩需要事故排查
4. 没有 release 自动化、没有 CHANGELOG，维护者纯手动
5. 没有 yank/deprecation 机制，已装的同事看不到坏版本警告
6. 没有 tag 签名，恶意 commit 能同步改 `.locked.json` 绕过校验

**P1 — 体验和可观测性（5 项）**
7. verify 只检查 `node_modules/foodmax-ai-config/`，不验 `~/.claude/plugins/` 也不验 MCP 注册参数
8. repair 不支持回滚到上一版
9. MCP/plugin drift 主动检测缺失
10. 无 telemetry，不知道实际采用率和失败热点
11. 网络韧性差：120s 单次超时，无 retry，无 mirror，无 cache

**P2 — 工程化（6 项）**
12. 无 E2E 测试，全部 mock exec
13. 无 Dependabot + SECURITY.md
14. lockfile `version: 1` 硬编码，v2 出来旧客户端会 crash
15. 无 self-release workflow（只有 test.yml）
16. 无 SBOM（依赖物料清单）
17. release notes 没有载体（README 说要在 release notes 提示 `--force-mcp`，但根本没 release notes）

### 2.2 "内部专业工具级" 的标准

| 维度 | 标准 |
|---|---|
| 版本选择 | `pkg@1.2.3` / `@latest` / `@beta` 至少这三种 channel |
| 锁定 | per-file sha256 + tree-root，verify 端到端 |
| Release | 维护者 0 手动步骤，commit → CI → tag → CHANGELOG |
| 签名 | tag 由可验证身份签名（不强制 SLSA L3）|
| 弃用 | 已安装侧能收到结构化警告 |
| 韧性 | 国内开发者无需 VPN，自动 fallback mirror |
| 可观测 | 至少 error reporting（telemetry 二期）|
| 兼容性 | engines + 运行时版本检测 |
| 文档 | CHANGELOG + RELEASING.md + MIGRATION.md |

**显式排除（不做到的事）**：

- SLSA L3 hardened build（要求隔离 builder + provenance verification，重资源）
- 内部 npm registry（基础设施重，git URL + lockfile 已足够）
- 公开 npm publish（私有团队工具，不需要）
- Web UI / 仪表盘（CLI 足够）
- 100% 自动化遥测（隐私 & 法务还没准备好，先 opt-in，二期再观察是否扩展）

---

## 3. Goals / Non-Goals

### Goals

| ID | 目标 | 验收 |
|---|---|---|
| G1 | 同事可 pin 特定版本或 channel | `npx foodmax-ai init --version 1.2.3` 和 `--channel beta` 都工作 |
| G2 | Claude Code 版本不兼容时**安装前**拦截 | 老 Claude Code 装新 foodmax-ai 立即报错，给出最低版本要求 |
| G3 | 维护者 release 零手动步骤 | merge PR 到 main → CI 自动 tag + CHANGELOG + 签名 |
| G4 | 已装坏版本能收到警告 | `update` 和 CLI 任何命令启动时检测到 deprecated 立即警告 |
| G5 | Tag 可验证身份 | `git tag -v vX.Y.Z` 成功；CI 拒绝未签名 tag |
| G6 | 国内开发者无需 VPN | 在没有 VPN 的网络环境下 `init` 和 `update` 都能成功 |
| G7 | E2E 验证 release 真能装上 | CI 每次 release 后跑真实 `npm install` 安装到干净容器 |
| G8 | lockfile 格式可演进 | 旧客户端遇到新 lockfile 格式给出明确升级提示而非 crash |

### Non-Goals

| ID | 不做 | 原因 |
|---|---|---|
| NG1 | 公开 npm publish | 私有团队工具，git URL + lockfile 足够 |
| NG2 | 内部 npm registry (verdaccio/nexus) | 基础设施重，团队规模不需要 |
| NG3 | SLSA L3 / hardened build | 内部信任模型可以接受 L2 等级 |
| NG4 | Web 仪表盘 / GUI | CLI 足够 |
| NG5 | 全自动 telemetry | 隐私&法务先行，v1 只做 opt-in 错误上报，二期再扩展 |
| NG6 | Cursor / Codex 适配 | 同 v1 spec NG1 |
| NG7 | Windows 适配 | 同 v1 spec |

---

## 4. Decisions Log

| # | 决策点 | 选定方案 | 排除项 + 原因 |
|---|---|---|---|
| **D1** | **Channel / dist-tag 实现** | `versions.json` 元数据文件（仓库根目录） | git branch (latest/beta)：rebase 复杂、git branch 不是为发版设计 |
| **D2** | **签名方案** | Codeup CI 机器人 GPG key + 公钥分发到 verify 命令内嵌 | sigstore keyless：依赖外网 rekor；个人 GPG：密钥管理重 |
| **D3** | **Release 自动化工具** | [changesets](https://github.com/changesets/changesets) | semantic-release：纯 commit message 驱动，commit 不规范就崩；release-please：GitHub-specific |
| **D4** | **Conventional commits** | 强制 commitlint hook，但 CHANGELOG 由 changeset 文件生成（不是从 commit message 推） | 纯 conventional commits：commit message 描述 ≠ 用户面 changelog 描述 |
| **D5** | **Deprecation 触达** | `versions.json["deprecated"]` 字段 + CLI 启动时 check + release notes 标注 | 仅 release notes：被动；强制 update：太重 |
| **D6** | **网络 mirror** | 探测 `registry.npmjs.org` RTT，>1s 自动 fallback `npmmirror.com`；git clone 同理 fallback Codeup mirror | 硬编码 mirror：海外同事被坑；用户手动配：违反"零配置" |
| **D7** | **E2E 测试 runner** | GitHub Actions container job，每次 tag 推送后跑真实 `npm install <tagged-url>` + `init --dry-run` | docker-compose 本地：维护成本高；不做：违反 G7 |
| **D8** | **Lockfile 版本演进策略** | `version` 字段 semver + `readLockfile` 检测 minor 差异升级、major 差异拒绝并提示 `npx foodmax-ai migrate-lock` | 不做：v2 出来旧客户端 crash；强制重建：丢失项目历史 |
| **D9** | **Telemetry (v1)** | 仅错误上报：`init`/`update` 失败时 POST 到 Codeup webhook（含版本、OS、Node 版本、stack trace），opt-out via env var | 全量遥测：隐私法务问题；不做：失败热点全靠群里反馈 |
| **D10** | **Claude Code 版本检测** | `claude --version` 解析 semver，对比 `package.json["peerDependencies"]["@anthropic-ai/claude-code"]` 范围；不满足 init 失败 | 不检测：运行时崩 |
| **D11** | **CHANGELOG 格式** | [Keep a Changelog](https://keepachangelog.com/) 中文版 + `### MCP 参数变更` 专属 section（触发同事跑 `--force-mcp`）| 自由格式：同事漏看 force-mcp 提示 |
| **D12** | **Migration guide** | major 版本必须附 `docs/migrations/v1-to-v2.md`；CLI `update` 跨 major 时强制打印迁移指南 URL | 不要求：同事跨 major 直接踩坑 |

---

## 5. Architecture

### 5.1 版本元数据架构：`versions.json`

仓库根新增 `versions.json`，由 CI 维护（changesets 自动生成）：

```json
{
  "schemaVersion": 1,
  "channels": {
    "latest": {
      "version": "1.2.3",
      "tag": "v1.2.3",
      "publishedAt": "2026-05-26T10:00:00Z",
      "notes": "https://...git/-/tags/v1.2.3"
    },
    "beta": {
      "version": "1.3.0-rc.1",
      "tag": "v1.3.0-rc.1",
      "publishedAt": "2026-05-25T10:00:00Z"
    },
    "lts": {
      "version": "1.0.5",
      "tag": "v1.0.5",
      "publishedAt": "2026-04-15T10:00:00Z"
    }
  },
  "deprecated": [
    {
      "version": "1.1.0",
      "reason": "MCP 注册参数 bug，请升级到 1.1.1",
      "fixedIn": "1.1.1",
      "deprecatedAt": "2026-05-10T10:00:00Z"
    }
  ],
  "minSupportedVersion": "1.0.0",
  "peerRequirements": {
    "claudeCode": ">=1.0.0",
    "node": ">=18"
  }
}
```

**为什么独立文件而非 git tag metadata**：
- Git tag annotation 不结构化，CLI 解析麻烦
- `versions.json` 一次 fetch（HTTP GET raw URL）即可拿到所有 channel + deprecated 列表
- 可以独立于 release 更新（例如紧急 deprecate 一个版本无需新 release）

### 5.2 安装路径升级

```
                            user 输入
                                │
        ┌───────────────────────┼─────────────────────────┐
        │                       │                         │
   --version 1.2.3        --channel beta              (默认)
        │                       │                         │
        ▼                       ▼                         ▼
   直接用                  fetch versions.json     fetch versions.json
   tag=v1.2.3              ["channels"]["beta"]    ["channels"]["latest"]
        │                  ["tag"]                 ["tag"]
        │                       │                         │
        └───────────────────────┼─────────────────────────┘
                                │
                       检查 deprecated 列表
                                │
                       检查 peerRequirements
                       (claude-code, node)
                                │
                          ┌─────┴─────┐
                          │           │
                       通过        不通过 → 报错退出
                          │
                          ▼
                  npm install <repo>#<tag>
                  (with retry + mirror fallback)
                          │
                          ▼
                  verify lockfile (sha256)
                          │
                          ▼
                  verify tag 签名 (GPG)
                          │
                          ▼
                  写 .foodmax-ai.lock.json
                  (记录 version + tag + channel)
                          │
                          ▼
                  run integrations
```

### 5.3 Release Pipeline

```
              维护者                       Codeup CI
                │                              │
   提 PR 带 .changeset/*.md                    │
                ├─────────────────────────────►│ test.yml
                │                              │ - pnpm test
                │                              │ - pnpm typecheck
                │                              │ - lockfile up-to-date check
                │                              │
   review & merge to main                      │
                ├─────────────────────────────►│ changesets-action
                │                              │ - 累积所有 .changeset/*.md
                │                              │ - bump package.json version
                │                              │ - 生成/更新 CHANGELOG.md
                │                              │ - 更新 versions.json["channels"]["latest"]
                │                              │ - 提 "Version Packages" PR
                │                              │
   review & merge "Version Packages" PR        │
                ├─────────────────────────────►│ release.yml
                │                              │ - git tag vX.Y.Z
                │                              │ - GPG sign tag (CI bot key)
                │                              │ - git push --tags
                │                              │ - 触发 e2e.yml
                │                              │
                │                              │ e2e.yml
                │                              │ - docker run ubuntu:22.04
                │                              │ - npx -y <git-url>#vX.Y.Z init --dry-run
                │                              │ - 成功 → release 标记 stable
                │                              │ - 失败 → 自动 rollback
                │                              │   (versions.json 回退、tag 不删)
                │                              │
   `pnpm changeset:beta` 切 beta channel       │
                ├─────────────────────────────►│ release-beta.yml
                                               │ (类似但写入 beta channel)
```

### 5.4 信任链：签名 + verify

```
            CI bot GPG keypair
            (private key in Codeup CI secret)
                      │
                      ▼ 签 release tag
            git tag -s vX.Y.Z
                      │
                      ▼
            tag 上有 GPG signature
                      │
                      │ 公钥分发：
                      │ 1. 内嵌在 foodmax-ai CLI 二进制 (dist/keys/bot-pubkey.asc)
                      │ 2. Codeup keyserver URL (fallback)
                      ▼
            同事 init/update 时
                      │
                      ▼
            git fetch tag → 用内嵌公钥 verify GPG sig
                      │
                ┌─────┴─────┐
                │           │
              通过        失败 → 拒绝安装
                │
                ▼
            继续 sha256 lockfile 校验
```

**密钥轮换**：CI bot GPG key 设 2 年过期；轮换时新增 `dist/keys/bot-pubkey-v2.asc`，CLI 支持多公钥；老 tag 用老 key 验证。

### 5.5 Lockfile 格式演进

**当前 v1 lockfile schema**：
```json
{
  "version": 1,
  "package": "foodmax-ai-config",
  "packageVersion": "0.1.0",
  "rootHash": "...",
  "tree": { "...": "..." }
}
```

**v2 提议（本 spec 实施时升级）**：
```json
{
  "schemaVersion": "2.0.0",
  "package": "foodmax-ai-config",
  "packageVersion": "1.2.3",
  "channel": "latest",
  "rootHash": "...",
  "tree": { "...": "..." },
  "tagSignature": "...(armored GPG sig)...",
  "signedAt": "2026-05-26T10:00:00Z"
}
```

**升级策略**（D8）：
- `readLockfile()` 先尝试读 `schemaVersion`（string，semver），不存在则读 `version`（number，v1 格式）
- 字段映射：v1 `version: 1` → v2 `schemaVersion: "2.0.0"`
- 同 schemaVersion major：兼容读取
- 跨 major：抛错并提示 `npx foodmax-ai migrate-lock`
- `migrate-lock` 命令：读旧 lockfile + 当前 npm install 结果 → 写新 lockfile

**字段名变更的原因**：v1 用 `version: 1` 太容易和 `packageVersion` 混淆。v2 起统一用 `schemaVersion`（semver string）。`versions.json["schemaVersion"]`（也是 number 1）是独立的另一个文件的 schema，跟 lockfile 不共享版本号。

---

## 6. Sprint 1: 版本语义（3-4 天）

### 6.1 Scope

- 新增 `versions.json`（CI 维护，但本 sprint 先手工填充）
- `init.ts`/`update.ts` 加 `--version <semver>` 和 `--channel <name>` flag
- `init.ts` 启动时 fetch `versions.json`，解析 peerRequirements，check Claude Code 版本
- `package.json` 新增 `peerDependencies.@anthropic-ai/claude-code` 字段（npm 不会自动校验它，CLI 自己读 `peerDependencies` + 运行时 `claude --version` 对比）
- 写入 `.foodmax-ai.lock.json` 时记录 channel + version 来源

### 6.2 关键设计

**Fetch versions.json 的 URL**：
```
https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init/-/raw/main/versions.json
```
（Codeup 的 raw URL 格式，需要在 spike 中确认。fallback：shallow clone）

**Claude Code 版本检测**：
```ts
// src/lib/claude-detect.ts 扩展
const out = await exec('claude', ['--version']);
const m = out.stdout.match(/(\d+\.\d+\.\d+)/);
const installed = m?.[1];
const required = peerRequirements.claudeCode;  // ">=1.0.0"
if (!semverSatisfies(installed, required)) {
  throw new Error(`Claude Code ${installed} < ${required}. 升级: ...`);
}
```

**Tests (TDD)**:
- `init --version 1.2.3` → npm install 用 `#v1.2.3`
- `init --channel beta` → fetch versions.json → 用 beta tag
- `init` 时 Claude Code 版本不满足 → 立即抛错
- `init` 时 deprecated 版本 → 警告但允许（exit 0）
- versions.json fetch 失败 → fallback shallow clone

### 6.3 验收

- `npx foodmax-ai init --version 1.2.3` 装上 v1.2.3
- `npx foodmax-ai init --channel beta` 装上 beta channel
- 老 Claude Code 拒绝安装，错误信息明确给出最低版本

---

## 7. Sprint 2: 发布自动化（3-4 天）

### 7.1 Scope

- 集成 [changesets](https://github.com/changesets/changesets)
- 新增 `.changeset/config.json`、commitlint hook
- 新增 `.github/workflows/release.yml`（如果还在用 GitHub）或 Codeup pipeline 等价物
- 写 `CHANGELOG.md`（初始版本）+ `RELEASING.md` 维护者 SOP
- CI 自动更新 `versions.json["channels"]["latest"]`

### 7.2 关键设计

**Changeset 工作流**：

```bash
# 维护者提 PR
pnpm changeset                    # 交互：bump 类型 + 改动描述
git add .changeset/xxx.md
git commit -m "feat: add foo"
git push

# Merge 到 main 后 CI:
pnpm changeset version            # 累积所有 changesets → bump + 写 CHANGELOG
git commit -am "chore: version packages"
# changesets-action 自动提"Version Packages" PR

# Merge "Version Packages" PR 后:
pnpm changeset publish            # 因为没 npm publish，这里用 custom command:
                                  # 1. git tag vX.Y.Z
                                  # 2. update versions.json
                                  # 3. push tag
```

**CHANGELOG.md 格式**（D11）：

```markdown
# CHANGELOG

## [1.2.3] - 2026-05-26

### Added
- 新 skill: foodmax-pr-review

### Changed
- 升级 Playwright MCP 到 @1.0.5

### MCP 参数变更 ⚠️
- Playwright MCP 注册参数变更，**请同事跑 `npx foodmax-ai update --force-mcp`**

### Deprecated
- (无)

### Removed
- (无)

### Fixed
- 修复 Feishu MCP env 变量在 zsh 5.0 下展开问题

### Security
- (无)
```

**Tests (TDD)**:
- `pnpm changeset version` 把 patch changeset 累积成 0.1.1
- CHANGELOG.md 包含 changeset 描述
- "MCP 参数变更" section 会触发 versions.json 写入 forceMcp 提示

### 7.3 验收

- 维护者提 PR 时 `.changeset/*.md` 没有就拦截
- Merge → CI 自动开 "Version Packages" PR
- Merge "Version Packages" → 自动 tag + push + 更新 versions.json
- 全程 0 手动 git tag

---

## 8. Sprint 3: 安全 & 可信（3-4 天）

### 8.1 Scope

- 生成 CI bot GPG keypair，私钥进 Codeup CI secret
- `release.yml` 用 `git tag -s` 签名
- `init.ts`/`update.ts` 安装后 verify tag signature
- 内嵌公钥到 `dist/keys/`
- 新增 `versions.json["deprecated"]` 检查
- 新增 `SECURITY.md` + Codeup 安全联系人
- 启用 Dependabot（Codeup 等价物：定时 CI job 跑 `npm audit`）

### 8.2 关键设计

**Tag 签名流程**（CI 中）：
```bash
# 1. Import bot GPG key from secret
echo "$CI_GPG_PRIVATE_KEY" | gpg --import

# 2. Configure git
git config user.signingkey <bot-key-id>
git config commit.gpgsign true

# 3. Tag
git tag -s "v$VERSION" -m "Release v$VERSION"
git push --tags
```

**客户端 verify**（init/update 内）：
```ts
// src/lib/verify-tag.ts
async function verifyTagSignature(tag: string) {
  // 1. git fetch tag
  await exec('git', ['fetch', '--tags', SOURCE]);

  // 2. 用内嵌公钥 verify
  const pubkey = readFileSync(join(packageRoot, 'keys/bot-pubkey.asc'));
  // 创建临时 keyring，verify tag
  const result = await exec('git', ['tag', '-v', tag], { env: { GNUPGHOME: tmpKeyring } });
  if (!result.success) throw new Error(`Tag ${tag} 签名校验失败`);
}
```

**Deprecation 检查**：
```ts
// 在 init/update/任何 CLI 命令启动时
const currentVersion = readLockfile().packageVersion;
const deprecated = versionsJson.deprecated.find(d => d.version === currentVersion);
if (deprecated) {
  console.warn(`⚠️  你装的 v${currentVersion} 已被弃用: ${deprecated.reason}`);
  console.warn(`   升级: npx foodmax-ai update --version ${deprecated.fixedIn}`);
}
```

**SECURITY.md**：
```markdown
# 安全策略
- 发现漏洞请发飞书私信: @epingpong
- 24h 响应，72h 修复 SLA（critical 漏洞 6h）
- 修复后通过 deprecated 字段标记旧版
```

**Tests (TDD)**:
- 未签名 tag → init/update 报错
- 用错误公钥签的 tag → 报错
- deprecated 版本 → CLI 启动警告
- Dependabot 模拟：触发 CVE → 自动开 PR

### 8.3 验收

- `git tag -v v1.2.3` 在任何机器上成功
- 修改 tag 内容后 verify 失败
- 装了 deprecated 版本的同事每次 CLI 启动都看到警告
- 依赖出 CVE 时自动收到 PR

---

## 9. Sprint 4: 韧性 & E2E（3-4 天）

### 9.1 Scope

- npm install / git clone 加 retry + 国内 mirror fallback
- 错误上报 webhook
- E2E 测试：真实 docker container 跑 `npx foodmax-ai init`
- Lockfile schema v2 + migration 命令

### 9.2 关键设计

**网络 fallback（D6）**：
```ts
// src/lib/network.ts
const MIRRORS = {
  npm: ['registry.npmjs.org', 'registry.npmmirror.com'],
  git: [
    'bgs2026-ap-southeast-1.devops.alibabacloudcs.com',
    'bgs2026-cn-shanghai.devops.alibabacloudcs.com',  // 假设有内部 mirror
  ],
};

async function probeBestMirror(type: 'npm' | 'git'): Promise<string> {
  const results = await Promise.all(
    MIRRORS[type].map(async (host) => {
      const start = Date.now();
      try {
        await fetch(`https://${host}/`, { signal: AbortSignal.timeout(2000) });
        return { host, rtt: Date.now() - start };
      } catch { return { host, rtt: Infinity }; }
    })
  );
  return results.sort((a, b) => a.rtt - b.rtt)[0].host;
}

async function npmInstallWithRetry(url: string, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      await exec('npm', ['install', '--no-save', url], {
        timeout: 120_000,
        env: { ...process.env, npm_config_registry: `https://${await probeBestMirror('npm')}` },
      });
      return;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await sleep(2 ** i * 1000);  // 1s, 2s, 4s
    }
  }
}
```

**E2E test**：
```yaml
# .github/workflows/e2e.yml (或 Codeup 等价物)
name: E2E install
on:
  push:
    tags: ['v*']
jobs:
  install:
    runs-on: ubuntu-latest
    container: ubuntu:22.04
    steps:
      - name: Install Node + Claude Code stub
        run: ...
      - name: Real install
        run: |
          mkdir /tmp/test-project && cd /tmp/test-project
          echo '{"name":"t","version":"0"}' > package.json
          npx -y https://...git#${GITHUB_REF_NAME} init --dry-run
      - name: Verify install
        run: |
          cd /tmp/test-project
          npx foodmax-ai verify --strict
```

**Lockfile migration**：
```ts
// src/commands/migrate-lock.ts
export async function runMigrateLock(opts) {
  const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
  const fromVersion = lock.version || lock.schemaVersion || 1;
  if (fromVersion === 1) {
    // v1 → v2: 添加 schemaVersion, 重新拉 tag signature
    const v2 = {
      schemaVersion: '2.0.0',
      ...migrateFieldsFromV1(lock),
      tagSignature: await fetchTagSignature(lock.packageVersion),
    };
    writeFileSync(LOCK_PATH, JSON.stringify(v2, null, 2));
  }
}
```

**错误上报**（D9）：
```ts
// src/lib/error-reporter.ts
async function reportError(cmd: string, error: Error) {
  if (process.env.FOODMAX_AI_NO_TELEMETRY) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify({
        cmd,
        version: PKG_VERSION,
        node: process.version,
        os: process.platform,
        error: error.message,
        stack: error.stack,
      }),
      signal: AbortSignal.timeout(3000),  // 不阻塞
    });
  } catch { /* 静默失败 */ }
}
```

**Tests (TDD)**:
- 首选 mirror 5s 不通 → 自动切第二个
- npm install 第 1 次失败、第 2 次成功 → 整体成功
- v1 lockfile 文件 → migrate-lock → v2 格式
- 错误上报 webhook 5s 不通 → 不阻塞 CLI
- E2E：真实 docker 跑成功

### 9.3 验收

- 在断 npmjs.org 的环境下 init 仍能成功（fallback npmmirror）
- 故意 `kill -9` 第一次 npm 进程 → 第二次重试成功
- v1 lockfile 项目跑 update → 自动迁移到 v2 + 警告
- 每个 release 后自动跑 E2E，失败自动 rollback

---

## 10. Migration Path

升级路径（同事侧 0 中断）：

| 从 | 到 | 同事需要做 | 影响 |
|---|---|---|---|
| v0.1.x (当前) | v1.0.0 (Sprint 1 完成) | `npx foodmax-ai update` | 无 breaking；新装的项目获得 `--version` flag |
| v1.0.0 | v1.x.x (Sprint 2-3) | `npx foodmax-ai update` | 无 breaking；CLI 启动开始检查 deprecated |
| v1.x.x | v2.0.0 (Sprint 4 lockfile v2) | `npx foodmax-ai update`，看到提示后 `npx foodmax-ai migrate-lock` | 项目 lockfile 升级，提交一次 commit |

**关键里程碑**：
- 第一个签名 tag：`v1.0.0`（Sprint 3 完成时）
- 第一个 deprecated 版本：留给真出现 bug 时（不强制创造）
- lockfile v2：`v2.0.0`（Sprint 4 完成时）

---

## 11. Risks & Mitigations

| # | 风险 | 缓解 |
|---|---|---|
| R1 | Codeup raw URL 格式不支持 / 限速 | fallback：shallow clone `--depth=1 --filter=blob:none` 单文件 |
| R2 | CI bot GPG key 泄漏 | 设 2 年过期；轮换流程文档化；密钥只在 Codeup CI secret，不在任何机器本地 |
| R3 | changesets 学习成本（维护者忘了创建 changeset） | commitlint hook 检查 PR 必须含 `.changeset/*.md` 或 `[skip-changeset]` 标签 |
| R4 | npmmirror.com 拒绝某些 git URL（不是 npm package） | 网络 fallback 只针对 npm registry 部分；git clone 走 Codeup mirror |
| R5 | 内嵌 GPG 公钥过期后老版本 CLI 装不了新 tag | CLI 升级流程包含公钥升级；老 CLI 收到"公钥过期"错误时提示先 `update --version` 升 CLI |
| R6 | E2E test 漂移（Claude Code CLI 变了导致测试 false fail） | E2E 用 `--dry-run` 模式只测安装阶段，不依赖真实 Claude Code 副作用 |
| R7 | 错误上报 webhook 被滥用泄露内部信息 | 上报内容白名单（仅 version/os/node/error message），stack trace 脱敏，opt-out via env var |
| R8 | 维护者不写 changeset → CHANGELOG 缺失 | CI 拦截 + RELEASING.md 写明 + PR template 提醒 |

---

## 12. Open Questions（review 时讨论）

1. **Codeup raw URL 格式**：实际是 `/-/raw/<branch>/<path>` 还是 `/raw/<branch>/<path>`？需要 spike 一次。
2. **CI bot GPG 公钥的内嵌方式**：直接打包到 npm 包里（每次 release 重新嵌），还是 fetch from Codeup？前者简单后者灵活。
3. **changesets 是否能跑在 Codeup CI** 而不是 GitHub Actions？changesets-action 是 GH Action，Codeup 上需要写等价 pipeline。可能要派生一个 `pnpm changeset version && git tag` 的脚本。
4. **是否需要 LTS channel**？现在设计支持但暂无承诺，需要决定第一个 LTS 在什么版本切。
5. **Telemetry webhook 接收端在哪**？Codeup webhook URL 还是自建一个 receiver（飞书机器人 / Sentry / 内部 ELK）？
6. **跨 major 升级的"强制迁移"**：CLI 是否硬拦还是软提示？硬拦 = 不能跳级；软提示 = 用户自负。
7. **`versions.json` 的写权限**：仅 CI bot 能写（master branch protection）还是 release manager 也能直接 push？

---

## 13. Out-of-Scope（明确未来再考虑）

- 多 AI 工具适配（Cursor / Codex）
- Web 仪表盘 / 安装统计 dashboard
- SBOM 生成（如果合规需要再加 cyclonedx-npm）
- 二期完整 telemetry（命令使用率、卡点热点等）
- 内部 npm registry（团队规模超 50 人时再评估）
- Windows 支持

---

## 14. 实施估算细化

| Sprint | 子任务 | 人天 |
|---|---|---|
| S1 | versions.json schema + init/update flag + Claude Code 版本检测 | 3-4 |
| S2 | changesets 接入 + release.yml + CHANGELOG + commitlint | 3-4 |
| S3 | GPG signing + verify tag + deprecated 检查 + SECURITY.md + Dependabot | 3-4 |
| S4 | mirror fallback + retry + error reporter + E2E docker + lockfile v2 migration | 3-4 |
| **合计** | | **12-16 人天** |

附加文档（与 sprint 并行）：
- `RELEASING.md`：维护者发版 SOP
- `MIGRATION.md`：跨 major 升级指南模板
- `SECURITY.md`：漏洞响应流程
- README 更新：增加 `--version`/`--channel` 例子
