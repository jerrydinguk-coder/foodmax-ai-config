// Shared strings across init / repair / update / lock / integrations.
// Single source of truth so a rename / rebrand is one edit.

// --- foodmax-ai-config plugin itself ---
export const FOODMAX_PACKAGE = 'foodmax-ai-config';
export const FOODMAX_SOURCE =
  'https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/bgs2026/kos/poc/foodmax-ai-config-init.git';
export const FOODMAX_MARKETPLACE = 'foodmax-ai-config';
export const FOODMAX_PLUGIN = 'foodmax-ai-config';

// --- superpowers peer plugin ---
export const SUPERPOWERS_SOURCE = 'github:obra/superpowers';
export const SUPERPOWERS_MARKETPLACE = 'superpowers-dev';
export const SUPERPOWERS_PLUGIN = 'superpowers';

// --- Playwright MCP ---
export const PLAYWRIGHT_MCP_NAME = 'playwright';
export const PLAYWRIGHT_MCP_CMD: readonly string[] = [
  'npx',
  '-y',
  '@playwright/mcp@latest',
];

// --- Feishu MCP ---
export const FEISHU_MCP_NAME = 'feishu';
// IMPORTANT: shell command (sh -c wrapper). $LARK_APP_ID / $LARK_APP_SECRET
// are NOT expanded at init time — they're read from the user's shell env
// every time Claude Code spawns the MCP. This lets users set creds AFTER
// running `npx foodmax-ai init`.
export const FEISHU_MCP_SHELL_CMD =
  'npx -y @larksuiteoapi/lark-mcp mcp -a "$LARK_APP_ID" -s "$LARK_APP_SECRET" --domain https://open.feishu.cn';

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
