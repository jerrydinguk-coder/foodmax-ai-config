# Sprint 2: 发布自动化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 维护者 merge PR → Codeup CI 自动 bump version + 写 CHANGELOG + tag + push + 更新 versions.json，无任何手动 git tag 步骤。

**Architecture:**
- 用 [changesets](https://github.com/changesets/changesets) 作为变更声明工具（每个 PR 带 `.changeset/*.md`）
- 因为 `changesets-action` 只跑在 GitHub，自写 2 个 TypeScript 脚本替代它：`version-packages.ts`（累积 changesets→bump→CHANGELOG）和 `release.ts`（tag→push→versions.json 更新）
- Codeup Pipelines 调度：test on PR; version-packages on merge to main; release on merge of "Version Packages" PR

**Tech Stack:** TypeScript + tsx + vitest + @changesets/cli + simple-git (for scriptable git ops) + Codeup Pipelines YAML

**前置文档**：
- [设计 spec](../specs/2026-05-26-version-management-production-grade-design.md) §7
- [Sprint 1 plan](./2026-05-26-sprint-1-version-semantics.md)（已完成；引入了 versions.json）

---

## File Structure

**Create:**
- `.changeset/config.json` — changesets 配置
- `.changeset/README.md` — changesets 自带文档（init 时生成）
- `src/scripts/version-packages.ts` — 累积 changesets，更新 package.json + CHANGELOG.md
- `src/scripts/release.ts` — git tag + push + 更新 versions.json
- `src/lib/changelog.ts` — CHANGELOG.md 操作工具（read、prepend、解析）
- `src/lib/versions-write.ts` — versions.json 写入工具（更新 channels.latest）
- `tests/changelog.test.ts`
- `tests/versions-write.test.ts`
- `tests/version-packages-script.test.ts`
- `tests/release-script.test.ts`
- `CHANGELOG.md` — 初始内容（v0.1.0 entry）
- `RELEASING.md` — 维护者 SOP
- `.codeup-ci.yml` — Codeup Pipelines 配置
- `commitlint.config.js` — commitlint 规则
- `.husky/pre-commit` 和 `.husky/commit-msg` — git hooks

**Modify:**
- `package.json` — 加 `@changesets/cli`、`@commitlint/cli`、`@commitlint/config-conventional`、`husky`、`simple-git` deps；加 `release` / `changeset` scripts
- `README.md` — 维护者章节加 changesets 用法

**Delete (after migrating to .codeup-ci.yml):**
- `.github/workflows/test.yml` — 是死代码（无 GitHub 远端），统一到 Codeup pipeline

---

## Task 1: 装依赖 + changesets init

**Files:**
- Modify: `package.json` (via pnpm add)
- Create: `.changeset/config.json`、`.changeset/README.md`（由 init 命令生成）

- [ ] **Step 1: 装依赖**

```bash
cd /Users/epingpong/CodeBuddy/foodmax-dev-env-init
pnpm add -D @changesets/cli @commitlint/cli @commitlint/config-conventional husky simple-git
```

- [ ] **Step 2: 初始化 changesets**

```bash
pnpm changeset init
```

This creates `.changeset/config.json` and `.changeset/README.md`.

- [ ] **Step 3: 改 changesets 配置不发 npm**

Edit `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": ["@changesets/changelog-git", { "repo": "kos/dev-tools/foodmax-ai-config-init" }],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "private",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Critical: `"access": "private"` and we never run `pnpm changeset publish` so no npm publish risk. We use changesets only for version bumping + CHANGELOG.

- [ ] **Step 4: 跑测试套确认没破坏**

```bash
pnpm test && pnpm typecheck
```

Expected: 114 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .changeset/
git commit -m "chore(release): scaffold changesets + commitlint + husky deps"
```

---

## Task 2: src/lib/changelog.ts

**Files:**
- Create: `src/lib/changelog.ts`
- Create: `tests/changelog.test.ts`

CHANGELOG 操作：read existing content, prepend a new section, find latest version, etc. Used by both version-packages and release scripts.

- [ ] **Step 1: 写失败测试**

```ts
// tests/changelog.test.ts
import { test, expect } from 'vitest';
import {
  prependChangelogEntry,
  parseLatestVersion,
  type ChangelogEntry,
} from '../src/lib/changelog.js';

test('prependChangelogEntry inserts after H1, preserves rest', () => {
  const existing = `# CHANGELOG\n\n## [1.0.0] - 2026-01-01\n\n### Added\n- thing\n`;
  const entry: ChangelogEntry = {
    version: '1.1.0',
    date: '2026-02-01',
    sections: {
      Added: ['new feature'],
      Fixed: ['bug 1', 'bug 2'],
    },
  };
  const result = prependChangelogEntry(existing, entry);
  expect(result).toMatch(/^# CHANGELOG/);
  // New entry comes before old
  const newIdx = result.indexOf('[1.1.0]');
  const oldIdx = result.indexOf('[1.0.0]');
  expect(newIdx).toBeGreaterThan(0);
  expect(newIdx).toBeLessThan(oldIdx);
  expect(result).toContain('### Added\n- new feature');
  expect(result).toContain('### Fixed\n- bug 1\n- bug 2');
});

test('prependChangelogEntry handles empty changelog (just H1)', () => {
  const existing = `# CHANGELOG\n`;
  const entry: ChangelogEntry = {
    version: '0.1.0',
    date: '2026-05-26',
    sections: { Added: ['initial release'] },
  };
  const result = prependChangelogEntry(existing, entry);
  expect(result).toContain('# CHANGELOG');
  expect(result).toContain('## [0.1.0] - 2026-05-26');
});

test('prependChangelogEntry omits empty sections', () => {
  const existing = `# CHANGELOG\n`;
  const entry: ChangelogEntry = {
    version: '1.0.0',
    date: '2026-05-26',
    sections: { Added: ['x'], Fixed: [], Removed: [] },
  };
  const result = prependChangelogEntry(existing, entry);
  expect(result).toContain('### Added');
  expect(result).not.toContain('### Fixed');
  expect(result).not.toContain('### Removed');
});

test('prependChangelogEntry includes special "MCP 参数变更" section when present', () => {
  const existing = `# CHANGELOG\n`;
  const entry: ChangelogEntry = {
    version: '1.0.0',
    date: '2026-05-26',
    sections: { Changed: ['x'], 'MCP 参数变更 ⚠️': ['playwright @latest → @1.0.5'] },
  };
  const result = prependChangelogEntry(existing, entry);
  expect(result).toContain('### MCP 参数变更 ⚠️');
  expect(result).toContain('playwright @latest → @1.0.5');
  // Confirm the MCP section warns about --force-mcp
  expect(result).toMatch(/--force-mcp/);
});

test('parseLatestVersion returns first version found', () => {
  const md = `# CHANGELOG\n\n## [1.2.3] - 2026-05-26\n...\n## [1.0.0] - 2026-01-01\n`;
  expect(parseLatestVersion(md)).toBe('1.2.3');
});

test('parseLatestVersion returns null when no versions present', () => {
  expect(parseLatestVersion(`# CHANGELOG\n`)).toBeNull();
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/changelog.test.ts
```

- [ ] **Step 3: 写实现**

```ts
// src/lib/changelog.ts

export interface ChangelogEntry {
  version: string;
  date: string;  // YYYY-MM-DD
  sections: Record<string, string[]>;
}

const MCP_SECTION_KEY_PATTERN = /MCP\s*参数变更/;
const MCP_FORCE_MCP_NOTE =
  '\n> ⚠️ 上面这条修改了 MCP 注册参数，请同事用 `npx foodmax-ai update --force-mcp` 升级。';

export function prependChangelogEntry(existing: string, entry: ChangelogEntry): string {
  const lines: string[] = [`## [${entry.version}] - ${entry.date}`, ''];

  for (const [section, items] of Object.entries(entry.sections)) {
    if (items.length === 0) continue;
    lines.push(`### ${section}`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    if (MCP_SECTION_KEY_PATTERN.test(section)) {
      lines.push(MCP_FORCE_MCP_NOTE);
    }
    lines.push('');
  }

  const entryMd = lines.join('\n');

  // Find H1 line; insert entry after it (with blank line padding)
  const h1Match = existing.match(/^# .+$/m);
  if (!h1Match) {
    // No H1 — just prepend
    return `# CHANGELOG\n\n${entryMd}\n${existing}`.replace(/\n{3,}/g, '\n\n');
  }
  const h1End = (h1Match.index ?? 0) + h1Match[0].length;
  const before = existing.slice(0, h1End);
  const after = existing.slice(h1End);
  return `${before}\n\n${entryMd}\n${after}`.replace(/\n{3,}/g, '\n\n');
}

export function parseLatestVersion(md: string): string | null {
  const m = md.match(/##\s+\[([^\]]+)\]/);
  return m ? m[1] : null;
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/changelog.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/changelog.ts tests/changelog.test.ts
git commit -m "feat(changelog): prepend entry + parse latest version helpers"
```

---

## Task 3: src/lib/versions-write.ts

**Files:**
- Create: `src/lib/versions-write.ts`
- Create: `tests/versions-write.test.ts`

versions.json 写入工具：更新 `channels.latest` 指向新 tag。release 脚本调用。

- [ ] **Step 1: 写失败测试**

```ts
// tests/versions-write.test.ts
import { test, expect } from 'vitest';
import {
  updateLatestChannel,
  updateChannel,
  type VersionsJson,
} from '../src/lib/versions-write.js';

const base: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '0.1.0', tag: 'v0.1.0', publishedAt: '2026-01-01T00:00:00Z' },
    beta: { version: '0.2.0-rc.1', tag: 'v0.2.0-rc.1', publishedAt: '2026-02-01T00:00:00Z' },
  },
  deprecated: [],
  minSupportedVersion: '0.1.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

test('updateLatestChannel updates latest with new version + tag + timestamp', () => {
  const next = updateLatestChannel(base, '1.0.0', '2026-05-26T10:00:00Z');
  expect(next.channels.latest).toEqual({
    version: '1.0.0',
    tag: 'v1.0.0',
    publishedAt: '2026-05-26T10:00:00Z',
  });
  // beta is unchanged
  expect(next.channels.beta).toEqual(base.channels.beta);
});

test('updateLatestChannel does not mutate input', () => {
  const original = JSON.parse(JSON.stringify(base));
  updateLatestChannel(base, '1.0.0', '2026-05-26T10:00:00Z');
  expect(base).toEqual(original);
});

test('updateChannel works for arbitrary channel name (e.g., beta)', () => {
  const next = updateChannel(base, 'beta', '0.3.0-rc.1', '2026-05-26T10:00:00Z');
  expect(next.channels.beta).toEqual({
    version: '0.3.0-rc.1',
    tag: 'v0.3.0-rc.1',
    publishedAt: '2026-05-26T10:00:00Z',
  });
  expect(next.channels.latest).toEqual(base.channels.latest);
});

test('updateChannel creates new channel if not present', () => {
  const next = updateChannel(base, 'lts', '0.1.5', '2026-05-26T10:00:00Z');
  expect(next.channels.lts).toBeDefined();
  expect(next.channels.lts!.version).toBe('0.1.5');
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/versions-write.test.ts
```

- [ ] **Step 3: 写实现**

```ts
// src/lib/versions-write.ts
import type { VersionsJson, ChannelEntry } from './versions.js';
export type { VersionsJson, ChannelEntry } from './versions.js';

export function updateLatestChannel(
  current: VersionsJson,
  newVersion: string,
  publishedAt: string
): VersionsJson {
  return updateChannel(current, 'latest', newVersion, publishedAt);
}

export function updateChannel(
  current: VersionsJson,
  channelName: string,
  newVersion: string,
  publishedAt: string
): VersionsJson {
  const tag = newVersion.startsWith('v') ? newVersion : `v${newVersion}`;
  const version = newVersion.replace(/^v/, '');
  const nextEntry: ChannelEntry = { version, tag, publishedAt };
  return {
    ...current,
    channels: {
      ...current.channels,
      [channelName]: nextEntry,
    },
  };
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/versions-write.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/versions-write.ts tests/versions-write.test.ts
git commit -m "feat(versions): updateLatestChannel + updateChannel writers"
```

---

## Task 4: src/scripts/version-packages.ts

**Files:**
- Create: `src/scripts/version-packages.ts`
- Create: `tests/version-packages-script.test.ts`

This script wraps `pnpm changeset version` (which bumps package.json + writes CHANGELOG.md) and then commits the result. Runs in CI on merge to main when `.changeset/*.md` files exist.

Pure logic factor: the script's IO (read changesets, run `changeset version`, commit) is unit-testable when factored as dependency injection. The script's main entry point just wires it.

- [ ] **Step 1: 写失败测试**

```ts
// tests/version-packages-script.test.ts
import { test, expect } from 'vitest';
import { runVersionPackages, type VersionPackagesDeps } from '../src/scripts/version-packages.js';

function makeDeps(overrides: Partial<VersionPackagesDeps> = {}): {
  deps: VersionPackagesDeps;
  calls: Record<string, unknown[]>;
} {
  const calls = {
    listChangesets: [] as string[],
    runChangesetVersion: [] as void[],
    gitAdd: [] as string[][],
    gitCommit: [] as string[],
    gitPush: [] as string[],
  };
  const deps: VersionPackagesDeps = {
    listChangesets: async () => {
      calls.listChangesets.push('called');
      return ['fix-thing.md', 'add-other.md'];
    },
    runChangesetVersion: async () => {
      calls.runChangesetVersion.push(undefined);
    },
    gitAdd: async (paths) => {
      calls.gitAdd.push(paths);
    },
    gitCommit: async (msg) => {
      calls.gitCommit.push(msg);
    },
    gitPush: async (branch) => {
      calls.gitPush.push(branch);
    },
    ...overrides,
  };
  return { deps, calls };
}

test('runVersionPackages skips when no changesets present', async () => {
  const { deps, calls } = makeDeps({
    listChangesets: async () => [],
  });
  const result = await runVersionPackages(deps);
  expect(result.didBump).toBe(false);
  expect(calls.runChangesetVersion.length).toBe(0);
  expect(calls.gitCommit.length).toBe(0);
});

test('runVersionPackages: changesets present → version + commit + push', async () => {
  const { deps, calls } = makeDeps();
  const result = await runVersionPackages(deps);
  expect(result.didBump).toBe(true);
  expect(calls.runChangesetVersion.length).toBe(1);
  expect(calls.gitAdd[0]).toContain('package.json');
  expect(calls.gitAdd[0]).toContain('CHANGELOG.md');
  expect(calls.gitCommit[0]).toMatch(/chore.*version packages/i);
  expect(calls.gitPush[0]).toBe('main');
});

test('runVersionPackages commit message ends with [skip ci] so it does not re-trigger CI', async () => {
  const { deps, calls } = makeDeps();
  await runVersionPackages(deps);
  expect(calls.gitCommit[0]).toMatch(/\[skip ci\]/);
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/version-packages-script.test.ts
```

- [ ] **Step 3: 写实现**

```ts
// src/scripts/version-packages.ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VersionPackagesDeps {
  /** Returns array of changeset filenames (e.g., ['fix-thing.md']). */
  listChangesets: () => Promise<string[]>;
  /** Runs `pnpm changeset version` which writes package.json + CHANGELOG.md. */
  runChangesetVersion: () => Promise<void>;
  gitAdd: (paths: string[]) => Promise<void>;
  gitCommit: (msg: string) => Promise<void>;
  gitPush: (branch: string) => Promise<void>;
}

export interface RunVersionPackagesResult {
  didBump: boolean;
}

export const defaultDeps: VersionPackagesDeps = {
  listChangesets: async () => {
    try {
      const all = await readdir('.changeset');
      return all.filter((f) => f.endsWith('.md') && f !== 'README.md');
    } catch {
      return [];
    }
  },
  runChangesetVersion: async () => {
    await execFileAsync('pnpm', ['changeset', 'version'], { timeout: 60_000 });
  },
  gitAdd: async (paths) => {
    await execFileAsync('git', ['add', ...paths], { timeout: 10_000 });
  },
  gitCommit: async (msg) => {
    await execFileAsync('git', ['commit', '-m', msg], { timeout: 10_000 });
  },
  gitPush: async (branch) => {
    await execFileAsync('git', ['push', 'origin', branch], { timeout: 60_000 });
  },
};

export async function runVersionPackages(
  deps: VersionPackagesDeps = defaultDeps
): Promise<RunVersionPackagesResult> {
  const changesets = await deps.listChangesets();
  if (changesets.length === 0) {
    console.log('No changesets found; skipping version bump.');
    return { didBump: false };
  }
  console.log(`Found ${changesets.length} changeset(s); bumping version…`);
  await deps.runChangesetVersion();
  await deps.gitAdd(['package.json', 'CHANGELOG.md', '.changeset/']);
  await deps.gitCommit('chore(release): version packages [skip ci]');
  await deps.gitPush('main');
  return { didBump: true };
}

// Entry point (called via `tsx src/scripts/version-packages.ts`)
if (import.meta.url === `file://${process.argv[1]}`) {
  runVersionPackages().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/version-packages-script.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/version-packages.ts tests/version-packages-script.test.ts
git commit -m "feat(release): version-packages script (changeset accumulate + commit)"
```

---

## Task 5: src/scripts/release.ts

**Files:**
- Create: `src/scripts/release.ts`
- Create: `tests/release-script.test.ts`

This script runs AFTER the "Version Packages" commit lands on main. It:
1. Reads current `package.json` version
2. Verifies CHANGELOG.md has an entry for that version
3. Creates an annotated git tag `vX.Y.Z`
4. Pushes the tag
5. Updates `versions.json` to point `channels.latest` at the new tag
6. Commits + pushes versions.json change (with `[skip ci]`)

- [ ] **Step 1: 写失败测试**

```ts
// tests/release-script.test.ts
import { test, expect } from 'vitest';
import { runRelease, type ReleaseDeps } from '../src/scripts/release.js';
import type { VersionsJson } from '../src/lib/versions.js';

const baseVersions: VersionsJson = {
  schemaVersion: 1,
  channels: {
    latest: { version: '0.1.0', tag: 'v0.1.0', publishedAt: '2026-01-01T00:00:00Z' },
  },
  deprecated: [],
  minSupportedVersion: '0.1.0',
  peerRequirements: { claudeCode: '>=1.0.0', node: '>=18.0.0' },
};

function makeDeps(overrides: Partial<ReleaseDeps> = {}): {
  deps: ReleaseDeps;
  calls: Record<string, unknown[]>;
  writtenVersions: { current?: VersionsJson };
} {
  const writtenVersions: { current?: VersionsJson } = {};
  const calls = {
    tagCreate: [] as string[],
    tagPush: [] as string[],
    gitAdd: [] as string[][],
    gitCommit: [] as string[],
    gitPush: [] as string[],
  };
  const deps: ReleaseDeps = {
    readPackageVersion: async () => '0.2.0',
    readChangelog: async () => `# CHANGELOG\n\n## [0.2.0] - 2026-05-26\n\n### Added\n- thing\n`,
    readVersionsJson: async () => baseVersions,
    writeVersionsJson: async (v) => {
      writtenVersions.current = v;
    },
    now: () => '2026-05-26T10:00:00Z',
    tagCreate: async (tag, msg) => {
      calls.tagCreate.push(tag);
    },
    tagPush: async (tag) => {
      calls.tagPush.push(tag);
    },
    gitAdd: async (paths) => {
      calls.gitAdd.push(paths);
    },
    gitCommit: async (msg) => {
      calls.gitCommit.push(msg);
    },
    gitPush: async (branch) => {
      calls.gitPush.push(branch);
    },
    ...overrides,
  };
  return { deps, calls, writtenVersions };
}

test('runRelease creates annotated tag v<version> and pushes it', async () => {
  const { deps, calls } = makeDeps();
  await runRelease(deps);
  expect(calls.tagCreate).toEqual(['v0.2.0']);
  expect(calls.tagPush).toEqual(['v0.2.0']);
});

test('runRelease updates versions.json latest channel + commits with [skip ci]', async () => {
  const { deps, calls, writtenVersions } = makeDeps();
  await runRelease(deps);
  expect(writtenVersions.current!.channels.latest).toEqual({
    version: '0.2.0',
    tag: 'v0.2.0',
    publishedAt: '2026-05-26T10:00:00Z',
  });
  expect(calls.gitAdd[0]).toContain('versions.json');
  expect(calls.gitCommit[0]).toMatch(/release.*v0\.2\.0.*\[skip ci\]/i);
  expect(calls.gitPush[0]).toBe('main');
});

test('runRelease fails when CHANGELOG.md has no entry for current package version', async () => {
  const { deps } = makeDeps({
    readPackageVersion: async () => '0.3.0',
    readChangelog: async () => `# CHANGELOG\n\n## [0.2.0] - 2026-05-26\n`,
  });
  await expect(runRelease(deps)).rejects.toThrow(/CHANGELOG.*0\.3\.0/);
});

test('runRelease idempotent: if tag already exists locally, fails clearly', async () => {
  const { deps } = makeDeps({
    tagCreate: async () => {
      throw new Error("fatal: tag 'v0.2.0' already exists");
    },
  });
  await expect(runRelease(deps)).rejects.toThrow(/already exists/);
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm test tests/release-script.test.ts
```

- [ ] **Step 3: 写实现**

```ts
// src/scripts/release.ts
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { VersionsJson } from '../lib/versions.js';
import { updateLatestChannel } from '../lib/versions-write.js';
import { parseLatestVersion } from '../lib/changelog.js';

const execFileAsync = promisify(execFile);

export interface ReleaseDeps {
  readPackageVersion: () => Promise<string>;
  readChangelog: () => Promise<string>;
  readVersionsJson: () => Promise<VersionsJson>;
  writeVersionsJson: (v: VersionsJson) => Promise<void>;
  now: () => string;  // ISO timestamp
  tagCreate: (tag: string, msg: string) => Promise<void>;
  tagPush: (tag: string) => Promise<void>;
  gitAdd: (paths: string[]) => Promise<void>;
  gitCommit: (msg: string) => Promise<void>;
  gitPush: (branch: string) => Promise<void>;
}

export const defaultDeps: ReleaseDeps = {
  readPackageVersion: async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    return pkg.version as string;
  },
  readChangelog: async () => readFile('CHANGELOG.md', 'utf8'),
  readVersionsJson: async () =>
    JSON.parse(await readFile('versions.json', 'utf8')) as VersionsJson,
  writeVersionsJson: async (v) =>
    writeFile('versions.json', JSON.stringify(v, null, 2) + '\n'),
  now: () => new Date().toISOString(),
  tagCreate: async (tag, msg) => {
    await execFileAsync('git', ['tag', '-a', tag, '-m', msg], { timeout: 10_000 });
  },
  tagPush: async (tag) => {
    await execFileAsync('git', ['push', 'origin', tag], { timeout: 60_000 });
  },
  gitAdd: async (paths) => {
    await execFileAsync('git', ['add', ...paths], { timeout: 10_000 });
  },
  gitCommit: async (msg) => {
    await execFileAsync('git', ['commit', '-m', msg], { timeout: 10_000 });
  },
  gitPush: async (branch) => {
    await execFileAsync('git', ['push', 'origin', branch], { timeout: 60_000 });
  },
};

export async function runRelease(deps: ReleaseDeps = defaultDeps): Promise<void> {
  const version = await deps.readPackageVersion();
  const tag = `v${version}`;
  console.log(`Releasing ${tag}…`);

  // Sanity check: CHANGELOG.md latest version must match
  const changelog = await deps.readChangelog();
  const latestInChangelog = parseLatestVersion(changelog);
  if (latestInChangelog !== version) {
    throw new Error(
      `CHANGELOG.md latest entry is ${latestInChangelog ?? '(none)'} but package.json version is ${version}. Run \`pnpm changeset version\` first.`
    );
  }

  // Tag + push
  await deps.tagCreate(tag, `Release ${tag}`);
  await deps.tagPush(tag);
  console.log(`✓ Tagged + pushed ${tag}`);

  // Update versions.json
  const current = await deps.readVersionsJson();
  const updated = updateLatestChannel(current, version, deps.now());
  await deps.writeVersionsJson(updated);
  await deps.gitAdd(['versions.json']);
  await deps.gitCommit(`chore(release): bump versions.json to ${tag} [skip ci]`);
  await deps.gitPush('main');
  console.log(`✓ Updated versions.json + pushed`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRelease().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm test tests/release-script.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/release.ts tests/release-script.test.ts
git commit -m "feat(release): release script (tag + push + versions.json update)"
```

---

## Task 6: CHANGELOG.md 初始内容

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: 写**

```markdown
# CHANGELOG

本项目使用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式（中文版）。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-05-26

### Added
- 初始 release。
- `init` / `update` / `verify` / `status` / `repair` / `lock` CLI 命令。
- 4 个团队默认集成：superpowers plugin、Playwright MCP、Feishu MCP、`@larksuite/cli`。
- Sprint 1: `--version` / `--channel` flag 支持版本/channel 选择；启动检查 Claude Code 版本（peerRequirements）；deprecation 警告；ProjectLockfile 记录 channel/resolvedFrom；versions.json 元数据文件 + Codeup raw URL fetch + shallow-clone fallback。
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): initial CHANGELOG with v0.1.0 entry"
```

---

## Task 7: RELEASING.md 维护者 SOP

**Files:**
- Create: `RELEASING.md`

- [ ] **Step 1: 写**

```markdown
# Releasing foodmax-ai-config

## 日常工作（提 PR）

1. 写代码 + 测试
2. 跑 `pnpm changeset` —— 选 patch/minor/major + 写一行人类可读的描述
3. `git add .changeset/*.md src/ tests/` + commit + push + 提 PR
4. CI 会拦没 changeset 的 PR（除非 PR title 加 `[skip-changeset]`，仅适用于纯 docs/CI/test 改动）

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
release job: git tag vX.Y.Z + push tag + update versions.json["latest"] + commit [skip ci] + push
```

**你需要做的：** 只是 merge 普通 PR。版本号、CHANGELOG、tag、versions.json 全部自动。

## 手动 release（紧急 / debug 用）

如果 CI 挂了需要手工放一个 release：

```bash
git checkout main && git pull
pnpm changeset version           # 累积所有 changesets，bump + 写 CHANGELOG
git add . && git commit -m "chore(release): version packages"
git push
pnpm tsx src/scripts/release.ts  # tag + push + 更新 versions.json
```

## MCP 注册参数变更的特殊情况

如果你这个 release 改了 `src/lib/constants.ts` 里任何 MCP 的注册命令（pin 版本、加 flag、换 transport），changeset 描述里 **必须** 包含一个 section 叫 `MCP 参数变更`：

```bash
pnpm changeset
# 选 minor 或 patch
# 在描述里写：
#   ## MCP 参数变更
#   - Playwright MCP 从 @latest pin 到 @1.0.5
```

`prependChangelogEntry` 会自动在 CHANGELOG.md 这个 section 下方加 "请用 `--force-mcp` 升级" 警告。

## Beta channel release

```bash
pnpm changeset pre enter beta    # 进入 beta 模式
pnpm changeset                   # 正常加 changesets
pnpm changeset version           # 累积出 X.Y.Z-rc.N 版本
git commit / push / CI 自动 tag 但是写到 channels.beta 而非 channels.latest
pnpm changeset pre exit          # 退出 beta 模式
```

⚠️ Sprint 2 一期 release 脚本只更新 `channels.latest`。Beta channel 需要 Sprint 3 或者手动维护 `versions.json["channels"]["beta"]`。

## 检查 release 是否成功

```bash
git ls-remote --tags origin | grep v$VERSION   # tag 应该在远程
git show v$VERSION                              # 看 tag annotation
cat versions.json | jq .channels.latest         # 应该指向新 tag
```

## 同事侧验证

随便找一个干净的项目：

```bash
mkdir /tmp/release-test && cd /tmp/release-test
echo '{"name":"test","version":"0"}' > package.json
npx -y https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git#v$VERSION init --dry-run
```
```

- [ ] **Step 2: Commit**

```bash
git add RELEASING.md
git commit -m "docs(releasing): maintainer SOP for release process"
```

---

## Task 8: package.json scripts + 删除 .github/workflows/test.yml

**Files:**
- Modify: `package.json`
- Delete: `.github/workflows/test.yml`

- [ ] **Step 1: 加 npm scripts**

In `package.json` `"scripts"` section, add:

```json
{
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lock": "tsx src/cli.ts lock",
    "prepare": "tsup && husky",
    "changeset": "changeset",
    "version-packages": "tsx src/scripts/version-packages.ts",
    "release": "tsx src/scripts/release.ts"
  }
}
```

(`husky` install moved into `prepare` so contributors get hooks on first `pnpm install`.)

- [ ] **Step 2: 删除死代码**

```bash
rm .github/workflows/test.yml
rmdir .github/workflows 2>/dev/null && rmdir .github 2>/dev/null || true
```

- [ ] **Step 3: 跑测试套**

```bash
pnpm test && pnpm typecheck && pnpm build
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add package.json
git rm .github/workflows/test.yml
git commit -m "chore(release): add scripts (changeset/version-packages/release); remove dead GH workflow"
```

---

## Task 9: commitlint + husky hooks

**Files:**
- Create: `commitlint.config.js`
- Create: `.husky/commit-msg`
- Create: `.husky/pre-push`

commitlint 强制 conventional commits 格式。pre-push hook 检查待 push 的 commit 范围里有没有 changeset。

- [ ] **Step 1: commitlint config**

```js
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'perf', 'build', 'ci'],
    ],
    // Allow longer header (Chinese commits)
    'header-max-length': [2, 'always', 100],
  },
};
```

- [ ] **Step 2: 初始化 husky**

```bash
pnpm husky init
```

This creates `.husky/pre-commit`. Replace with commit-msg hook.

- [ ] **Step 3: .husky/commit-msg**

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm commitlint --edit "$1"
```

```bash
chmod +x .husky/commit-msg
```

- [ ] **Step 4: .husky/pre-push (changeset check)**

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Skip if pushing a tag, or if the [skip-changeset] override is in commit messages
if [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ]; then
  exit 0
fi

# Look for changeset files in the commits being pushed
range="origin/main..HEAD"
if git log "$range" --pretty=format:'%s' 2>/dev/null | grep -qi '\[skip-changeset\]'; then
  exit 0
fi

if [ -z "$(git log "$range" --name-only --pretty=format: 2>/dev/null | grep -E '^\.changeset/.+\.md$' | grep -v README)" ]; then
  echo "❌ No changeset found in commits being pushed."
  echo "   Run: pnpm changeset"
  echo "   Or add [skip-changeset] to a commit message for pure docs/test/ci changes."
  exit 1
fi
```

```bash
chmod +x .husky/pre-push
```

- [ ] **Step 5: 写一个 changeset 给本任务（非交互，避免 pnpm changeset 的提示）**

```bash
cat > .changeset/sprint-2-release-automation.md <<'EOF'
---
"foodmax-ai-config": minor
---

Sprint 2: 发布自动化 — 接入 changesets、commitlint、husky；新增 Codeup pipeline；CI 自动 tag + push + 更新 versions.json
EOF
```

- [ ] **Step 6: Commit (在 main 直接 commit；pre-push hook 只在 push 时触发)**

```bash
git add commitlint.config.js .husky/ .changeset/sprint-2-release-automation.md
git commit -m "chore(release): commitlint + husky hooks"
```

Don't push yet — Sprint 2 全部完成后一次性 push（避免触发 CI 半成品状态）。Task 11 是 push + 端到端验证步骤。

---

## Task 10: .codeup-ci.yml

**Files:**
- Create: `.codeup-ci.yml`

⚠️ **Verification needed:** Codeup Pipelines YAML syntax follows Alibaba Cloud Codeup docs (similar to GitLab CI but with some differences). The implementer MUST:
1. Find a reference Codeup pipeline in another internal team project (ask the user or check `kos/dev-tools/*` for one)
2. Adapt the example below to match exact Codeup syntax
3. If no reference available, fall back to using GitLab CI syntax (Codeup accepts it for most stages) and verify on first push

- [ ] **Step 1: 写 pipeline YAML**

```yaml
# .codeup-ci.yml
# Codeup Pipelines configuration for foodmax-ai-config

stages:
  - test
  - version-packages
  - release

variables:
  NODE_VERSION: '20'
  PNPM_VERSION: '9'

# Job 1: tests on every push and PR
test:
  stage: test
  image: node:20
  before_script:
    - npm install -g pnpm@$PNPM_VERSION
    - pnpm install --frozen-lockfile
  script:
    - pnpm typecheck
    - pnpm test
    - pnpm build
    - pnpm lock
    - if ! git diff --exit-code .locked.json; then
        echo "::error::.locked.json is out of date. Run \`pnpm lock\` locally and commit.";
        exit 1;
      fi
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request"'
    - if: '$CI_COMMIT_BRANCH == "main"'

# Job 2: when main has new changesets, bump version + commit
version-packages:
  stage: version-packages
  image: node:20
  before_script:
    - npm install -g pnpm@$PNPM_VERSION
    - pnpm install --frozen-lockfile
    - git config user.email "ci-bot@foodmax.local"
    - git config user.name "FoodMax CI Bot"
    # CI must have a token with push access; set CI_BOT_TOKEN as secret
    - git remote set-url origin "https://oauth2:${CI_BOT_TOKEN}@bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git"
  script:
    - pnpm version-packages
  rules:
    - if: '$CI_COMMIT_BRANCH == "main" && $CI_COMMIT_TITLE !~ /\[skip ci\]/'

# Job 3: when main has a "chore(release): version packages" commit, do the release
release:
  stage: release
  image: node:20
  before_script:
    - npm install -g pnpm@$PNPM_VERSION
    - pnpm install --frozen-lockfile
    - git config user.email "ci-bot@foodmax.local"
    - git config user.name "FoodMax CI Bot"
    - git remote set-url origin "https://oauth2:${CI_BOT_TOKEN}@bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git"
  script:
    - pnpm release
  rules:
    - if: '$CI_COMMIT_BRANCH == "main" && $CI_COMMIT_TITLE =~ /^chore\(release\): version packages/'
```

Note: variables like `$CI_PIPELINE_SOURCE`, `$CI_COMMIT_BRANCH`, `$CI_COMMIT_TITLE` may have different names in Codeup. Adapt as needed.

- [ ] **Step 2: 维护者侧准备**

In Codeup project Settings → CI/CD → Variables:
- Add `CI_BOT_TOKEN`: a personal access token for a service account with push access to main. Mark as protected + masked.

Document this in `RELEASING.md` (already covered above in "Setup" section — add it if missing).

- [ ] **Step 3: Commit**

```bash
git add .codeup-ci.yml
git commit -m "ci: Codeup pipeline for test + version-packages + release"
```

---

## Task 11: 跑全流程端到端验证

**Files:** none — 手动验证。**Step 3 涉及真 push 到 remote 触发 CI — 是不可逆的、影响共享系统的操作；SDD 实现 agent 不能自动执行此 step，须由用户驱动或显式批准。**

- [ ] **Step 1: 本地预演 version-packages**

```bash
# 创建一个 fake changeset
mkdir -p .changeset
cat > .changeset/test-bump.md <<'EOF'
---
"foodmax-ai-config": patch
---

测试 changeset 流程
EOF

# 运行（不会真 push，因为没在 CI 环境）
pnpm changeset version
git status  # 应该看到 package.json + CHANGELOG.md 改了，.changeset/test-bump.md 没了
git stash  # 保护现场，不污染 commit
git stash drop  # 丢弃
rm -rf .changeset/test-bump.md  # 清理
```

如果出错：检查 changeset config + version-packages 脚本。

- [ ] **Step 2: 本地预演 release（不真 push）**

需要 mock 一下 git push。最简单：注入 deps 跑测试。或者打一个 dry-run 模式。

```bash
# 测试一下 release script 的 sanity check：故意把 package.json version 改成 9.9.9（CHANGELOG 没有这个 entry）
node -e "const p=require('./package.json'); p.version='9.9.9'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2));"
pnpm release || true  # 应该 fail with "CHANGELOG.md latest entry is X.Y.Z but package.json is 9.9.9"
# 还原
git checkout package.json
```

- [ ] **Step 3: 第一次真 push 触发 CI**

提一个测试 PR：

```bash
git checkout -b test/sprint-2-ci
echo "# test" >> README.md  # 微不足道的改动
pnpm changeset  # patch, "test CI pipeline"
git add .
git commit -m "test: verify Sprint 2 pipeline"
git push -u origin test/sprint-2-ci
# 去 Codeup 提 PR，观察 CI 跑成功
# Merge 后观察 version-packages 自动跑
# 观察 "chore(release): version packages" PR 出现
# Merge 它，观察 release job 自动跑（tag + versions.json 更新）
```

如果有任何一步挂了，debug。

- [ ] **Step 4: 清理测试痕迹**

如果产生了垃圾 commit / tag（例如 v0.1.1 是测试产物），考虑是否保留：保留无伤大雅；删除要 `git push --delete origin v0.1.1`（需要用户批准）。

---

## Task 12: README 更新（维护者章节）

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 替换"加新 skill"和"Release"section**

找到 README.md 中的「给维护者（5% 读者）」section。替换其中的 Release subsection 为：

```markdown
### Release

我们用 [changesets](https://github.com/changesets/changesets) 管理版本和 CHANGELOG。日常 PR 流程：

```bash
# 写代码、测试，然后：
pnpm changeset                  # 选 patch/minor/major + 写一行人类可读描述
git add . && git commit -m "feat: ..." && git push
```

PR merge 后，Codeup CI 自动：
1. 累积所有 `.changeset/*.md` → bump version → 写 CHANGELOG.md → 提 "Version Packages" PR
2. 你 merge 那个 PR → CI 自动 tag + push + 更新 versions.json

零手动 git tag。详见 [RELEASING.md](RELEASING.md)。

**MCP 参数变更要特别提醒：** 如果你的 changeset 描述包含 `MCP 参数变更` section，CHANGELOG 会自动追加 "请同事用 `--force-mcp` 升级" 警告。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): update Release section for changesets workflow"
```

---

## Definition of Done (Sprint 2)

- 12 个 task 全部提交
- `pnpm test` 全过（target ~131 tests，+17 new）
- `pnpm typecheck` clean
- `pnpm build` 成功
- 本地预演 version-packages + release scripts 都按预期工作
- `.codeup-ci.yml` 落地，**第一次真实 PR 走完整流程成功**（这是关键的端到端验证）
- CHANGELOG.md 有 v0.1.0 entry；RELEASING.md 文档完整
- `.github/workflows/test.yml` 已删除

## Out-of-Scope for Sprint 2

- **Beta channel 自动 release**：当前 release.ts 只更新 `channels.latest`。Beta channel 由维护者手动 `pnpm changeset pre enter beta` + 手动 `versions.json` 维护。Sprint 3 或单独 PR 处理。
- **Tag 签名**：Sprint 3 处理（GPG 签名 + verify）
- **Deprecation 触达 CLI**：Sprint 3 处理
- **Dependabot / SECURITY.md**：Sprint 3 处理
- **网络韧性 / E2E 测试 / lockfile migration**：Sprint 4 处理

## Open Questions（实施时确认）

1. **Codeup Pipelines YAML 语法细节**：变量名 (`$CI_COMMIT_BRANCH` 等) 实际是什么？需要参考一个现有 Codeup pipeline 文件 OR Alibaba Cloud Codeup 官方文档。如果该项目是组里第一个用 Codeup Pipelines，需要一次 spike 验证。
2. **CI_BOT_TOKEN 设置**：谁是 CI bot 服务账号？需要管理员账号有权创建。
3. **`pnpm changeset` 在 CI 里跑要不要交互**：`pnpm changeset version` 默认非交互可以，但 `pnpm changeset` 是交互的。脚本里只用前者，不用后者。
4. **测试 PR 产生的垃圾 tag 怎么办**：保留作为 v0.1.0 → v0.1.1 的真实历史，还是清理掉？建议保留。
