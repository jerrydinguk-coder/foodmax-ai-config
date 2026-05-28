import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { valid as semverValid } from 'semver';
import { readLockfile, type ProjectLockfile } from '../lib/lockfile.js';
import { packageLockfileName, projectLockfileName } from '../lib/paths.js';
import { detectClaudeCli, requireClaudeVersion, type DetectResult } from '../lib/claude-detect.js';
import { installPlugin, defaultExec, type Exec } from '../lib/plugin-install.js';
import { runAllIntegrations } from '../lib/integrations.js';
import { mergeGitignore } from '../lib/merge.js';
import { writeGlobalClaudeMd } from '../lib/claude-md.js';
import { CI_WORKFLOW_YAML } from '../templates/ci-workflow.js';
import { ok, warn, fail, info, bold } from '../lib/log.js';
import {
  FOODMAX_NPM_PACKAGE as PACKAGE_NAME,
  FOODMAX_MARKETPLACE as MARKETPLACE_NAME,
  FOODMAX_PLUGIN as PLUGIN_NAME,
  MIN_CLAUDE_CODE_VERSION,
  npmInstallSpec,
  githubMarketplaceSource,
} from '../lib/constants.js';

const _exec = promisify(execFile);

export interface RunInitOptions {
  cwd: string;
  /** Override the installed package root (for tests). Defaults to <cwd>/node_modules/foodmax-ai-config. */
  packageRootOverride?: string;
  exec?: Exec;
  claudeDetect?: () => Promise<DetectResult>;
  yes?: boolean;
  dryRun?: boolean;
  /** Inject for tests so init does not shell out to `which lark-cli` / `npm install -g`. */
  larkCliPresent?: () => Promise<boolean>;
  /** Inject for tests so init does not run real `claude mcp list`. */
  listMcpNames?: () => Promise<string[]>;
  /** Pin to a specific semver. Mutually exclusive with tag. */
  version?: string;
  /** Pick an npm dist-tag (default: latest). Mutually exclusive with version. */
  tag?: string;
  /** Override the home dir whose .claude/CLAUDE.md gets the team region (tests). Defaults to os.homedir(). */
  homeDirOverride?: string;
}

export async function runInit(opts: RunInitOptions): Promise<void> {
  const exec = opts.exec ?? defaultExec;
  const detect = opts.claudeDetect ?? (() => detectClaudeCli());

  // Step 0: env detection
  const claudeR = await detect();
  if (!claudeR.ok) {
    throw new Error(
      `claude CLI not found. Install Claude Code from https://claude.com/claude-code\nUnderlying error: ${claudeR.error}`
    );
  }
  const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');
  if (nodeMajor < 18) {
    throw new Error(`Node 18+ required (you have ${process.versions.node})`);
  }

  const claudeReq = requireClaudeVersion(claudeR, `>=${MIN_CLAUDE_CODE_VERSION}`);
  if (!claudeReq.ok) {
    throw new Error(claudeReq.reason);
  }

  // Resolve the target the user asked for. Both branches produce an npm spec
  // suitable for `npm install --no-save`.
  if (opts.version && opts.tag) {
    throw new Error('--version and --tag are mutually exclusive');
  }
  if (opts.version && !semverValid(opts.version)) {
    throw new Error(`--version must be a valid semver (got "${opts.version}")`);
  }
  const targetSpecifier = opts.version ?? opts.tag ?? 'latest';
  const npmTarget = npmInstallSpec(targetSpecifier);

  const pkgRoot = opts.packageRootOverride ?? join(opts.cwd, 'node_modules', PACKAGE_NAME);
  const pkgInstalled = existsSync(join(pkgRoot, 'package.json'));

  if (opts.dryRun) {
    console.log(info(bold('[dry-run] Would perform:')));
    if (!pkgInstalled) {
      console.log(info(`  - Run: npm install --no-save ${npmTarget}`));
    }
    console.log(info(`  - Merge ${join(opts.homeDirOverride ?? homedir(), '.claude', 'CLAUDE.md')} with team region`));
    console.log(info(`  - Add devDep "${PACKAGE_NAME}" to package.json`));
    console.log(info(`  - Append .gitignore`));
    console.log(info(`  - Write .github/workflows/ai-config-verify.yml`));
    console.log(info(`  - Run: claude plugin marketplace add ${githubMarketplaceSource()} (pinned to installed version's tag)`));
    console.log(info(`  - Run: claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME} --scope user`));
    console.log(info(`  - Write ${projectLockfileName()}`));
    return;
  }

  if (!pkgInstalled) {
    console.log(info(`Package not in node_modules; installing ${npmTarget}…`));
    try {
      await exec('npm', ['install', '--no-save', npmTarget]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`npm install --no-save ${npmTarget} failed: ${msg}`);
    }
    if (!existsSync(join(pkgRoot, 'package.json'))) {
      throw new Error(
        `Installed package not found at ${pkgRoot} even after \`npm install --no-save ${npmTarget}\`. Check that you can reach the npm registry.`
      );
    }
  }

  // Sanity: package's own lockfile exists & self-checks
  const internalLockPath = join(pkgRoot, packageLockfileName());
  if (!existsSync(internalLockPath)) {
    throw new Error(`Installed package missing ${packageLockfileName()}. Package may be corrupted.`);
  }
  const internalLock = readLockfile(internalLockPath);

  // Read the resolved version so we can pin the GitHub marketplace tag + write
  // an accurate semver to project package.json + the project lockfile.
  const installedVersion = readPackageVersion(pkgRoot);
  const githubSource = githubMarketplaceSource(installedVersion);

  // Step 1: project files
  writeGlobalClaudeMd(opts.homeDirOverride ?? homedir(), pkgRoot);
  writeProjectPackageJson(opts.cwd, installedVersion);
  writeProjectGitignore(opts.cwd);
  writeProjectCiWorkflow(opts.cwd);

  // Step 2: plugin install — marketplace is the GitHub mirror (anonymous-readable),
  // plugin install drops a copy into ~/.claude/plugins/ at user scope.
  const installR = await installPlugin({
    source: githubSource,
    marketplaceName: MARKETPLACE_NAME,
    pluginName: PLUGIN_NAME,
    scope: 'user',
    exec,
  });
  const pluginOk = installR.ok;
  const pluginError = installR.ok ? '' : installR.error;
  if (!installR.ok) {
    console.log(fail(`Plugin install FAILED: ${installR.error}`));
    console.log(warn(`Manual retry: claude plugin marketplace add ${githubSource}`));
  } else {
    console.log(ok('Claude plugin installed (scope=user)'));
  }

  // Step 2b: best-effort integrations (superpowers plugin + MCPs + lark-cli).
  // Failures here log a warning but never fail init — the foodmax plugin
  // above is the only critical install.
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
      if (r.hint) console.log(warn(r.hint));
    }
  }

  // Step 3: project lockfile
  const commitSha = await tryReadInstalledCommitSha(pkgRoot);
  const projectLock: ProjectLockfile = {
    version: 1,
    package: PACKAGE_NAME,
    source: PACKAGE_NAME,
    commitSha,
    packageVersion: installedVersion,
    packageRootHash: internalLock.rootHash,
    initializedAt: new Date().toISOString(),
    initializedBy: `foodmax-ai@${installedVersion}`,
    ...(opts.version ? {} : { channel: opts.tag ?? 'latest' }),
    resolvedFrom: opts.version ? 'explicit-version' : 'channel',
  };
  writeFileSync(
    join(opts.cwd, projectLockfileName()),
    JSON.stringify(projectLock, null, 2) + '\n'
  );

  // Step 4: final status — be honest about whether the core plugin installed.
  console.log('');
  if (!pluginOk) {
    console.log(fail(bold('Init incomplete — the foodmax plugin did NOT install.')));
    console.log(
      warn(
        'Files were written (incl. ~/.claude/CLAUDE.md), but Claude will NOT load team skills/hooks until the plugin installs.'
      )
    );
    console.log(warn(`Reason: ${pluginError}`));
    console.log(info('Fix the cause above, then re-run: npx -y foodmax-ai-config@latest init'));
    return;
  }
  console.log(ok(bold('Done. Team AI config installed.')));
  console.log('');
  console.log(info(bold('Next:')));
  console.log(info('  1. Restart Claude Code so plugins + MCPs load'));
  console.log(info('  2. Export Feishu credentials in your shell rc BEFORE restarting Claude:'));
  console.log(info('       export LARK_APP_ID=cli_xxxxx'));
  console.log(info('       export LARK_APP_SECRET=xxxxx'));
  console.log(info('     (without these, the feishu MCP will start but every call will fail)'));
  console.log(info('  3. `lark-cli login` if you plan to use the CLI directly'));
  console.log(info('  4. CI: commit .github/workflows/ai-config-verify.yml so PRs verify on push'));
  console.log(info('  5. Stay current: `npx -y foodmax-ai-config@latest update`'));
}

function writeProjectPackageJson(cwd: string, installedVersion: string): void {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) {
    console.log(warn(`No package.json at ${path}; skipping devDep insert.`));
    return;
  }
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.devDependencies = pkg.devDependencies ?? {};
  if (PACKAGE_NAME in pkg.devDependencies) {
    console.log(info(`package.json devDependencies["${PACKAGE_NAME}"] already set; leaving it`));
    return;
  }
  pkg.devDependencies[PACKAGE_NAME] = `^${installedVersion}`;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  console.log(ok(`Updated package.json devDependencies["${PACKAGE_NAME}"]`));
}

function writeProjectGitignore(cwd: string): void {
  const path = join(cwd, '.gitignore');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const merged = mergeGitignore(existing, '.claude/settings.local.json');
  if (merged !== existing) {
    writeFileSync(path, merged);
    console.log(ok(`Added .claude/settings.local.json to .gitignore`));
  }
}

function writeProjectCiWorkflow(cwd: string): void {
  const path = join(cwd, '.github', 'workflows', 'ai-config-verify.yml');
  if (existsSync(path)) {
    console.log(info(`.github/workflows/ai-config-verify.yml already exists; skipping`));
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, CI_WORKFLOW_YAML);
  console.log(ok(`Wrote ${path}`));
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

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Bootstrap this project with foodmax-ai-config')
    .option('--dry-run', 'Print what would happen, do not write')
    .option('--yes', 'Skip interactive confirmations')
    .option('--version <semver>', 'Pin to a specific version (e.g., 1.2.3). Mutually exclusive with --tag')
    .option('--tag <name>', 'Pick an npm dist-tag (default: latest). Mutually exclusive with --version')
    .action(async (opts) => {
      try {
        await runInit({
          cwd: process.cwd(),
          yes: opts.yes,
          dryRun: opts.dryRun,
          version: opts.version,
          tag: opts.tag,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(fail(msg));
        process.exit(2);
      }
    });
}
