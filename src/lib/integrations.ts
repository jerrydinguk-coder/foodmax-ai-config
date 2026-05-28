import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defaultExec, formatExecError, type Exec } from './plugin-install.js';
import {
  SUPERPOWERS_SOURCE,
  SUPERPOWERS_MARKETPLACE,
  SUPERPOWERS_PLUGIN,
  PLAYWRIGHT_MCP_NAME,
  PLAYWRIGHT_MCP_PKG,
  PLAYWRIGHT_MCP_CMD,
  FEISHU_MCP_NAME,
  FEISHU_MCP_PKG,
  FEISHU_MCP_SHELL_CMD,
  LARK_CLI_BIN,
  LARK_CLI_PKG,
} from './constants.js';

const _exec = promisify(execFile);

export interface IntegrationResult {
  name: string;
  status: 'installed' | 'skipped' | 'failed';
  reason?: string;
  /**
   * Actionable warning for the user. Set when status='skipped' but the skip
   * may hide a real configuration drift (e.g., an MCP is registered under the
   * managed name but with command/args we can't verify match team defaults).
   * The init/update log layer renders this as a warning line.
   */
  hint?: string;
}

export interface IntegrationOptions {
  exec?: Exec;
  /** Override the `which lark-cli` check (testing). Returns true if installed. */
  larkCliPresent?: () => Promise<boolean>;
  /** Override `claude mcp list` parse to check existence. Returns array of registered MCP names. */
  listMcpNames?: () => Promise<string[]>;
}

// --- Helpers ---

/**
 * Parse `claude mcp list` stdout into the first-column name of each entry.
 * Each MCP line starts with `<name>:` (the name may contain spaces, e.g.,
 * "claude.ai Google Drive"). We take everything before the FIRST colon.
 * Skips empty lines and the "Checking…" header.
 */
export function parseMcpListNames(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => {
      const match = line.match(/^([^:]+):/);
      return match ? match[1]!.trim() : null;
    })
    .filter((name): name is string => {
      if (!name) return false;
      // Filter the "Checking MCP server health…" header line (no colon)
      // and any other non-MCP lines we might encounter.
      if (name.toLowerCase().startsWith('checking')) return false;
      return true;
    });
}

/**
 * When `npm install -g` is denied (EACCES — typical on homebrew installs where
 * /opt/homebrew/lib/node_modules is root-owned), users reach for `sudo`. That's
 * harmful: sudo can install into root's HOME so Claude never sees the result,
 * or leaves root-owned files that break later non-sudo update/repair. Steer
 * them to a user-writable npm prefix instead.
 */
function eaccesHint(error: string): string | undefined {
  if (!/EACCES|permission denied/i.test(error)) return undefined;
  return [
    `Global npm install was denied (EACCES) — your global node_modules is not writable by your user.`,
    `DON'T use sudo: it can install into root's HOME (Claude won't find it) or leave root-owned files that break later updates.`,
    `Point npm at a user-writable prefix, then re-run:`,
    `  npm config set prefix ~/.npm-global`,
    `  echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> ~/.zshrc && source ~/.zshrc`,
    `  npx foodmax-ai update`,
  ].join('\n');
}

async function defaultLarkCliPresent(): Promise<boolean> {
  try {
    await _exec('which', [LARK_CLI_BIN], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function defaultListMcpNames(exec: Exec): Promise<string[]> {
  try {
    const { stdout } = await exec('claude', ['mcp', 'list']);
    return parseMcpListNames(stdout);
  } catch {
    // `claude mcp list` returns non-zero if it can't reach an auth server
    // (e.g., gdrive). Treat absence of stdout as empty list — we'd rather
    // attempt to register and fail loudly than skip silently.
    return [];
  }
}

// --- Individual integrations ---

export async function installSuperpowers(
  opts: IntegrationOptions = {}
): Promise<IntegrationResult> {
  const exec = opts.exec ?? defaultExec;
  try {
    await exec('claude', ['plugin', 'marketplace', 'add', SUPERPOWERS_SOURCE]);
    await exec('claude', [
      'plugin',
      'install',
      `${SUPERPOWERS_PLUGIN}@${SUPERPOWERS_MARKETPLACE}`,
      '--scope',
      'user',
    ]);
    return { name: 'superpowers', status: 'installed' };
  } catch (err) {
    const reason = formatExecError(err);
    return { name: 'superpowers', status: 'failed', reason, hint: eaccesHint(reason) };
  }
}

export async function registerPlaywrightMcp(
  opts: IntegrationOptions = {}
): Promise<IntegrationResult> {
  const exec = opts.exec ?? defaultExec;
  const listNames = opts.listMcpNames ?? (() => defaultListMcpNames(exec));
  try {
    // Eagerly install the pinned package globally — runs regardless of
    // registration state so the package is materialized on disk by the time
    // Claude spawns the MCP. Without this, the registered `npx -y <pkg>@<v>`
    // command would download on first MCP use (slow + fails when offline).
    await exec('npm', ['install', '-g', PLAYWRIGHT_MCP_PKG]);

    const existing = await listNames();
    if (existing.includes(PLAYWRIGHT_MCP_NAME)) {
      return {
        name: 'playwright-mcp',
        status: 'skipped',
        reason: `MCP "${PLAYWRIGHT_MCP_NAME}" already registered`,
        hint: `An MCP named "${PLAYWRIGHT_MCP_NAME}" is already registered with Claude — its command/args may differ from the team default. To re-register with team defaults: \`npx foodmax-ai update --force-mcp\``,
      };
    }
    await exec('claude', [
      'mcp',
      'add',
      PLAYWRIGHT_MCP_NAME,
      '--scope',
      'user',
      '--',
      ...PLAYWRIGHT_MCP_CMD,
    ]);
    return { name: 'playwright-mcp', status: 'installed' };
  } catch (err) {
    const reason = formatExecError(err);
    return { name: 'playwright-mcp', status: 'failed', reason, hint: eaccesHint(reason) };
  }
}

export async function registerFeishuMcp(
  opts: IntegrationOptions = {}
): Promise<IntegrationResult> {
  const exec = opts.exec ?? defaultExec;
  const listNames = opts.listMcpNames ?? (() => defaultListMcpNames(exec));
  try {
    // See registerPlaywrightMcp for the rationale — eager install so the
    // package is on disk by the time Claude spawns the MCP.
    await exec('npm', ['install', '-g', FEISHU_MCP_PKG]);

    const existing = await listNames();
    if (existing.includes(FEISHU_MCP_NAME)) {
      return {
        name: 'feishu-mcp',
        status: 'skipped',
        reason: `MCP "${FEISHU_MCP_NAME}" already registered`,
        hint: `An MCP named "${FEISHU_MCP_NAME}" is already registered with Claude — its command/args may differ from the team default (which uses env-var placeholders for credentials, not hardcoded values). To re-register with team defaults: \`npx foodmax-ai update --force-mcp\``,
      };
    }
    // The shell wrapper preserves the literal $LARK_APP_ID / $LARK_APP_SECRET
    // so they're resolved at MCP-spawn time (from the user's rc env), not now.
    await exec('claude', [
      'mcp',
      'add',
      FEISHU_MCP_NAME,
      '--scope',
      'user',
      '--',
      'sh',
      '-c',
      FEISHU_MCP_SHELL_CMD,
    ]);
    return { name: 'feishu-mcp', status: 'installed' };
  } catch (err) {
    const reason = formatExecError(err);
    return { name: 'feishu-mcp', status: 'failed', reason, hint: eaccesHint(reason) };
  }
}

export async function ensureLarkCli(
  opts: IntegrationOptions = {}
): Promise<IntegrationResult> {
  const exec = opts.exec ?? defaultExec;
  const present = opts.larkCliPresent ?? defaultLarkCliPresent;
  try {
    if (await present()) {
      return {
        name: 'lark-cli',
        status: 'skipped',
        reason: `${LARK_CLI_BIN} already on PATH`,
      };
    }
    await exec('npm', ['install', '-g', LARK_CLI_PKG]);
    return { name: 'lark-cli', status: 'installed' };
  } catch (err) {
    const reason = formatExecError(err);
    return { name: 'lark-cli', status: 'failed', reason, hint: eaccesHint(reason) };
  }
}

export async function runAllIntegrations(
  opts: IntegrationOptions = {}
): Promise<IntegrationResult[]> {
  // Run sequentially. Why not parallel? Because `claude plugin install` and
  // `claude mcp add` touch the same on-disk config; we want predictable order
  // for logs and to avoid Claude-side write contention.
  const results: IntegrationResult[] = [];
  results.push(await installSuperpowers(opts));
  results.push(await registerPlaywrightMcp(opts));
  results.push(await registerFeishuMcp(opts));
  results.push(await ensureLarkCli(opts));
  return results;
}
