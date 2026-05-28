// Shared strings across init / repair / update / lock / integrations.
// Single source of truth so a rename / rebrand is one edit.

// --- foodmax-ai-config plugin itself ---
// The package is distributed through TWO channels:
//   (1) npm public registry — `npm install foodmax-ai-config@<version>` ships
//       the CLI + skills + hooks (zero-auth pull from registry.npmjs.org).
//   (2) GitHub public mirror — used by Claude Code as the plugin marketplace
//       catalog (`claude plugin marketplace add <github URL>#v<version>`).
// The repo on Codeup remains the source of truth for development; release
// publishes to npm AND mirrors to GitHub.
export const FOODMAX_PACKAGE = 'foodmax-ai-config';
export const FOODMAX_NPM_PACKAGE = 'foodmax-ai-config';
export const FOODMAX_GITHUB_OWNER = 'jerrydinguk-coder';
export const FOODMAX_GITHUB_REPO = 'foodmax-ai-config';
export const FOODMAX_GITHUB_SOURCE = `https://github.com/${FOODMAX_GITHUB_OWNER}/${FOODMAX_GITHUB_REPO}.git`;
export const FOODMAX_MARKETPLACE = 'foodmax-ai-config';
export const FOODMAX_PLUGIN = 'foodmax-ai-config';

/**
 * npm install spec for the foodmax-ai-config package.
 * Examples:
 *   npmInstallSpec('1.0.0')   → 'foodmax-ai-config@1.0.0'
 *   npmInstallSpec('latest')  → 'foodmax-ai-config@latest'
 *   npmInstallSpec()          → 'foodmax-ai-config@latest'
 */
export function npmInstallSpec(versionOrTag?: string): string {
  return `${FOODMAX_NPM_PACKAGE}@${versionOrTag ?? 'latest'}`;
}

/**
 * GitHub marketplace URL for `claude plugin marketplace add`.
 * Examples:
 *   githubMarketplaceSource('1.0.0') → 'https://github.com/.../foodmax-ai-config.git#v1.0.0'
 *   githubMarketplaceSource()        → 'https://github.com/.../foodmax-ai-config.git' (default branch)
 */
export function githubMarketplaceSource(version?: string): string {
  return version ? `${FOODMAX_GITHUB_SOURCE}#v${version}` : FOODMAX_GITHUB_SOURCE;
}

/**
 * Minimum Claude Code version this release supports. Checked at the start of
 * init/update. Bump this when we adopt a CLI feature that older versions don't
 * have (e.g., a new plugin source type, a new mcp flag).
 */
export const MIN_CLAUDE_CODE_VERSION = '1.0.0';

// --- superpowers peer plugin ---
// Use bare `owner/repo` shorthand. Newer Claude Code rejects the older
// `github:owner/repo` prefix form with "Invalid marketplace source format".
export const SUPERPOWERS_SOURCE = 'obra/superpowers';
export const SUPERPOWERS_MARKETPLACE = 'superpowers-dev';
export const SUPERPOWERS_PLUGIN = 'superpowers';

// --- Playwright MCP ---
// Uses @latest so users automatically pick up upstream fixes. Trade-off:
// team members who run `init` on different days may end up on different
// versions until one of them runs `update --force-mcp`.
export const PLAYWRIGHT_MCP_NAME = 'playwright';
export const PLAYWRIGHT_MCP_PKG = '@playwright/mcp@latest';
export const PLAYWRIGHT_MCP_CMD: readonly string[] = ['npx', '-y', PLAYWRIGHT_MCP_PKG];

// --- Feishu MCP ---
// IMPORTANT: shell command (sh -c wrapper). $LARK_APP_ID / $LARK_APP_SECRET
// are NOT expanded at init time — they're read from the user's shell env
// every time Claude Code spawns the MCP. This lets users set creds AFTER
// running `npx -y foodmax-ai-config@latest init`.
// Same @latest trade-off as Playwright MCP above.
export const FEISHU_MCP_NAME = 'feishu';
export const FEISHU_MCP_PKG = '@larksuiteoapi/lark-mcp@latest';
export const FEISHU_MCP_SHELL_CMD =
  `npx -y ${FEISHU_MCP_PKG} mcp -a "$LARK_APP_ID" -s "$LARK_APP_SECRET" --domain https://open.feishu.cn`;

// --- Lark CLI ---
export const LARK_CLI_BIN = 'lark-cli';
export const LARK_CLI_PKG = '@larksuite/cli';

// --- MCPs managed by this package ---
// `update --force-mcp` removes each of these via `claude mcp remove <name>`
// before re-running integrations, so callers can pick up changed registration
// args (e.g., pinning @playwright/mcp from latest to a fixed version).
export const MANAGED_MCP_NAMES: readonly string[] = [
  PLAYWRIGHT_MCP_NAME,
  FEISHU_MCP_NAME,
];
