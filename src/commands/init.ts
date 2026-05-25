import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readLockfile } from '../lib/lockfile.js';
import { packageLockfileName, projectLockfileName } from '../lib/paths.js';
import { detectClaudeCli, type DetectResult } from '../lib/claude-detect.js';
import { installPlugin, defaultExec, type Exec } from '../lib/plugin-install.js';
import { runAllIntegrations } from '../lib/integrations.js';
import { mergeClaudeMd, mergeGitignore } from '../lib/merge.js';
import { PROJECT_CLAUDE_MD_BLOCK } from '../templates/project-claude-md.js';
import { CI_WORKFLOW_YAML } from '../templates/ci-workflow.js';
import { ok, warn, fail, info, bold } from '../lib/log.js';
import {
  FOODMAX_PACKAGE as PACKAGE_NAME,
  FOODMAX_SOURCE as SOURCE,
  FOODMAX_MARKETPLACE as MARKETPLACE_NAME,
  FOODMAX_PLUGIN as PLUGIN_NAME,
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
  if (!existsSync(join(opts.cwd, '.git')) && !opts.yes) {
    throw new Error(
      `${opts.cwd} is not a git repository. Re-run with --yes to proceed anyway, or run \`git init\` first.`
    );
  }
  const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');
  if (nodeMajor < 18) {
    throw new Error(`Node 18+ required (you have ${process.versions.node})`);
  }

  const pkgRoot = opts.packageRootOverride ?? join(opts.cwd, 'node_modules', PACKAGE_NAME);
  if (!existsSync(join(pkgRoot, 'package.json'))) {
    throw new Error(
      `Installed package not found at ${pkgRoot}. If this is your first init, install first: \`npm install --no-save github:foodmax/ai-config-init\``
    );
  }

  // Sanity: package's own lockfile exists & self-checks
  const internalLockPath = join(pkgRoot, packageLockfileName());
  if (!existsSync(internalLockPath)) {
    throw new Error(`Installed package missing ${packageLockfileName()}. Package may be corrupted.`);
  }
  const internalLock = readLockfile(internalLockPath);

  if (opts.dryRun) {
    console.log(info(bold('[dry-run] Would perform:')));
    console.log(info(`  - Merge ${join(opts.cwd, 'CLAUDE.md')} with team region`));
    console.log(info(`  - Add devDep "${PACKAGE_NAME}" to package.json`));
    console.log(info(`  - Append .gitignore`));
    console.log(info(`  - Write .github/workflows/ai-config-verify.yml`));
    console.log(info(`  - Run: claude plugin marketplace add ${SOURCE}`));
    console.log(info(`  - Run: claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME} --scope user`));
    console.log(info(`  - Write ${projectLockfileName()}`));
    return;
  }

  // Step 1: project files
  writeProjectClaudeMd(opts.cwd);
  writeProjectPackageJson(opts.cwd);
  writeProjectGitignore(opts.cwd);
  writeProjectCiWorkflow(opts.cwd);

  // Step 2: plugin install (the critical one)
  const installR = await installPlugin({
    source: SOURCE,
    marketplaceName: MARKETPLACE_NAME,
    pluginName: PLUGIN_NAME,
    scope: 'user',
    exec,
  });
  if (!installR.ok) {
    console.log(warn(`Plugin install reported a non-fatal error: ${installR.error}`));
    console.log(warn(`You may need to run manually: claude plugin marketplace add ${SOURCE}`));
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
    } else {
      console.log(warn(`${r.name} install failed${r.reason ? `: ${r.reason}` : ''}`));
    }
  }

  // Step 3: project lockfile
  const commitSha = await tryReadInstalledCommitSha(pkgRoot);
  const pkgVersion = readPackageVersion(pkgRoot);
  const projectLock = {
    version: 1 as const,
    package: PACKAGE_NAME,
    source: SOURCE,
    commitSha,
    packageVersion: pkgVersion,
    packageRootHash: internalLock.rootHash,
    initializedAt: new Date().toISOString(),
    initializedBy: `foodmax-ai@${pkgVersion}`,
  };
  writeFileSync(
    join(opts.cwd, projectLockfileName()),
    JSON.stringify(projectLock, null, 2) + '\n'
  );

  // Step 4: next steps
  console.log('');
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
  console.log(info('  5. Stay current: `npx foodmax-ai update`'));
}

function writeProjectClaudeMd(cwd: string): void {
  const path = join(cwd, 'CLAUDE.md');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const merged = mergeClaudeMd(existing, PROJECT_CLAUDE_MD_BLOCK);
  writeFileSync(path, merged);
  console.log(ok(`Wrote ${path} (team region merged)`));
}

function writeProjectPackageJson(cwd: string): void {
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
  pkg.devDependencies[PACKAGE_NAME] = `github:foodmax/ai-config-init`;
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
    .action(async (opts) => {
      try {
        await runInit({
          cwd: process.cwd(),
          yes: opts.yes,
          dryRun: opts.dryRun,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(fail(msg));
        process.exit(2);
      }
    });
}
