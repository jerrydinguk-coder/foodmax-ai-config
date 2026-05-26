import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

test('no stale github:foodmax/ai-config-init URL anywhere in repo', () => {
  let result = '';
  try {
    result = execFileSync('git', ['grep', '-l', 'github:foodmax/ai-config-init'], { encoding: 'utf8' });
  } catch (e: any) {
    // git grep exits 1 when no matches found — that's the GOOD case
    if (e.status === 1) {
      result = '';
    } else {
      throw e;
    }
  }
  expect(result.trim()).toBe('');
});
