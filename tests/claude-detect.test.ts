import { test, expect } from 'vitest';
import { detectClaudeCli } from '../src/lib/claude-detect.js';

test('detectClaudeCli returns ok with version string on this machine', async () => {
  const r = await detectClaudeCli();
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.version).toMatch(/.+/);
});

test('detectClaudeCli with bogus command returns not ok', async () => {
  const r = await detectClaudeCli({ cmd: '__definitely_not_a_real_command__' });
  expect(r.ok).toBe(false);
});
