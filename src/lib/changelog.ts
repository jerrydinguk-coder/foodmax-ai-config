export interface ChangelogEntry {
  version: string;
  date: string;  // YYYY-MM-DD
  sections: Record<string, string[]>;
}

const MCP_SECTION_KEY_PATTERN = /MCP\s*参数变更/;
const MCP_FORCE_MCP_NOTE =
  '\n> ⚠️ 上面这条修改了 MCP 注册参数，请同事用 `npx foodmax-ai update --force-mcp` 升级。';

export function prependChangelogEntry(existing: string, entry: ChangelogEntry): string {
  const lines: string[] = [`## [${entry.version}] - ${entry.date}`, ''];

  for (const [section, items] of Object.entries(entry.sections)) {
    if (items.length === 0) continue;
    lines.push(`### ${section}`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    if (MCP_SECTION_KEY_PATTERN.test(section)) {
      lines.push(MCP_FORCE_MCP_NOTE);
    }
    lines.push('');
  }

  const entryMd = lines.join('\n');

  // Find H1 line; insert entry after it
  const h1Match = existing.match(/^# .+$/m);
  if (!h1Match) {
    return `# CHANGELOG\n\n${entryMd}\n${existing}`.replace(/\n{3,}/g, '\n\n');
  }
  const h1End = (h1Match.index ?? 0) + h1Match[0].length;
  const before = existing.slice(0, h1End);
  const after = existing.slice(h1End);
  return `${before}\n\n${entryMd}\n${after}`.replace(/\n{3,}/g, '\n\n');
}

export function parseLatestVersion(md: string): string | null {
  // Matches both `## [X.Y.Z]` (our prependChangelogEntry) and `## X.Y.Z`
  // (changesets default writer).
  const m = md.match(/^##\s+\[?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\]?/m);
  return m?.[1] ?? null;
}
