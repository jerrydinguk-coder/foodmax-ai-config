# Releasing foodmax-ai-config

## 日常工作（提 PR）

1. 写代码 + 测试
2. 跑 `pnpm changeset` —— 选 patch/minor/major + 写一行人类可读的描述
3. `git add .changeset/*.md src/ tests/` + commit + push + 提 PR
4. CI 会拦没 changeset 的 PR（除非 commit message 含 `[skip-changeset]`，仅适用于纯 docs/CI/test 改动）

## Release 流程（CI 自动）

```
你 merge PR → main
    ↓
Codeup pipeline: version-packages job
    ↓
机器人累积 .changeset/*.md → bump package.json version → 写 CHANGELOG.md → commit [skip ci] + push
    ↓
Codeup pipeline 检测到 "chore(release): version packages" commit
    ↓
release job: git tag vX.Y.Z + push tag + update versions.json["channels"]["latest"] + commit [skip ci] + push
```

**你需要做的：** 只是 merge 普通 PR。版本号、CHANGELOG、tag、versions.json 全部自动。

## 手动 release（紧急 / debug 用）

如果 CI 挂了需要手工放一个 release：

```bash
git checkout main && git pull
pnpm changeset version           # 累积所有 changesets，bump + 写 CHANGELOG
git add . && git commit -m "chore(release): version packages"
git push
pnpm release                     # 调用 src/scripts/release.ts: tag + push + 更新 versions.json
```

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
