# 安全策略 (Security Policy)

## 报告漏洞

发现 foodmax-ai-config 的安全漏洞，请通过以下渠道**私下**联系：

- **飞书私信**：@epingpong
- **加密邮件**：（如需邮件渠道，向 epingpong 索取 PGP 公钥）
- **不要** 提 public issue 或在群里讨论未公开漏洞

## 响应 SLA

| 严重程度 | 首次响应 | 修复目标 |
|---|---|---|
| Critical (RCE / 凭据泄露 / 供应链注入) | 6 小时内 | 24 小时 |
| High (绕过 lockfile / 注入伪造 MCP) | 24 小时 | 72 小时 |
| Medium (信息泄露 / DoS) | 3 天 | 2 周 |
| Low | 2 周 | 下个 release |

## 修复流程

1. 私下沟通确认问题 + 影响范围
2. 修复 + 写测试（不公开 commit message 暴露漏洞细节）
3. Release 修复版本
4. 在 `versions.json` 把所有受影响的旧版本标记为 `deprecated` 且 `severity: "block"`（同事 update 时硬拦）
5. **24h 后** 公开披露（CHANGELOG.md 的 `### Security` section + 飞书群通知）

## 已知漏洞

（无）

## 范围

本 repo 的代码、CLI、自动安装的集成（Playwright/Feishu MCP、superpowers plugin）属于范围内。
传递依赖（chalk、commander、@playwright/mcp 等）的漏洞应直接上报给上游；如果暴露面在我们这边请也通知我们。

## 服务账号 / 凭据

本项目不存储任何长期凭据：
- Feishu MCP 的 `$LARK_APP_ID` / `$LARK_APP_SECRET` 是同事 shell env 自取
- Claude Code plugin 走 Anthropic 官方 OAuth
- 未来 CI bot token（Sprint X+）应使用 Codeup project secret 不入仓库
