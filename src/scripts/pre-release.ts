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

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 500);
  return String(e).slice(0, 500);
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
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
