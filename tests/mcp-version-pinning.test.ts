import { test, expect } from 'vitest';
import {
  PLAYWRIGHT_MCP_CMD,
  FEISHU_MCP_SHELL_CMD,
} from '../src/lib/constants.js';

const SEMVER_RE = /\d+\.\d+\.\d+/;

test('PLAYWRIGHT_MCP_CMD pins to a specific version (no @latest)', () => {
  const joined = PLAYWRIGHT_MCP_CMD.join(' ');
  expect(joined).not.toContain('@latest');
  expect(joined).toMatch(/@playwright\/mcp@\d+\.\d+\.\d+/);
});

test('FEISHU_MCP_SHELL_CMD pins lark-mcp to a specific version (no @latest, no bare name)', () => {
  expect(FEISHU_MCP_SHELL_CMD).not.toContain('@latest');
  expect(FEISHU_MCP_SHELL_CMD).toMatch(/@larksuiteoapi\/lark-mcp@\d+\.\d+\.\d+/);
  // Also: don't accidentally drop the `mcp` subcommand or the env-var args
  expect(FEISHU_MCP_SHELL_CMD).toContain('mcp -a "$LARK_APP_ID"');
  expect(FEISHU_MCP_SHELL_CMD).toContain('"$LARK_APP_SECRET"');
});

test('PLAYWRIGHT_MCP_CMD package name segment matches `@playwright/mcp` exactly', () => {
  const pkgArg = PLAYWRIGHT_MCP_CMD[PLAYWRIGHT_MCP_CMD.length - 1];
  expect(pkgArg).toBeDefined();
  const m = pkgArg!.match(/^(@playwright\/mcp)@(\d+\.\d+\.\d+)$/);
  expect(m, `expected '@playwright/mcp@<semver>', got '${pkgArg}'`).not.toBeNull();
});
