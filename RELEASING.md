# Releasing foodmax-ai-config

## 日常工作（提 PR）

1. 写代码 + 测试
2. 跑 `pnpm changeset` —— 选 patch/minor/major + 写一行人类可读的描述
3. `git add .changeset/*.md src/ tests/` + commit + push + 提 PR
4. CI 会拦没 changeset 的 PR（除非 commit message 含 `[skip-changeset]`，仅适用于纯 docs/CI/test 改动）

## Release 流程（当前：手动 / Sprint 3+：CI 自动）

> ⚠️ **Sprint 2 现状**：Codeup 不自动识别仓库里的 CI 文件，需要管理员接入 **云效 Flow** 才能自动触发流水线（详见 [ci-reference-codeup-flow.yml](docs/superpowers/ci-reference-codeup-flow.yml)）。在 Flow 接入完成前，release 完全手动跑。**所有自动化脚本本身都可用**（`pnpm version-packages` + `pnpm release`），只是缺一个 trigger。

### 手动 release（当前默认）

```bash
git checkout main && git pull
pnpm pre-release                 # 全套自检：typecheck + test + build + lockfile + pnpm audit + working tree
pnpm version-packages            # 累积所有 .changeset/*.md，bump + 写 CHANGELOG，commit [skip ci]，push 到 main
pnpm release                     # 调用 src/scripts/release.ts：tag vX.Y.Z + push tag + update versions.json + commit + push
```

`version-packages` 没 changesets 就 no-op 退出，安全可重入。
`release` 检测 CHANGELOG 最新版本不匹配 package.json 时会拦截（防止跳过 `pnpm version-packages` 漏发 changelog）。

### 未来：Flow 接入后自动 release

```
你 merge PR → main
    ↓
Flow: version-packages job
    ↓
机器人累积 .changeset/*.md → bump → 写 CHANGELOG → commit [skip ci] + push
    ↓
Flow 检测 "chore(release): version packages" commit
    ↓
release job: git tag + push tag + update versions.json + commit + push
```

接入步骤（管理员）：
1. 在 flow.aliyun.com 创建 pipeline，关联本 Codeup 仓库
2. 把 [ci-reference-codeup-flow.yml](docs/superpowers/ci-reference-codeup-flow.yml) 的三个 stage（test / version-packages / release）逻辑映射到 Flow 配置
3. 在 Flow secrets 配置 `CI_BOT_TOKEN`（服务账号 token）
4. 接入完成后回头删本节"未来"二字，把"当前手动"section 标记为 fallback

## 漏洞响应

发现 / 收到漏洞报告 → 参考 [SECURITY.md](SECURITY.md) 的 SLA 表。修复版本 release 时**必须**在 `versions.json["deprecated"]` 把所有受影响的旧版本标记为 `severity: "block"`，例如：

```json
{
  "deprecated": [
    {
      "version": "1.4.2",
      "reason": "(预留) 详情见 SECURITY.md 披露",
      "fixedIn": "1.4.3",
      "deprecatedAt": "2026-06-01T00:00:00Z",
      "severity": "block"
    }
  ]
}
```

`severity: "block"` 会让同事 `init` / `update` 这个版本时硬拦（"v1.4.2 is BLOCKED: ...; You must upgrade to v1.4.3 or later"）。

## MCP 注册参数变更的特殊情况

如果你的 release 改了 `src/lib/constants.ts` 里任何 MCP 的注册命令（pin 版本、加 flag、换 transport），changeset 描述里 **必须** 标注。changesets 默认 changelog 生成器不会自动加 `--force-mcp` 警告（这是 Sprint 3 计划接入的 custom generator）；当前需要 release 完手动检查 CHANGELOG.md 的相关条目并在 release notes / 飞书群里点名提醒同事：

> ⚠️ 本次升级修改了 MCP 注册参数，请用 `npx foodmax-ai update --force-mcp` 升级。

## Beta channel release

⚠️ **Sprint 2 限制**：当前 release 脚本只更新 `channels.latest`。Beta channel 由维护者手动维护：

```bash
pnpm changeset pre enter beta    # 进入 beta 模式
pnpm changeset                   # 正常加 changesets
pnpm changeset version           # 累积出 X.Y.Z-rc.N 版本
# 手动 commit + push + tag + 编辑 versions.json["channels"]["beta"]
pnpm changeset pre exit          # 退出 beta 模式
```

Sprint 3+ 计划：扩展 release.ts 支持 `--channel beta` 自动更新 `channels.beta`。

## 前置：CI bot 准备

Codeup pipeline 的 version-packages 和 release job 需要 push 权限。**首次启用时**，管理员需要：

1. 在 Codeup 创建一个服务账号（例如 `foodmax-ci-bot`），授予仓库 `Developer` 角色
2. 为该服务账号生成 personal access token
3. 在 Codeup 项目 Settings → CI/CD → Variables 添加：
   - `CI_BOT_TOKEN`：上面生成的 token；**Protected ✓ Masked ✓**
   - （可选）`CI_BOT_EMAIL`：服务账号邮箱
   - （可选）`CI_BOT_NAME`：服务账号显示名

`.codeup-ci.yml` 用这个 token 改写 origin URL 实现 push。

## 检查 release 是否成功

```bash
git ls-remote --tags origin | grep v$VERSION   # tag 应该在远程
git show v$VERSION                              # 看 tag annotation
cat versions.json | jq .channels.latest         # 应该指向新 tag
```

## 同事侧验证（推荐 release 后跑一次）

```bash
mkdir /tmp/release-test && cd /tmp/release-test
echo '{"name":"test","version":"0"}' > package.json
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git#v$VERSION init --dry-run
```

成功说明 release 真的可用。失败立即在群里通知 + 启动 hotfix。
