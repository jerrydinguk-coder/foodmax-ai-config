import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('marketplace.json plugin version matches package.json version', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  const mp = JSON.parse(readFileSync(join(process.cwd(), '.claude-plugin/marketplace.json'), 'utf8'));
  const pluginVersion = mp.plugins?.[0]?.version;
  expect(pluginVersion).toBe(pkg.version);
});
