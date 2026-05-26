# Sprint 3: 安全 & 可信（无 GPG 版） — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不引入 GPG 签名的前提下，强化"装错版本会有真实后果"的保护：deprecation 分等级（warn / block）、覆盖到所有入口、release 前自检脚本拦低质量发布。

**Why no GPG:** 用户选择"内部专业工具"档不强求供应链签名。仓库写权限本身（Codeup ACL）是核心信任边界。Lockfile sha256 已经防本地篡改。剩下的"安全 & 可信"集中在**版本生命周期管理 + 漏洞响应流程**。

**Architecture:**
- 扩展 versions.json `deprecated` entry 加 `severity: "warn" | "block"` 字段
- `requireNotBlocked(versionsJson, version)` 在 init/update 装包前调用
- CLI startup banner：任何 `foodmax-ai <cmd>` 启动时检查项目 lockfile 里的版本是否被 deprecated
- pre-release script：release 前跑 `pnpm audit` + test + typecheck + lockfile drift 检查，任一失败就 block release

**Tech Stack:** TS + tsx + vitest（同 Sprint 1/2）。无新依赖。

**前置文档：**
- [设计 spec](../specs/2026-05-26-version-management-production-grade-design.md) §8（注：GPG/dependabot 部分已被用户决策剔除）
- [Sprint 1 plan](./2026-05-26-sprint-1-version-semantics.md)（已完成；引入 deprecation warn for update）
- [Sprint 2 plan](./2026-05-26-sprint-2-release-automation.md)（已完成；引入 changesets + release scripts）

---

## File Structure

**Create:**
- `SECURITY.md` — 漏洞响应策略 + 联系人
- `src/lib/deprecation.ts` — `requireNotBlocked()` + `warnIfDeprecated()` 工具
- `src/scripts/pre-release.ts` — release 前自检（audit + test + typecheck + lockfile drift）
- `tests/deprecation.test.ts`
- `tests/pre-release-script.test.ts`

**Modify:**
- `src/lib/versions.ts` — `DeprecatedEntry` 加 `severity?: 'warn' | 'block'` 可选字段（默认 warn）
- `src/commands/init.ts` — 装包前调用 `requireNotBlocked()`（已在 update.ts 有 warnIfDeprecated 类似逻辑）
- `src/commands/update.ts` — `checkDeprecated` 调用替换为 `warnIfDeprecated` + `requireNotBlocked`
- `src/cli.ts` — startup banner: 任何 command 启动时读取项目 lockfile + 项目级 fetchVersions + 提示 deprecation
- `tests/versions.test.ts` — 加 severity 字段测试
- `tests/init.test.ts`、`tests/update.test.ts` — 测 block 路径
- `package.json` — 加 `pre-release` script
- `RELEASING.md` — 加 pre-release 自检步骤 + SECURITY.md 链接
- `README.md` — 提示项目级 lockfile 装到 deprecated 版本会 startup 警告

---

## Task 1: SECURITY.md

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 1: Write**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs(security): vulnerability reporting policy + response SLA"
```

---

## Task 2: DeprecatedEntry severity field

**Files:**
- Modify: `src/lib/versions.ts`
- Modify: `tests/versions.test.ts`

- [ ] **Step 1: 写失败测试**

Append to `tests/versions.test.ts`:

```ts
test('DeprecatedEntry accepts optional severity field', () => {
  const withSeverity: DeprecatedEntry = {
    version: '1.0.0',
    reason: 'critical',
    fixedIn: '1.0.1',
    deprecatedAt: '2026-05-26T00:00:00Z',
    severity: 'block',
  };
  expect(withSeverity.severity).toBe('block');
});

test('DeprecatedEntry without severity is valid (defaults to warn semantically)', () => {
  const withoutSeverity: DeprecatedEntry = {
    version: '1.0.0',
    reason: 'minor issue',
    fixedIn: '1.0.1',
    deprecatedAt: '2026-05-26T00:00:00Z',
  };
  expect(withoutSeverity.severity).toBeUndefined();
});
```

Add to top of the file's imports:
```ts
import type { DeprecatedEntry } from '../src/lib/versions.js';
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/versions.test.ts
```

(Should fail at typecheck — `severity` not defined on interface.)

- [ ] **Step 3: Modify src/lib/versions.ts**

Update `DeprecatedEntry`:

```ts
export interface DeprecatedEntry {
  version: string;
  reason: string;
  fixedIn: string;
  deprecatedAt: string;
  /**
   * How strict the deprecation is:
   * - "warn" (default): print warning, allow install/update
   * - "block": refuse install/update; caller must explicitly pick a non-deprecated version
   */
  severity?: 'warn' | 'block';
}
```

- [ ] **Step 4: 跑测试看通过 + 全套**

```bash
pnpm test tests/versions.test.ts
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/versions.ts tests/versions.test.ts
git commit -m "feat(versions): DeprecatedEntry severity (warn | block)"
```

---

## Task 3: src/lib/deprecation.ts (TDD)

**Files:**
- Create: `src/lib/deprecation.ts`
- Create: `tests/deprecation.test.ts`

Pure functions: `warnIfDeprecated(versionsJson, version)` (logs to console.warn if found) and `requireNotBlocked(versionsJson, version)` (throws if severity=block).

- [ ] **Step 1: 写失败测试**

```ts
// tests/deprecation.test.ts
import { test, expect, vi } from 'vitest';
import { warnIfDeprecated, requireNotBlocked } from '../src/lib/deprecation.js';
import type { VersionsJson } from '../src/lib/versions.js';

const base: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '2.0.0', tag: 'v2.0.0', publishedAt: '2026-05-26T00:00:00Z' },
  },
  deprecated: [
    {
      version: '1.0.0',
      reason: 'minor cosmetic issue',
      fixedIn: '1.0.1',
      deprecatedAt: '2026-05-10T00:00:00Z',
    },
    {
      version: '1.5.0',
      reason: 'critical: MCP registration leaks secret to logs',
      fixedIn: '1.5.1',
      deprecatedAt: '2026-05-20T00:00:00Z',
      severity: 'block',
    },
  ],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

test('warnIfDeprecated prints a warning when version is deprecated (warn severity)', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    warnIfDeprecated(base, '1.0.0');
    expect(spy).toHaveBeenCalled();
    const allOutput = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/deprecated/i);
    expect(allOutput).toMatch(/1\.0\.1/);
  } finally {
    spy.mockRestore();
  }
});

test('warnIfDeprecated also warns for block-severity entries', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    warnIfDeprecated(base, '1.5.0');
    expect(spy).toHaveBeenCalled();
    const allOutput = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/blocked|critical/i);
  } finally {
    spy.mockRestore();
  }
});

test('warnIfDeprecated silent when version is fine', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    warnIfDeprecated(base, '2.0.0');
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test('requireNotBlocked throws on block-severity', () => {
  expect(() => requireNotBlocked(base, '1.5.0')).toThrow(/blocked/i);
});

test('requireNotBlocked allows warn-severity (does not throw)', () => {
  expect(() => requireNotBlocked(base, '1.0.0')).not.toThrow();
});

test('requireNotBlocked allows non-deprecated', () => {
  expect(() => requireNotBlocked(base, '2.0.0')).not.toThrow();
});

test('requireNotBlocked error message includes fixedIn', () => {
  try {
    requireNotBlocked(base, '1.5.0');
    expect.fail('should have thrown');
  } catch (e) {
    expect((e as Error).message).toMatch(/1\.5\.1/);
  }
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/deprecation.test.ts
```

- [ ] **Step 3: 写实现**

```ts
// src/lib/deprecation.ts
import type { VersionsJson, DeprecatedEntry } from './versions.js';
import { checkDeprecated } from './versions.js';

/**
 * Print a console.warn line if the version is in the deprecated list.
 * Severity-agnostic: warns for both 'warn' and 'block' entries. Use this
 * alongside {@link requireNotBlocked} when you also want hard-fail behavior.
 */
export function warnIfDeprecated(v: VersionsJson, version: string): DeprecatedEntry | null {
  const entry = checkDeprecated(v, version);
  if (!entry) return null;
  const sev = entry.severity ?? 'warn';
  const prefix = sev === 'block' ? '🚫 BLOCKED' : '⚠️  DEPRECATED';
  console.warn(
    `${prefix}: v${entry.version} — ${entry.reason}. Fixed in v${entry.fixedIn} (deprecated ${entry.deprecatedAt}).`
  );
  return entry;
}

/**
 * Throw if the version is deprecated with severity='block'.
 * Used by init/update to refuse installation of known-broken versions.
 */
export function requireNotBlocked(v: VersionsJson, version: string): void {
  const entry = checkDeprecated(v, version);
  if (!entry) return;
  if (entry.severity === 'block') {
    throw new Error(
      `v${entry.version} is BLOCKED: ${entry.reason}. ` +
        `You must upgrade to v${entry.fixedIn} or later. ` +
        `Run: npx foodmax-ai update --version ${entry.fixedIn}`
    );
  }
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/deprecation.test.ts
pnpm typecheck
```

Expected: 7 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deprecation.ts tests/deprecation.test.ts
git commit -m "feat(deprecation): warnIfDeprecated + requireNotBlocked helpers"
```

---

## Task 4: init.ts integrate deprecation check

**Files:**
- Modify: `src/commands/init.ts`
- Modify: `tests/init.test.ts`

- [ ] **Step 1: 写失败测试**

Append to `tests/init.test.ts`:

```ts
test('init refuses to install a version marked severity=block', async () => {
  const fakeBlocked: VersionsJson = {
    ...fakeVersionsJson,
    deprecated: [
      {
        version: '1.2.3',
        reason: 'critical: MCP secret leak',
        fixedIn: '1.2.4',
        deprecatedAt: '2026-05-20T00:00:00Z',
        severity: 'block',
      },
    ],
  };
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      fetchVersions: async () => fakeBlocked,
      version: '1.2.3',
    })
  ).rejects.toThrow(/blocked/i);
});

test('init warns but proceeds for warn-severity deprecation', async () => {
  const fakeWarn: VersionsJson = {
    ...fakeVersionsJson,
    deprecated: [
      {
        version: '1.2.3',
        reason: 'cosmetic issue',
        fixedIn: '1.2.4',
        deprecatedAt: '2026-05-20T00:00:00Z',
      },
    ],
  };
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      fetchVersions: async () => fakeWarn,
      version: '1.2.3',
    });
    const allOutput = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/deprecated/i);
  } finally {
    spy.mockRestore();
  }
});
```

(Need `import { vi } from 'vitest'` at top of file if not already there.)

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/init.test.ts
```

- [ ] **Step 3: Modify src/commands/init.ts**

Imports — add:
```ts
import { warnIfDeprecated, requireNotBlocked } from '../lib/deprecation.js';
```

In `runInit`, AFTER `resolveVersion()` and the `pinnedSource` computation, BEFORE `installPlugin`:

```ts
warnIfDeprecated(versionsJson, resolved.version);
requireNotBlocked(versionsJson, resolved.version);
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/init.test.ts
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.ts tests/init.test.ts
git commit -m "feat(init): block install of deprecated/blocked versions + warn for warn-severity"
```

---

## Task 5: update.ts switch to deprecation lib

**Files:**
- Modify: `src/commands/update.ts`
- Modify: `tests/update.test.ts`

Currently `update.ts` calls `checkDeprecated()` directly and inlines a console.warn. Refactor to use the new `warnIfDeprecated` + `requireNotBlocked`.

- [ ] **Step 1: 写失败测试**

Append to `tests/update.test.ts`:

```ts
test('update refuses to install a version marked severity=block', async () => {
  const fakeBlocked: VersionsJson = {
    ...updateFakeVersions,
    deprecated: [
      {
        version: '1.2.3',
        reason: 'critical: MCP secret leak',
        fixedIn: '1.2.4',
        deprecatedAt: '2026-05-20T00:00:00Z',
        severity: 'block',
      },
    ],
  };
  await expect(
    runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunUpdate,
      fetchVersions: async () => fakeBlocked,
      version: '1.2.3',
    })
  ).rejects.toThrow(/blocked/i);
});
```

- [ ] **Step 2: Run test, expect FAIL (block test passes today only as warn, not throw)**

```bash
pnpm test tests/update.test.ts
```

Actually — Sprint 1's update.ts uses `checkDeprecated` which only warns, never throws. The new test expects throw, so it WILL fail.

- [ ] **Step 3: Modify src/commands/update.ts**

Replace this block (currently around the existing `checkDeprecated` call):
```ts
const dep = checkDeprecated(versionsJson, resolved.version);
if (dep) {
  console.warn(warn(`⚠️  v${dep.version} is deprecated: ${dep.reason}. Fixed in v${dep.fixedIn}.`));
}
```

With:
```ts
warnIfDeprecated(versionsJson, resolved.version);
requireNotBlocked(versionsJson, resolved.version);
```

Update imports: drop `checkDeprecated`, add `warnIfDeprecated, requireNotBlocked` from `../lib/deprecation.js`.

- [ ] **Step 4: 跑测试看通过 + 全套**

```bash
pnpm test tests/update.test.ts
pnpm test
pnpm typecheck
```

(Note: existing "update warns when installing a deprecated version" test should still pass because warnIfDeprecated also prints to console.warn.)

- [ ] **Step 5: Commit**

```bash
git add src/commands/update.ts tests/update.test.ts
git commit -m "feat(update): switch to deprecation lib (block on severity=block)"
```

---

## Task 6: CLI startup deprecation banner

**Files:**
- Modify: `src/cli.ts`
- Create: `src/lib/startup-banner.ts`
- Create: `tests/startup-banner.test.ts`

Goal: any `foodmax-ai <cmd>` (verify, status, repair, etc.) reads the project's `.foodmax-ai.lock.json` and warns if its `packageVersion` is in `versions.json["deprecated"]`. This catches "you've been on a deprecated version for months" rather than waiting for next update.

⚠️ The banner must NOT block any command (even with severity=block — at startup we only inform; init/update enforce). Reason: if user is on a blocked version and running `foodmax-ai status` to investigate, blocking that command makes debugging impossible.

⚠️ The banner must NOT fetch versions.json (would slow every command + fail offline). Use a cached copy if available; skip silently otherwise. (For Sprint 3 MVP, just skip — write the cache layer in a future sprint if needed.)

Actually for Sprint 3: keep it simple — the startup banner only fires if there's a project lockfile present AND it can fetch versions.json within a short timeout (e.g., 2s). Otherwise silent.

- [ ] **Step 1: 写失败测试**

```ts
// tests/startup-banner.test.ts
import { test, expect, vi } from 'vitest';
import { showStartupBannerIfDeprecated, type StartupBannerDeps } from '../src/lib/startup-banner.js';
import type { VersionsJson } from '../src/lib/versions.js';

const versionsWithDeprecated: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '2.0.0', tag: 'v2.0.0', publishedAt: '2026-05-26T00:00:00Z' },
  },
  deprecated: [
    {
      version: '1.0.0',
      reason: 'has a bug',
      fixedIn: '1.0.1',
      deprecatedAt: '2026-05-10T00:00:00Z',
    },
  ],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

function makeDeps(
  projectVersion: string | null,
  versions: VersionsJson | null,
  fetchTimedOut = false
): StartupBannerDeps {
  return {
    readProjectLockfileVersion: async () => projectVersion,
    fetchVersionsWithTimeout: async () => {
      if (fetchTimedOut) return null;
      return versions;
    },
  };
}

test('shows banner when project lockfile version is deprecated', async () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await showStartupBannerIfDeprecated(makeDeps('1.0.0', versionsWithDeprecated));
    const out = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toMatch(/deprecated/i);
    expect(out).toMatch(/1\.0\.1/);
  } finally {
    spy.mockRestore();
  }
});

test('silent when project version is fine', async () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await showStartupBannerIfDeprecated(makeDeps('2.0.0', versionsWithDeprecated));
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test('silent when no project lockfile present (project may not be init-ed yet)', async () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await showStartupBannerIfDeprecated(makeDeps(null, versionsWithDeprecated));
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test('silent when versions.json fetch times out (offline / mirror down)', async () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await showStartupBannerIfDeprecated(makeDeps('1.0.0', versionsWithDeprecated, true));
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/startup-banner.test.ts
```

- [ ] **Step 3: 写实现**

```ts
// src/lib/startup-banner.ts
import type { VersionsJson } from './versions.js';
import { warnIfDeprecated } from './deprecation.js';

export interface StartupBannerDeps {
  /** Returns the project lockfile's packageVersion, or null if no lockfile. */
  readProjectLockfileVersion: () => Promise<string | null>;
  /** Returns the parsed versions.json, or null if fetch failed/timed out. */
  fetchVersionsWithTimeout: () => Promise<VersionsJson | null>;
}

export async function showStartupBannerIfDeprecated(deps: StartupBannerDeps): Promise<void> {
  const projectVersion = await deps.readProjectLockfileVersion();
  if (!projectVersion) return;  // not init-ed, nothing to check
  const versions = await deps.fetchVersionsWithTimeout();
  if (!versions) return;  // offline / fetch failed; stay quiet
  warnIfDeprecated(versions, projectVersion);
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/startup-banner.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Wire up in src/cli.ts**

In `src/cli.ts`, before the `program.parseAsync(process.argv)` call, add:

```ts
import { showStartupBannerIfDeprecated } from './lib/startup-banner.js';
import { fetchVersions } from './lib/versions.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

async function maybeShowDeprecationBanner(): Promise<void> {
  const lockPath = join(process.cwd(), '.foodmax-ai.lock.json');
  await showStartupBannerIfDeprecated({
    readProjectLockfileVersion: async () => {
      if (!existsSync(lockPath)) return null;
      try {
        const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
        return (lock as { packageVersion?: string }).packageVersion ?? null;
      } catch {
        return null;
      }
    },
    fetchVersionsWithTimeout: async () => {
      try {
        // Short timeout: we don't want to slow down every CLI invocation
        const racePromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
        return await Promise.race([fetchVersions(), racePromise]);
      } catch {
        return null;
      }
    },
  });
}

// Fire-and-don't-await: do not block command execution on the banner
maybeShowDeprecationBanner().catch(() => {});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: the banner is **fire-and-forget** — we don't await it before parsing args. The warning may print after the command's first line of output, but that's acceptable (better than slowing every command).

- [ ] **Step 6: 跑全套测试 + 提交**

```bash
pnpm test
pnpm typecheck
pnpm build
git add src/cli.ts src/lib/startup-banner.ts tests/startup-banner.test.ts
git commit -m "feat(cli): startup banner warns when project is on deprecated version"
```

---

## Task 7: src/scripts/pre-release.ts

**Files:**
- Create: `src/scripts/pre-release.ts`
- Create: `tests/pre-release-script.test.ts`

A self-check script the maintainer runs BEFORE `pnpm release`. Hard-fails if any of: typecheck/test/build broken, lockfile drifted, `pnpm audit` reports high/critical CVE, working tree dirty, changeset present without intent.

- [ ] **Step 1: 写失败测试**

```ts
// tests/pre-release-script.test.ts
import { test, expect } from 'vitest';
import { runPreRelease, type PreReleaseDeps, type CheckResult } from '../src/scripts/pre-release.js';

function makeDeps(overrides: Partial<PreReleaseDeps> = {}): PreReleaseDeps {
  return {
    runTypecheck: async () => ({ ok: true }),
    runTests: async () => ({ ok: true }),
    runBuild: async () => ({ ok: true }),
    checkLockfileDrift: async () => ({ ok: true }),
    runAudit: async () => ({ ok: true }),
    checkWorkingTreeClean: async () => ({ ok: true }),
    ...overrides,
  };
}

test('runPreRelease succeeds when all checks pass', async () => {
  const result = await runPreRelease(makeDeps());
  expect(result.ok).toBe(true);
  expect(result.failures).toEqual([]);
});

test('runPreRelease reports typecheck failure', async () => {
  const result = await runPreRelease(
    makeDeps({ runTypecheck: async () => ({ ok: false, reason: 'TS2322 in foo.ts' }) })
  );
  expect(result.ok).toBe(false);
  expect(result.failures).toContainEqual({ check: 'typecheck', reason: 'TS2322 in foo.ts' });
});

test('runPreRelease aggregates multiple failures, does not short-circuit', async () => {
  const result = await runPreRelease(
    makeDeps({
      runTests: async () => ({ ok: false, reason: '3 tests failed' }),
      runAudit: async () => ({ ok: false, reason: '1 high CVE: lodash<4.17.21' }),
    })
  );
  expect(result.ok).toBe(false);
  expect(result.failures).toHaveLength(2);
  expect(result.failures.map((f) => f.check).sort()).toEqual(['audit', 'tests']);
});

test('runPreRelease working tree dirty -> failure', async () => {
  const result = await runPreRelease(
    makeDeps({ checkWorkingTreeClean: async () => ({ ok: false, reason: '2 uncommitted files' }) })
  );
  expect(result.ok).toBe(false);
  expect(result.failures[0]?.check).toBe('working-tree');
});

test('runPreRelease lockfile drift -> failure', async () => {
  const result = await runPreRelease(
    makeDeps({ checkLockfileDrift: async () => ({ ok: false, reason: '.locked.json out of date' }) })
  );
  expect(result.ok).toBe(false);
  expect(result.failures[0]?.check).toBe('lockfile');
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/pre-release-script.test.ts
```

- [ ] **Step 3: 写实现**

```ts
// src/scripts/pre-release.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type CheckResult = { ok: true } | { ok: false; reason: string };

export interface PreReleaseDeps {
  runTypecheck: () => Promise<CheckResult>;
  runTests: () => Promise<CheckResult>;
  runBuild: () => Promise<CheckResult>;
  checkLockfileDrift: () => Promise<CheckResult>;
  runAudit: () => Promise<CheckResult>;
  checkWorkingTreeClean: () => Promise<CheckResult>;
}

export interface RunPreReleaseResult {
  ok: boolean;
  failures: Array<{ check: string; reason: string }>;
}

export const defaultDeps: PreReleaseDeps = {
  runTypecheck: async () => {
    try {
      await execFileAsync('pnpm', ['typecheck'], { timeout: 60_000 });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: extractErrorMessage(e) };
    }
  },
  runTests: async () => {
    try {
      await execFileAsync('pnpm', ['test'], { timeout: 120_000 });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: extractErrorMessage(e) };
    }
  },
  runBuild: async () => {
    try {
      await execFileAsync('pnpm', ['build'], { timeout: 60_000 });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: extractErrorMessage(e) };
    }
  },
  checkLockfileDrift: async () => {
    try {
      await execFileAsync('pnpm', ['lock'], { timeout: 60_000 });
      // Now check if .locked.json changed
      const { stdout } = await execFileAsync('git', ['status', '--porcelain', '.locked.json'], {
        timeout: 5_000,
      });
      if (stdout.trim()) {
        return { ok: false, reason: '.locked.json out of date — run `pnpm lock` and commit' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: extractErrorMessage(e) };
    }
  },
  runAudit: async () => {
    try {
      // pnpm audit --audit-level=high exits non-zero on high/critical findings
      await execFileAsync('pnpm', ['audit', '--audit-level=high'], { timeout: 60_000 });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `pnpm audit found high/critical CVE: ${extractErrorMessage(e).slice(0, 200)}` };
    }
  },
  checkWorkingTreeClean: async () => {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { timeout: 5_000 });
      if (stdout.trim()) {
        return { ok: false, reason: `working tree dirty:\n${stdout.trim()}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: extractErrorMessage(e) };
    }
  },
};

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 500);
  return String(e).slice(0, 500);
}

export async function runPreRelease(deps: PreReleaseDeps = defaultDeps): Promise<RunPreReleaseResult> {
  const checks: Array<{ name: string; run: () => Promise<CheckResult> }> = [
    { name: 'working-tree', run: deps.checkWorkingTreeClean },
    { name: 'typecheck', run: deps.runTypecheck },
    { name: 'tests', run: deps.runTests },
    { name: 'build', run: deps.runBuild },
    { name: 'lockfile', run: deps.checkLockfileDrift },
    { name: 'audit', run: deps.runAudit },
  ];

  const failures: Array<{ check: string; reason: string }> = [];
  for (const { name, run } of checks) {
    console.log(`Running pre-release check: ${name}…`);
    const r = await run();
    if (!r.ok) {
      failures.push({ check: name, reason: r.reason });
      console.error(`  ❌ ${name}: ${r.reason}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPreRelease().then((r) => {
    if (!r.ok) {
      console.error(`\n❌ pre-release failed: ${r.failures.length} check(s) failed`);
      process.exit(1);
    }
    console.log('\n✓ pre-release passed');
  });
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/pre-release-script.test.ts
pnpm typecheck
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/pre-release.ts tests/pre-release-script.test.ts
git commit -m "feat(release): pre-release self-check script (typecheck + test + audit + lockfile)"
```

---

## Task 8: package.json + RELEASING.md updates

**Files:**
- Modify: `package.json`
- Modify: `RELEASING.md`

- [ ] **Step 1: 加 pre-release script**

In `package.json` scripts:
```json
"pre-release": "tsx src/scripts/pre-release.ts",
```

(Sits between `version-packages` and `release` alphabetically/logically.)

- [ ] **Step 2: Update RELEASING.md to include pre-release**

Find the "手动 release" section, change:
```bash
git checkout main && git pull
pnpm test && pnpm typecheck      # 自检
pnpm version-packages            # ...
pnpm release                     # ...
```

To:
```bash
git checkout main && git pull
pnpm pre-release                 # 全套自检：typecheck + test + build + lockfile + pnpm audit + working tree
pnpm version-packages            # 累积所有 .changeset/*.md，bump + 写 CHANGELOG，commit [skip ci]，push 到 main
pnpm release                     # 调用 src/scripts/release.ts：tag vX.Y.Z + push tag + update versions.json + commit + push
```

Also add a section about SECURITY.md right after "MCP 注册参数变更的特殊情况":

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add package.json RELEASING.md
git commit -m "docs(releasing): add pre-release self-check + SECURITY.md hand-off"
```

---

## Task 9: README + CHANGELOG + changeset

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`（实际由 `pnpm changeset` 工具最终写入，本任务只准备 changeset）
- Create: `.changeset/sprint-3-safety-trust.md`

- [ ] **Step 1: Write changeset for Sprint 3**

```bash
cat > .changeset/sprint-3-safety-trust.md <<'EOF'
---
"foodmax-ai-config": minor
---

Sprint 3: 安全 & 可信 — DeprecatedEntry 加 severity (warn|block)，init/update 在 block 时硬拦；CLI startup 检测项目 lockfile 版本是否 deprecated 并提示；新增 pre-release 自检脚本（typecheck/test/build/lockfile/pnpm audit/working-tree）；新增 SECURITY.md 漏洞响应策略。

GPG signing intentionally omitted — internal trust boundary is the Codeup repo write ACL; lockfile sha256 covers tamper detection.
EOF
```

- [ ] **Step 2: README updates**

Find the existing "Troubleshooting" table. Add a new row:

```markdown
| `🚫 BLOCKED: v...` 启动报错 | 你装的版本被维护者标记为危险（见 SECURITY.md）。立刻 `npx foodmax-ai update --version <fixedIn>` 升级 |
```

Find the "前置条件" section in the team-member 90% section. After the Claude Code version requirement, add:

```markdown
**安全提示：** 每次跑 `foodmax-ai <任何命令>`，CLI 会在启动时悄悄检查项目当前版本有没有被维护者标记为 deprecated。如果有，会打印一条警告。`init` / `update` 时如果版本被标记为 `severity: "block"`（严重 bug 或安全问题），会**硬拦**安装，必须升级到 fixedIn 版本。详见 [SECURITY.md](SECURITY.md)。
```

- [ ] **Step 3: Commit**

```bash
git add README.md .changeset/sprint-3-safety-trust.md
git commit -m "docs(readme): document deprecation banner + block behavior"
```

---

## Task 10: E2E smoke

**Files:** none — manual verification.

- [ ] **Step 1: 全套测试 + 打包**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all green (target ~150 tests, +18 new).

- [ ] **Step 2: Verify pre-release script runs (it may exit non-zero if there's drift, which is OK to observe)**

```bash
pnpm pre-release
```

Expected: prints each check. If `working-tree` fails (因为我们刚 commit 了一堆东西所以应该是 clean，但 `.changeset/sprint-3-safety-trust.md` 还没消费). Adjust until clean or accept some checks fail (e.g., audit may report on existing deps).

- [ ] **Step 3: Verify startup banner — manually simulate a deprecated install**

```bash
# Temporarily edit versions.json locally to add a deprecated entry for 0.1.0:
node -e "
const fs = require('fs');
const v = JSON.parse(fs.readFileSync('versions.json'));
v.deprecated = [{version:'0.1.0', reason:'test', fixedIn:'0.1.1', deprecatedAt:'2026-05-26T00:00:00Z'}];
fs.writeFileSync('versions.json', JSON.stringify(v, null, 2));
"

# Now run any CLI command in a directory that has a .foodmax-ai.lock.json with version=0.1.0
# (the foodmax-dev-env-init repo itself does NOT have a .foodmax-ai.lock.json — it IS the package.
#  So this test requires either a side test directory or skip.)

# Revert:
git checkout versions.json
```

If you have no consumer project handy, skip this manual step. The unit tests for showStartupBannerIfDeprecated (Task 6) cover the logic.

- [ ] **Step 4: 不推送（等用户决策同 Sprint 2 节奏）**

Sprint 3 commits stay local. Report back; user decides when to push to main.

---

## Definition of Done (Sprint 3)

- 10 个 task 全部提交
- `pnpm test` 全过（target ~150 tests）
- `pnpm typecheck` clean
- `pnpm build` 成功
- `pnpm pre-release` 跑过一次（可能有 audit warnings — 那是另一个问题，不阻塞 sprint）
- SECURITY.md 存在且内容完整
- 所有 deprecation 路径走通：init 硬拦 block / update 硬拦 block / warn for both / CLI startup banner
- `.changeset/sprint-3-safety-trust.md` 准备好，等下次 release 消费

## Out-of-Scope for Sprint 3

- GPG tag 签名（用户决定砍掉，理由：内部信任边界是仓库写权限 + lockfile sha256 覆盖）
- Sigstore / SLSA L2+ provenance（同上）
- 自动 vulnerability 扫描（pnpm audit 已加进 pre-release；CI 自动定期跑需要 Flow 接入，留到 Sprint 4+）
- 安全告警的飞书 webhook 集成（手动报告够用，自动化等团队规模变大）
- 公钥分发 / 密钥轮换（不签名不需要）

## Open Questions

1. **CLI startup banner 性能影响**：每次 CLI 启动多 fetch 一次 versions.json（最多 2s timeout）。对常用命令（status, verify）可能让 UX 慢。如果反馈差，可改成 30 min cache 写在 ~/.cache/foodmax-ai/versions-cache.json。
2. **deprecation severity 的真实使用**：什么场景才升级到 block？需要在 SECURITY.md 加例子（"什么算 critical/high 触发 block"）。
3. **pre-release 的 audit 失败处理**：pnpm 自身有 known CVE 时也会 fail，可能让你无法 release。需要一个 escape hatch（`--allow-audit` flag）？暂时不加，等真撞到再说。
