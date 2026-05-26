import type { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readLockfile,
  type ProjectLockfile,
} from '../lib/lockfile.js';
import {
  packageLockfileName,
  projectLockfileName,
} from '../lib/paths.js';
import { installPlugin, defaultExec, type Exec } from '../lib/plugin-install.js';
import { runAllIntegrations } from '../lib/integrations.js';
import { ok, fail, info, warn } from '../lib/log.js';
import {
  FOODMAX_PACKAGE as PACKAGE_NAME,
  FOODMAX_SOURCE as SOURCE,
  FOODMAX_MARKETPLACE as MARKETPLACE_NAME,
  FOODMAX_PLUGIN as PLUGIN_NAME,
  MANAGED_MCP_NAMES,
} from '../lib/constants.js';
import {
  fetchVersions as defaultFetchVersions,
  resolveVersion,
  type VersionsJson,
} from '../lib/versions.js';
import { warnIfDeprecated, requireNotBlocked } from '../lib/deprecation.js';
import { detectClaudeCli, requireClaudeVersion, type DetectResult } from '../lib/claude-detect.js';

const _exec = promisify(execFile);

export interface RunUpdateOptions {
  cwd: string;
  packageRootOverride?: string;
  reinstall?: () => Promise<void>;
  exec?: Exec;
  /** Remove managed MCPs before re-registering so changed args take effect. */
  forceMcp?: boolean;
  /** Test injection so update does not shell out to `which lark-cli`. */
  larkCliPresent?: () => Promise<boolean>;
  /** Test injection so update does not run real `claude mcp list`. */
  listMcpNames?: () => Promise<string[]>;
  /** Pin to a specific semver. Mutually exclusive with channel. */
  version?: string;
  /** Pick a channel from versions.json (default: latest). Mutually exclusive with version. */
  channel?: string;
  /** Inject for tests: avoid network/git. */
  fetchVersions?: () => Promise<VersionsJson>;
  /** Inject for tests: avoid shelling out to `claude --version`. */
  claudeDetect?: () => Promise<DetectResult>;
}

export async function runUpdate(opts: RunUpdateOptions): Promise<void> {
  const pkgRoot = opts.packageRootOverride ?? join(opts.cwd, 'node_modules', PACKAGE_NAME);
  const exec = opts.exec ?? defaultExec;

  // Peer check + version resolution
  const detect = opts.claudeDetect ?? (() => detectClaudeCli());
  const claudeR = await detect();

  const fetchV = opts.fetchVersions ?? (() => defaultFetchVersions());
  const versionsJson = await fetchV();

  const claudeReq = requireClaudeVersion(claudeR, versionsJson.peerRequirements.claudeCode);
  if (!claudeReq.ok) throw new Error(claudeReq.reason);

  const resolved = resolveVersion(versionsJson, { version: opts.version, channel: opts.channel });
  const pinnedSource = `${SOURCE}#${resolved.tag}`;

  warnIfDeprecated(versionsJson, resolved.version);
  requireNotBlocked(versionsJson, resolved.version);

  const reinstall =
    opts.reinstall ??
    (async () => {
      await exec('npm', ['install', '--no-save', pinnedSource]);
    });

  console.log(info('Re-fetching latest from source…'));
  await reinstall();

  // Refresh marketplace (claude plugin marketplace update is the right verb; install is idempotent)
  try {
    await exec('claude', ['plugin', 'marketplace', 'update', MARKETPLACE_NAME]);
  } catch {
    // first-time update may need the install path; do it
    await installPlugin({
      source: pinnedSource,
      marketplaceName: MARKETPLACE_NAME,
      pluginName: PLUGIN_NAME,
      scope: 'user',
      exec,
    });
  }

  const internalLockPath = join(pkgRoot, packageLockfileName());
  if (!existsSync(internalLockPath)) {
    console.error(fail(`Package missing ${packageLockfileName()} after update.`));
    process.exitCode = 3;
    return;
  }
  const internalLock = readLockfile(internalLockPath);

  // Force-mcp: remove managed MCPs so re-registration picks up new args
  // (e.g., pinned version, new flags). Failures are tolerated — an MCP that
  // was never registered will produce an error from `claude mcp remove` and
  // that is fine.
  if (opts.forceMcp) {
    for (const name of MANAGED_MCP_NAMES) {
      try {
        await exec('claude', ['mcp', 'remove', name, '--scope', 'user']);
        console.log(info(`Removed MCP "${name}" for fresh registration`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(info(`(MCP "${name}" remove skipped: ${msg.slice(0, 120)})`));
      }
    }
  }

  // Re-run integrations: catches new integrations added since init, and (with
  // --force-mcp) re-registers MCPs whose args changed in the package.
  const integrationResults = await runAllIntegrations({
    exec,
    larkCliPresent: opts.larkCliPresent,
    listMcpNames: opts.listMcpNames,
  });
  for (const r of integrationResults) {
    if (r.status === 'installed') {
      console.log(ok(`${r.name} installed`));
    } else if (r.status === 'skipped') {
      console.log(info(`${r.name} skipped${r.reason ? ` (${r.reason})` : ''}`));
      if (r.hint) console.log(warn(r.hint));
    } else {
      console.log(warn(`${r.name} install failed${r.reason ? `: ${r.reason}` : ''}`));
    }
  }

  const projectLockPath = join(opts.cwd, projectLockfileName());
  const existing = (existsSync(projectLockPath)
    ? JSON.parse(readFileSync(projectLockPath, 'utf8'))
    : {}) as Partial<ProjectLockfile>;
  const pkgVersion = readPackageVersion(pkgRoot);
  const next: ProjectLockfile = {
    ...existing,
    version: 1,
    package: PACKAGE_NAME,
    source: SOURCE,
    commitSha: await tryReadInstalledCommitSha(pkgRoot),
    packageVersion: pkgVersion,
    packageRootHash: internalLock.rootHash,
    initializedAt: existing.initializedAt ?? new Date().toISOString(),
    initializedBy: existing.initializedBy ?? `foodmax-ai@${pkgVersion}`,
    updatedAt: new Date().toISOString(),
    ...(resolved.source === 'channel' ? { channel: resolved.channel } : { channel: undefined }),
    resolvedFrom: resolved.source,
  };
  writeFileSync(projectLockPath, JSON.stringify(next, null, 2) + '\n');
  console.log(ok(`Updated. Project pinned to packageRootHash=${internalLock.rootHash.slice(0, 12)}…`));
}

async function tryReadInstalledCommitSha(pkgRoot: string): Promise<string> {
  try {
    const { stdout } = await _exec('git', ['rev-parse', 'HEAD'], { cwd: pkgRoot });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

function readPackageVersion(pkgRoot: string): string {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  return pkg.version as string;
}

export function registerUpdate(program: Command): void {
  program
    .command('update')
    .description('Re-fetch latest, refresh plugin, re-run integrations, rewrite project lockfile')
    .option('--force-mcp', 'Remove and re-register managed MCPs (picks up changed args)')
    .option('--version <semver>', 'Pin to a specific version (e.g., 1.2.3). Mutually exclusive with --channel')
    .option('--channel <name>', 'Pick a channel from versions.json (default: latest)')
    .action(async (opts) => {
      try {
        await runUpdate({
          cwd: process.cwd(),
          forceMcp: Boolean(opts.forceMcp),
          version: opts.version,
          channel: opts.channel,
        });
      } catch (err) {
        console.error(fail(err instanceof Error ? err.message : String(err)));
        process.exit(2);
      }
    });
}
