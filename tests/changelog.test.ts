import { test, expect } from 'vitest';
import {
  prependChangelogEntry,
  parseLatestVersion,
  type ChangelogEntry,
} from '../src/lib/changelog.js';

test('prependChangelogEntry inserts after H1, preserves rest', () => {
  const existing = `# CHANGELOG\n\n## [1.0.0] - 2026-01-01\n\n### Added\n- thing\n`;
  const entry: ChangelogEntry = {
    version: '1.1.0',
    date: '2026-02-01',
    sections: {
      Added: ['new feature'],
      Fixed: ['bug 1', 'bug 2'],
    },
  };
  const result = prependChangelogEntry(existing, entry);
  expect(result).toMatch(/^# CHANGELOG/);
  const newIdx = result.indexOf('[1.1.0]');
  const oldIdx = result.indexOf('[1.0.0]');
  expect(newIdx).toBeGreaterThan(0);
  expect(newIdx).toBeLessThan(oldIdx);
  expect(result).toContain('### Added\n- new feature');
  expect(result).toContain('### Fixed\n- bug 1\n- bug 2');
});

test('prependChangelogEntry handles empty changelog (just H1)', () => {
  const existing = `# CHANGELOG\n`;
  const entry: ChangelogEntry = {
    version: '0.1.0',
    date: '2026-05-26',
    sections: { Added: ['initial release'] },
  };
  const result = prependChangelogEntry(existing, entry);
  expect(result).toContain('# CHANGELOG');
  expect(result).toContain('## [0.1.0] - 2026-05-26');
});

test('prependChangelogEntry omits empty sections', () => {
  const existing = `# CHANGELOG\n`;
  const entry: ChangelogEntry = {
    version: '1.0.0',
    date: '2026-05-26',
    sections: { Added: ['x'], Fixed: [], Removed: [] },
  };
  const result = prependChangelogEntry(existing, entry);
  expect(result).toContain('### Added');
  expect(result).not.toContain('### Fixed');
  expect(result).not.toContain('### Removed');
});

test('prependChangelogEntry includes special "MCP 参数变更" section when present', () => {
  const existing = `# CHANGELOG\n`;
  const entry: ChangelogEntry = {
    version: '1.0.0',
    date: '2026-05-26',
    sections: { Changed: ['x'], 'MCP 参数变更 ⚠️': ['playwright @latest → @1.0.5'] },
  };
  const result = prependChangelogEntry(existing, entry);
  expect(result).toContain('### MCP 参数变更 ⚠️');
  expect(result).toContain('playwright @latest → @1.0.5');
  expect(result).toMatch(/--force-mcp/);
});

test('parseLatestVersion returns first version found', () => {
  const md = `# CHANGELOG\n\n## [1.2.3] - 2026-05-26\n...\n## [1.0.0] - 2026-01-01\n`;
  expect(parseLatestVersion(md)).toBe('1.2.3');
});

test('parseLatestVersion returns null when no versions present', () => {
  expect(parseLatestVersion(`# CHANGELOG\n`)).toBeNull();
});
