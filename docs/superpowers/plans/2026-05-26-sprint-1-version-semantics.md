# Sprint 1: 版本语义 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让同事可以 `npx foodmax-ai init --version 1.2.3` 或 `--channel beta`，且老 Claude Code 安装前被拦截。

**Architecture:** 新增 `versions.json` 元数据文件作为 dist-tag 真理源；CLI 启动时 fetch 它解析 channel/version；用 `semver` lib 做范围匹配；扩展 lockfile 记录 channel + version 来源。

**Tech Stack:** TypeScript + tsx + vitest + commander，新增 `semver` + `@types/semver`。

**前置文档**：[设计 spec](../specs/2026-05-26-version-management-production-grade-design.md) §6

---

## File Structure

**Create:**
- `versions.json` — 仓库根，dist-tag/deprecated/peer requirements 元数据
- `src/lib/versions.ts` — fetch + parse + resolve channel/version
- `src/lib/semver-util.ts` — `semver` lib 的薄包装（解析 Claude --version 输出 + 范围检查）
- `tests/versions.test.ts` — versions.ts 单元测试
- `tests/semver-util.test.ts` — semver-util 单元测试
- `tests/init-version-flag.test.ts` — init 的 --version/--channel 集成测试
- `tests/update-version-flag.test.ts` — update 的同上
- `tests/claude-version-check.test.ts` — Claude Code 版本拦截测试

**Modify:**
- `package.json` — 新增 `semver` dep、`@types/semver` devDep、`peerDependencies."@anthropic-ai/claude-code"`
- `src/lib/claude-detect.ts` — 解析 `claude --version` semver；新 `requireClaudeVersion(range)`
- `src/lib/lockfile.ts` — Lockfile interface 加 `channel?: string`、`resolvedFrom?: 'channel' | 'explicit-version' | 'default'`
- `src/commands/init.ts` — 加 `version?`、`channel?` option；npm install URL 用 resolveVersion 结果
- `src/commands/update.ts` — 同上
- `src/cli.ts` — `init` / `update` 命令加 `.option('--version <semver>')` 和 `.option('--channel <name>')`
- `README.md` — `--version` / `--channel` 用法

**Note for implementer:** existing tests use mocked `exec`; new tests follow that pattern—inject a `fetchVersionsImpl` override so tests don't hit network.

---

## Task 1: 加 semver 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 装依赖并把它写入 package.json**

```bash
cd /Users/epingpong/CodeBuddy/foodmax-dev-env-init
pnpm add semver
pnpm add -D @types/semver
```

预期：`dependencies.semver` 和 `devDependencies."@types/semver"` 出现在 package.json。

- [ ] **Step 2: 跑测试套确认没破坏**

```bash
pnpm test
```

Expected: 全部 76 测试通过（加依赖不应影响现有逻辑）。

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add semver for version range checks"
```

---

## Task 2: 创建 versions.json

**Files:**
- Create: `versions.json`

- [ ] **Step 1: 写 versions.json（按 spec §5.1 schema）**

```json
{
  "schemaVersion": 1,
  "channels": {
    "latest": {
      "version": "0.1.0",
      "tag": "v0.1.0",
      "publishedAt": "2026-05-26T00:00:00Z"
    }
  },
  "deprecated": [],
  "minSupportedVersion": "0.1.0",
  "peerRequirements": {
    "claudeCode": ">=1.0.0",
    "node": ">=18.0.0"
  }
}
```

注意：v0.1.0 tag 还没打（待 Sprint 2 release 自动化或 Sprint 1 完后手动打）。

- [ ] **Step 2: Commit**

```bash
git add versions.json
git commit -m "feat(versions): add versions.json schema with latest channel"
```

---

## Task 3: src/lib/semver-util.ts

**Files:**
- Create: `src/lib/semver-util.ts`
- Test: `tests/semver-util.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/semver-util.test.ts
import { test, expect } from 'vitest';
import { parseClaudeVersion, satisfies } from '../src/lib/semver-util.js';

test('parseClaudeVersion extracts semver from `claude --version` style output', () => {
  expect(parseClaudeVersion('1.2.3 (Claude Code)')).toBe('1.2.3');
  expect(parseClaudeVersion('claude-code v0.45.1-beta+sha')).toBe('0.45.1-beta');
  expect(parseClaudeVersion('  2.0.0\n')).toBe('2.0.0');
});

test('parseClaudeVersion returns null when no semver in output', () => {
  expect(parseClaudeVersion('not a version')).toBeNull();
  expect(parseClaudeVersion('')).toBeNull();
});

test('satisfies wraps semver.satisfies with prerelease allowance', () => {
  expect(satisfies('1.2.3', '>=1.0.0')).toBe(true);
  expect(satisfies('0.9.0', '>=1.0.0')).toBe(false);
  // Prerelease should be allowed against a non-prerelease range
  // (default semver.satisfies would reject 1.0.0-rc.1 against >=1.0.0;
  // we set includePrerelease: true so internal channels work.)
  expect(satisfies('1.0.0-rc.1', '>=1.0.0')).toBe(true);
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/semver-util.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 写实现**

```ts
// src/lib/semver-util.ts
import semver from 'semver';

/**
 * Extract a semver string from arbitrary CLI version output.
 * Returns null if no semver found.
 */
export function parseClaudeVersion(stdout: string): string | null {
  // Match X.Y.Z optionally followed by -prerelease (drop +build).
  const m = stdout.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  if (!m) return null;
  const cleaned = semver.coerce(m[1], { includePrerelease: true });
  // semver.coerce drops prerelease; use the raw match if it parses.
  return semver.valid(m[1]) ?? cleaned?.version ?? null;
}

/**
 * semver.satisfies with includePrerelease true, so internal beta/rc versions
 * resolve against simple >= ranges.
 */
export function satisfies(version: string, range: string): boolean {
  return semver.satisfies(version, range, { includePrerelease: true });
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/semver-util.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/semver-util.ts tests/semver-util.test.ts
git commit -m "feat(semver-util): parse Claude CLI version + range check"
```

---

## Task 4: src/lib/versions.ts

**Files:**
- Create: `src/lib/versions.ts`
- Test: `tests/versions.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/versions.test.ts
import { test, expect } from 'vitest';
import { resolveVersion, checkDeprecated, type VersionsJson } from '../src/lib/versions.js';

const fakeVersions: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '1.2.3', tag: 'v1.2.3', publishedAt: '2026-05-26T00:00:00Z' },
    beta: { version: '1.3.0-rc.1', tag: 'v1.3.0-rc.1', publishedAt: '2026-05-25T00:00:00Z' },
  },
  deprecated: [
    { version: '1.1.0', reason: 'critical bug', fixedIn: '1.1.1', deprecatedAt: '2026-05-10T00:00:00Z' },
  ],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

test('resolveVersion default returns latest channel tag', () => {
  const r = resolveVersion(fakeVersions, {});
  expect(r).toEqual({ tag: 'v1.2.3', version: '1.2.3', source: 'channel', channel: 'latest' });
});

test('resolveVersion --channel beta returns beta tag', () => {
  const r = resolveVersion(fakeVersions, { channel: 'beta' });
  expect(r).toEqual({ tag: 'v1.3.0-rc.1', version: '1.3.0-rc.1', source: 'channel', channel: 'beta' });
});

test('resolveVersion --version 1.2.3 returns explicit tag', () => {
  const r = resolveVersion(fakeVersions, { version: '1.2.3' });
  expect(r).toEqual({ tag: 'v1.2.3', version: '1.2.3', source: 'explicit-version' });
});

test('resolveVersion --version with v prefix is accepted', () => {
  const r = resolveVersion(fakeVersions, { version: 'v1.2.3' });
  expect(r.tag).toBe('v1.2.3');
  expect(r.version).toBe('1.2.3');
});

test('resolveVersion errors when both --version and --channel given', () => {
  expect(() => resolveVersion(fakeVersions, { version: '1.2.3', channel: 'beta' })).toThrow(/mutually exclusive/i);
});

test('resolveVersion errors when channel does not exist', () => {
  expect(() => resolveVersion(fakeVersions, { channel: 'nonexistent' })).toThrow(/channel "nonexistent"/i);
});

test('resolveVersion errors when --version is not a valid semver', () => {
  expect(() => resolveVersion(fakeVersions, { version: 'not-a-version' })).toThrow(/invalid semver/i);
});

test('checkDeprecated returns matching entry when version is deprecated', () => {
  const r = checkDeprecated(fakeVersions, '1.1.0');
  expect(r).toEqual(fakeVersions.deprecated[0]);
});

test('checkDeprecated returns null when version is fine', () => {
  expect(checkDeprecated(fakeVersions, '1.2.3')).toBeNull();
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/versions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 写实现**

```ts
// src/lib/versions.ts
import semver from 'semver';

export interface ChannelEntry {
  version: string;
  tag: string;
  publishedAt: string;
  notes?: string;
}

export interface DeprecatedEntry {
  version: string;
  reason: string;
  fixedIn: string;
  deprecatedAt: string;
}

export interface VersionsJson {
  schemaVersion: number;
  channels: Record<string, ChannelEntry>;
  deprecated: DeprecatedEntry[];
  minSupportedVersion: string;
  peerRequirements: {
    claudeCode: string;
    node: string;
  };
}

export interface ResolveOpts {
  channel?: string;
  version?: string;
}

export type ResolvedVersion =
  | { tag: string; version: string; source: 'channel'; channel: string }
  | { tag: string; version: string; source: 'explicit-version' };

export function resolveVersion(v: VersionsJson, opts: ResolveOpts): ResolvedVersion {
  if (opts.version && opts.channel) {
    throw new Error('--version and --channel are mutually exclusive');
  }
  if (opts.version) {
    const clean = opts.version.replace(/^v/, '');
    if (!semver.valid(clean)) {
      throw new Error(`invalid semver: ${opts.version}`);
    }
    return { tag: `v${clean}`, version: clean, source: 'explicit-version' };
  }
  const channelName = opts.channel ?? 'latest';
  const entry = v.channels[channelName];
  if (!entry) {
    const available = Object.keys(v.channels).join(', ');
    throw new Error(`channel "${channelName}" not found (available: ${available})`);
  }
  return { tag: entry.tag, version: entry.version, source: 'channel', channel: channelName };
}

export function checkDeprecated(v: VersionsJson, version: string): DeprecatedEntry | null {
  return v.deprecated.find((d) => d.version === version) ?? null;
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/versions.test.ts
```

Expected: PASS — 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/versions.ts tests/versions.test.ts
git commit -m "feat(versions): add resolveVersion + checkDeprecated"
```

---

## Task 5: fetchVersions (network, with shallow-clone fallback)

**Files:**
- Modify: `src/lib/versions.ts`
- Modify: `tests/versions.test.ts`

- [ ] **Step 1: 加失败测试**

```ts
// tests/versions.test.ts — append at bottom
import { fetchVersions, type FetchVersionsDeps } from '../src/lib/versions.js';

test('fetchVersions uses raw URL first, returns parsed JSON', async () => {
  const deps: FetchVersionsDeps = {
    httpGet: async (url) => {
      expect(url).toContain('/-/raw/main/versions.json');
      return { ok: true, body: JSON.stringify(fakeVersions) };
    },
    shallowCloneVersionsJson: async () => { throw new Error('should not fallback'); },
  };
  const r = await fetchVersions(deps);
  expect(r.channels.latest.version).toBe('1.2.3');
});

test('fetchVersions falls back to shallow clone when raw URL fails', async () => {
  const deps: FetchVersionsDeps = {
    httpGet: async () => ({ ok: false, body: 'not found' }),
    shallowCloneVersionsJson: async () => JSON.stringify(fakeVersions),
  };
  const r = await fetchVersions(deps);
  expect(r.channels.latest.version).toBe('1.2.3');
});

test('fetchVersions throws when both raw URL and shallow clone fail', async () => {
  const deps: FetchVersionsDeps = {
    httpGet: async () => ({ ok: false, body: 'x' }),
    shallowCloneVersionsJson: async () => { throw new Error('git failed'); },
  };
  await expect(fetchVersions(deps)).rejects.toThrow(/versions\.json/i);
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/versions.test.ts
```

Expected: FAIL — `fetchVersions` not exported.

- [ ] **Step 3: 加实现**

Append to `src/lib/versions.ts`:

```ts
// --- fetchVersions: hit Codeup raw URL, fallback to shallow clone ---

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const RAW_URL =
  'https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init/-/raw/main/versions.json';

const CLONE_URL =
  'https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git';

export interface FetchVersionsDeps {
  httpGet: (url: string) => Promise<{ ok: boolean; body: string }>;
  shallowCloneVersionsJson: () => Promise<string>;
}

export const defaultFetchDeps: FetchVersionsDeps = {
  httpGet: async (url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return { ok: res.ok, body: await res.text() };
    } catch (e) {
      return { ok: false, body: e instanceof Error ? e.message : String(e) };
    }
  },
  shallowCloneVersionsJson: async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'foodmax-versions-'));
    try {
      await execFileAsync(
        'git',
        ['clone', '--depth=1', '--filter=blob:none', '--no-checkout', CLONE_URL, tmp],
        { timeout: 30_000 }
      );
      await execFileAsync('git', ['-C', tmp, 'checkout', 'main', '--', 'versions.json'], { timeout: 10_000 });
      return await readFile(join(tmp, 'versions.json'), 'utf8');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  },
};

export async function fetchVersions(deps: FetchVersionsDeps = defaultFetchDeps): Promise<VersionsJson> {
  const direct = await deps.httpGet(RAW_URL);
  if (direct.ok) {
    return JSON.parse(direct.body) as VersionsJson;
  }
  try {
    const body = await deps.shallowCloneVersionsJson();
    return JSON.parse(body) as VersionsJson;
  } catch (e) {
    throw new Error(
      `failed to fetch versions.json: raw URL failed (${direct.body}); shallow clone failed (${e instanceof Error ? e.message : String(e)})`
    );
  }
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/versions.test.ts
```

Expected: PASS — 12 tests pass total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/versions.ts tests/versions.test.ts
git commit -m "feat(versions): fetchVersions with raw URL + shallow-clone fallback"
```

---

## Task 6: Claude Code 版本检测

**Files:**
- Modify: `src/lib/claude-detect.ts`
- Create: `tests/claude-version-check.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/claude-version-check.test.ts
import { test, expect } from 'vitest';
import { requireClaudeVersion, parseDetectResultVersion } from '../src/lib/claude-detect.js';

test('parseDetectResultVersion extracts semver from successful detect', () => {
  expect(parseDetectResultVersion({ ok: true, version: '1.2.3 (Claude Code)' })).toBe('1.2.3');
});

test('parseDetectResultVersion returns null for failed detect', () => {
  expect(parseDetectResultVersion({ ok: false, error: 'not found' })).toBeNull();
});

test('requireClaudeVersion returns ok when version satisfies range', () => {
  const r = requireClaudeVersion({ ok: true, version: '1.5.0' }, '>=1.0.0');
  expect(r).toEqual({ ok: true, version: '1.5.0' });
});

test('requireClaudeVersion returns reason when version is too old', () => {
  const r = requireClaudeVersion({ ok: true, version: '0.9.0' }, '>=1.0.0');
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.reason).toMatch(/0\.9\.0/);
    expect(r.reason).toMatch(/>=1\.0\.0/);
  }
});

test('requireClaudeVersion returns reason when claude not detected', () => {
  const r = requireClaudeVersion({ ok: false, error: 'spawn claude ENOENT' }, '>=1.0.0');
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toMatch(/not detected/i);
});

test('requireClaudeVersion returns reason when version is unparseable', () => {
  const r = requireClaudeVersion({ ok: true, version: 'mystery build' }, '>=1.0.0');
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toMatch(/parse/i);
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/claude-version-check.test.ts
```

Expected: FAIL — `requireClaudeVersion`/`parseDetectResultVersion` not exported.

- [ ] **Step 3: 写实现**

Append to `src/lib/claude-detect.ts`:

```ts
import { parseClaudeVersion, satisfies } from './semver-util.js';

export function parseDetectResultVersion(r: DetectResult): string | null {
  if (!r.ok) return null;
  return parseClaudeVersion(r.version);
}

export type RequireResult =
  | { ok: true; version: string }
  | { ok: false; reason: string };

export function requireClaudeVersion(r: DetectResult, range: string): RequireResult {
  if (!r.ok) {
    return { ok: false, reason: `Claude Code not detected (${r.error})` };
  }
  const parsed = parseClaudeVersion(r.version);
  if (!parsed) {
    return { ok: false, reason: `failed to parse Claude Code version: "${r.version}"` };
  }
  if (!satisfies(parsed, range)) {
    return {
      ok: false,
      reason: `Claude Code ${parsed} does not satisfy required range ${range}. Upgrade Claude Code from https://claude.com/claude-code`,
    };
  }
  return { ok: true, version: parsed };
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/claude-version-check.test.ts
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude-detect.ts tests/claude-version-check.test.ts
git commit -m "feat(claude-detect): parse version + requireClaudeVersion range check"
```

---

## Task 7: Lockfile schema 扩展

**Files:**
- Modify: `src/lib/lockfile.ts`
- Modify: `tests/` (find existing lockfile/init tests to update)

- [ ] **Step 1: 写失败测试**

Locate existing `tests/lockfile.test.ts` or `tests/init.test.ts`. Add at end of an appropriate file (probably `tests/lockfile.test.ts` if exists, else inline new `tests/lockfile-channel.test.ts`):

```ts
// tests/lockfile-channel.test.ts
import { test, expect } from 'vitest';
import type { Lockfile } from '../src/lib/lockfile.js';

test('Lockfile type accepts optional channel + resolvedFrom fields', () => {
  // Compile-time type test: this should typecheck. Runtime is trivial.
  const sample: Lockfile = {
    version: 1,
    package: 'foodmax-ai-config',
    packageVersion: '1.2.3',
    rootHash: 'a'.repeat(64),
    tree: {},
    channel: 'latest',
    resolvedFrom: 'channel',
  };
  expect(sample.channel).toBe('latest');
  expect(sample.resolvedFrom).toBe('channel');
});

test('Lockfile remains valid without channel/resolvedFrom (backward compat)', () => {
  const sample: Lockfile = {
    version: 1,
    package: 'foodmax-ai-config',
    packageVersion: '0.1.0',
    rootHash: 'a'.repeat(64),
    tree: {},
  };
  expect(sample.channel).toBeUndefined();
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/lockfile-channel.test.ts
```

Expected: FAIL — `Type 'Lockfile' has no property 'channel'` (TS error) or runtime fail.

- [ ] **Step 3: 加字段到 Lockfile interface**

Find the `Lockfile` interface in `src/lib/lockfile.ts`. Add the two optional fields:

```ts
export interface Lockfile {
  version: number;
  package: string;
  packageVersion: string;
  rootHash: string;
  tree: Record<string, string>;
  /** Channel the version was resolved from, or undefined when --version was explicit. */
  channel?: string;
  /** How the version was selected. Undefined for pre-Sprint-1 lockfiles. */
  resolvedFrom?: 'channel' | 'explicit-version';
}
```

(Existing fields and order are kept; we add two optional fields at the end so old lockfiles still parse.)

- [ ] **Step 4: 跑测试看通过 + 全套**

```bash
pnpm test tests/lockfile-channel.test.ts
pnpm test  # full suite — make sure no existing test breaks
```

Expected: PASS — 2 new tests pass; existing 76 still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lockfile.ts tests/lockfile-channel.test.ts
git commit -m "feat(lockfile): add channel + resolvedFrom fields (optional)"
```

---

## Task 8: init.ts 加 --version / --channel

**Files:**
- Modify: `src/commands/init.ts`
- Modify: `src/cli.ts`
- Modify: `tests/init.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `tests/init.test.ts`:

```ts
// at bottom of tests/init.test.ts
import type { VersionsJson } from '../src/lib/versions.js';

const fakeVersionsJson: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '1.2.3', tag: 'v1.2.3', publishedAt: '2026-05-26T00:00:00Z' },
    beta: { version: '1.3.0-rc.1', tag: 'v1.3.0-rc.1', publishedAt: '2026-05-25T00:00:00Z' },
  },
  deprecated: [],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

const fakeFetchVersions = async () => fakeVersionsJson;

test('init --version 1.2.3 installs that specific tag', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    fetchVersions: fakeFetchVersions,
    version: '1.2.3',
  });
  const npmInstallCall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstallCall).toBeDefined();
  expect(npmInstallCall![1].join(' ')).toContain('#v1.2.3');
});

test('init --channel beta installs the beta tag', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    fetchVersions: fakeFetchVersions,
    channel: 'beta',
  });
  const npmInstallCall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstallCall![1].join(' ')).toContain('#v1.3.0-rc.1');
});

test('init default (no flag) resolves latest channel', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    fetchVersions: fakeFetchVersions,
  });
  const npmInstallCall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstallCall![1].join(' ')).toContain('#v1.2.3');
});

test('init records channel + resolvedFrom in .foodmax-ai.lock.json', async () => {
  await runInit({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunInit,
    fetchVersions: fakeFetchVersions,
    channel: 'beta',
  });
  const lock = JSON.parse(readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8'));
  expect(lock.channel).toBe('beta');
  expect(lock.resolvedFrom).toBe('channel');
});

test('init --version with --channel errors', async () => {
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      fetchVersions: fakeFetchVersions,
      version: '1.2.3',
      channel: 'beta',
    })
  ).rejects.toThrow(/mutually exclusive/i);
});

test('init blocks when Claude Code version is below peerRequirements', async () => {
  await expect(
    runInit({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunInit,
      claudeDetect: async () => ({ ok: true as const, version: '0.5.0' }),
      fetchVersions: fakeFetchVersions,
    })
  ).rejects.toThrow(/Claude Code 0\.5\.0.*>=1\.0\.0/);
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/init.test.ts
```

Expected: FAIL — `version`/`channel`/`fetchVersions` options don't exist on `RunInitOptions`.

- [ ] **Step 3: 改 init.ts**

Modify `src/commands/init.ts`:

(a) Add imports at top:
```ts
import { fetchVersions as defaultFetchVersions, resolveVersion, type VersionsJson } from '../lib/versions.js';
import { requireClaudeVersion } from '../lib/claude-detect.js';
```

(b) Extend `RunInitOptions`:
```ts
export interface RunInitOptions {
  // ... existing fields ...
  /** Pin to a specific semver. Mutually exclusive with channel. */
  version?: string;
  /** Pick a channel from versions.json (default: latest). Mutually exclusive with version. */
  channel?: string;
  /** Inject for tests: avoid network. */
  fetchVersions?: () => Promise<VersionsJson>;
}
```

(c) In `runInit`, after the `claudeR = await detect()` block, add:

```ts
  // Fetch versions metadata + resolve target tag
  const fetchV = opts.fetchVersions ?? (() => defaultFetchVersions());
  const versionsJson = await fetchV();

  // Enforce peer requirements before doing anything else
  const claudeReq = requireClaudeVersion(claudeR, versionsJson.peerRequirements.claudeCode);
  if (!claudeReq.ok) {
    throw new Error(claudeReq.reason);
  }

  const resolved = resolveVersion(versionsJson, { version: opts.version, channel: opts.channel });
```

(d) Replace the existing `npm install --no-save SOURCE` line. Find the `await exec('npm', ['install', '--no-save', SOURCE], ...)` call and change it to use `resolved.tag`:

```ts
  const installUrl = `${SOURCE}#${resolved.tag}`;
  await exec('npm', ['install', '--no-save', installUrl], { cwd: opts.cwd, timeout: 120_000 });
```

(e) In the lockfile-writing section (search for `writeLockfile` or `JSON.stringify(lock`), add the two new fields:

```ts
  const lock: Lockfile = {
    version: 1,
    package: PACKAGE_NAME,
    packageVersion: /* existing */,
    rootHash: /* existing */,
    tree: /* existing */,
    channel: resolved.source === 'channel' ? resolved.channel : undefined,
    resolvedFrom: resolved.source,
  };
```

(Don't include keys with undefined — drop the `channel` field if `resolved.source === 'explicit-version'`. Use a conditional spread:)

```ts
  const lock: Lockfile = {
    version: 1,
    package: PACKAGE_NAME,
    packageVersion: resolved.version,
    rootHash: /* existing */,
    tree: /* existing */,
    ...(resolved.source === 'channel' ? { channel: resolved.channel } : {}),
    resolvedFrom: resolved.source,
  };
```

- [ ] **Step 4: 改 cli.ts 把 flag 暴露**

In `src/cli.ts`, find the `init` command definition (search for `program.command('init')`). Add two options before `.action`:

```ts
program
  .command('init')
  // ... existing options ...
  .option('--version <semver>', 'Pin to a specific version (e.g., 1.2.3). Mutually exclusive with --channel')
  .option('--channel <name>', 'Pick a channel from versions.json (default: latest)')
  .action(async (cmdOpts) => {
    await runInit({
      cwd: process.cwd(),
      yes: cmdOpts.yes,
      version: cmdOpts.version,
      channel: cmdOpts.channel,
    });
  });
```

**Caveat:** `--version` conflicts with commander's built-in `--version`. If commander complains, rename the program-level builtin: `program.version(readPackageVersion(), '-V, --pkg-version')` so command-level `--version` is free. Verify by running `node dist/cli.js init --help` after build.

- [ ] **Step 5: 跑全套测试 + 提交**

```bash
pnpm test
pnpm typecheck
git add src/commands/init.ts src/cli.ts tests/init.test.ts
git commit -m "feat(init): --version and --channel flags + Claude version gate"
```

Expected: All tests pass (old + 6 new). Typecheck clean.

---

## Task 9: update.ts 加 --version / --channel

**Files:**
- Modify: `src/commands/update.ts`
- Modify: `src/cli.ts`
- Modify: `tests/update.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `tests/update.test.ts`:

```ts
import type { VersionsJson } from '../src/lib/versions.js';

const updateFakeVersions: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '1.2.3', tag: 'v1.2.3', publishedAt: '2026-05-26T00:00:00Z' },
    beta: { version: '1.3.0-rc.1', tag: 'v1.3.0-rc.1', publishedAt: '2026-05-25T00:00:00Z' },
  },
  deprecated: [
    { version: '1.1.0', reason: 'critical bug', fixedIn: '1.1.1', deprecatedAt: '2026-05-10T00:00:00Z' },
  ],
  minSupportedVersion: '1.0.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

test('update --version 1.2.3 installs that specific tag', async () => {
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunUpdate,
    fetchVersions: async () => updateFakeVersions,
    version: '1.2.3',
  });
  const npmInstallCall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstallCall![1].join(' ')).toContain('#v1.2.3');
});

test('update default uses latest channel', async () => {
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunUpdate,
    fetchVersions: async () => updateFakeVersions,
  });
  const npmInstallCall = execCalls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'install');
  expect(npmInstallCall![1].join(' ')).toContain('#v1.2.3');
});

test('update warns when installing a deprecated version', async () => {
  const logs: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => logs.push(msg);
  try {
    await runUpdate({
      cwd: project.dir,
      packageRootOverride: pkgRoot,
      ...baseRunUpdate,
      fetchVersions: async () => updateFakeVersions,
      version: '1.1.0',
    });
  } finally {
    console.warn = origWarn;
  }
  expect(logs.some((l) => /deprecated/i.test(l))).toBe(true);
  expect(logs.some((l) => /1\.1\.1/.test(l))).toBe(true);
});

test('update updates lockfile channel + resolvedFrom on channel switch', async () => {
  await runUpdate({
    cwd: project.dir,
    packageRootOverride: pkgRoot,
    ...baseRunUpdate,
    fetchVersions: async () => updateFakeVersions,
    channel: 'beta',
  });
  const lock = JSON.parse(readFileSync(join(project.dir, '.foodmax-ai.lock.json'), 'utf8'));
  expect(lock.channel).toBe('beta');
  expect(lock.resolvedFrom).toBe('channel');
});
```

**Note:** baseRunUpdate currently injects `larkCliPresent` + `listMcpNames`. Make sure tests pass them. If a test fixture object doesn't exist, look at how `tests/update.test.ts` set up earlier tests and follow that pattern.

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/update.test.ts
```

Expected: FAIL — same as init: options don't exist.

- [ ] **Step 3: 改 update.ts**

Modify `src/commands/update.ts` symmetrically with Task 8 Step 3:

(a) Imports:
```ts
import { fetchVersions as defaultFetchVersions, resolveVersion, checkDeprecated, type VersionsJson } from '../lib/versions.js';
import { requireClaudeVersion } from '../lib/claude-detect.js';
import { warn } from '../lib/log.js';
```

(b) Extend `RunUpdateOptions` with `version?`, `channel?`, `fetchVersions?`.

(c) In `runUpdate`, add after the existing claude-detect:

```ts
  const fetchV = opts.fetchVersions ?? (() => defaultFetchVersions());
  const versionsJson = await fetchV();

  const claudeReq = requireClaudeVersion(claudeR, versionsJson.peerRequirements.claudeCode);
  if (!claudeReq.ok) throw new Error(claudeReq.reason);

  const resolved = resolveVersion(versionsJson, { version: opts.version, channel: opts.channel });

  // Warn if user is pinning to a deprecated version
  const dep = checkDeprecated(versionsJson, resolved.version);
  if (dep) {
    console.warn(warn(`⚠️  v${dep.version} is deprecated: ${dep.reason}. Fixed in v${dep.fixedIn}.`));
  }
```

(d) Same `npm install` URL change + lockfile fields as Task 8 Step 3 (d) and (e).

- [ ] **Step 4: 改 cli.ts**

Add `.option('--version <semver>', ...)` and `.option('--channel <name>', ...)` to the `update` command. Pass through to `runUpdate`.

- [ ] **Step 5: 跑测试 + 提交**

```bash
pnpm test
pnpm typecheck
git add src/commands/update.ts src/cli.ts tests/update.test.ts
git commit -m "feat(update): --version and --channel flags + deprecation warnings"
```

Expected: all tests pass.

---

## Task 10: package.json peerDependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 加字段**

Add to `package.json` (between `engines` and `dependencies`, or wherever makes sense):

```json
  "peerDependencies": {
    "@anthropic-ai/claude-code": ">=1.0.0"
  },
```

Note: this is **declarative only**. npm won't enforce it (we don't expect Claude Code to be an npm dep at all). The CLI reads `peerRequirements.claudeCode` from `versions.json` at runtime — `peerDependencies` here is for human readability + future tooling.

- [ ] **Step 2: 跑测试套确认无破坏**

```bash
pnpm test
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(deps): declare Claude Code peerDependency for human readability"
```

---

## Task 11: README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 加 --version/--channel 用法**

In `README.md`, find the "第一次设置" section. After the existing `npx -y ... init` block, add:

````markdown
**装特定版本：**

```bash
# 装某个 release
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init --version 1.2.3

# 装 beta channel (尝鲜)
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git init --channel beta
```

可用 channel 在 [versions.json](versions.json) 里查。`update` 命令支持同样的 flag。
````

In "同步最新规则" section, add after the existing `update` example:

````markdown
**升降级到指定版本：**

```bash
npx foodmax-ai update --version 1.2.3   # 强制装 1.2.3
npx foodmax-ai update --channel beta    # 切到 beta channel
```

如果你装的版本被维护者标记为 deprecated，`update` 会在 stdout 警告并给出建议升级目标。
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document --version / --channel flags"
```

---

## Task 12: 端到端冒烟测试 (本地)

**Files:** none — manual verification.

- [ ] **Step 1: 跑全套测试**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass; `dist/cli.js` rebuilt.

- [ ] **Step 2: 验证 `--help` 显示 flag**

```bash
node dist/cli.js init --help
node dist/cli.js update --help
```

Expected output should contain `--version <semver>` and `--channel <name>` for both commands.

- [ ] **Step 3: 验证 `--version` 错误路径**

```bash
node dist/cli.js init --version not-a-version --channel beta
```

Expected: error message "mutually exclusive" (because both passed), or "invalid semver" if you drop --channel.

- [ ] **Step 4: 重新打 .locked.json（如果需要）**

```bash
pnpm lock
```

If `.locked.json` content changed because of the new lockfile fields propagating, commit:

```bash
git add .locked.json
git commit -m "chore: relock after Sprint 1 lockfile schema extension"
```

Otherwise skip.

---

## Definition of Done (Sprint 1)

- All 12 tasks committed
- `pnpm test` green (target: ~92 tests, +16 new)
- `pnpm typecheck` clean
- `pnpm build` succeeds
- Manual smoke: `init --help` and `update --help` show new flags
- Spec §6 G1, G2 verified (G1: `init --version` works; G2: old Claude Code is rejected)
- versions.json committed; downstream Sprint 2 can build on it

## Out-of-Scope for Sprint 1 (deferred to later sprints)

- versions.json **automatic** maintenance by CI (Sprint 2)
- Tag signature verification (Sprint 3)
- Network retry / mirror fallback (Sprint 4)
- Lockfile v2 schema migration (Sprint 4)
- Pushing v0.1.0 tag (Sprint 2 release pipeline does it automatically; if needed before Sprint 2 completes, maintainer manually tags)
