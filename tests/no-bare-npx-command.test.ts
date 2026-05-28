import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// `foodmax-ai` is only the bin name inside the `foodmax-ai-config` package — it
// is NOT a published npm package. `npx foodmax-ai <cmd>` resolves to a stale
// local node_modules bin (which never upgrades) or 404s when run outside a
// project. Every user-facing invocation must be the full, always-fresh
// `npx -y foodmax-ai-config@latest <cmd>` form.
const BARE_NPX = /npx foodmax-ai(?!-config)/;

// CI workflow is intentionally excluded: it `npm install`s the latest package
// first, so its `npx foodmax-ai verify` correctly runs the just-installed local
// bin.
const userFacingFiles = [
  'README.md',
  'src/lib/integrations.ts',
  'src/lib/changelog.ts',
];

for (const rel of userFacingFiles) {
  test(`${rel}: no bare \`npx foodmax-ai <cmd>\``, () => {
    const offending = readFileSync(join(repoRoot, rel), 'utf8')
      .split('\n')
      .map((line, i) => `${i + 1}: ${line}`)
      .filter((line) => BARE_NPX.test(line));
    expect(offending).toEqual([]);
  });
}
