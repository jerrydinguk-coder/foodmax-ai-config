const BEGIN_MARK = '<!-- BEGIN foodmax-ai -->';
const END_MARK = '<!-- END foodmax-ai -->';

export function mergeClaudeMd(existing: string, teamContent: string): string {
  const block = `${BEGIN_MARK}\n${teamContent.trimEnd()}\n${END_MARK}`;
  if (existing.includes(BEGIN_MARK) && existing.includes(END_MARK)) {
    const re = new RegExp(`${escapeRe(BEGIN_MARK)}[\\s\\S]*?${escapeRe(END_MARK)}`, 'm');
    return existing.replace(re, block);
  }
  if (existing.trim() === '') {
    return block + '\n';
  }
  return block + '\n\n' + existing;
}

export function mergeGitignore(existing: string, line: string): string {
  const lines = existing.split('\n');
  if (lines.some((l) => l.trim() === line)) {
    return existing;
  }
  const needsNL = existing.length > 0 && !existing.endsWith('\n');
  return existing + (needsNL ? '\n' : '') + line + '\n';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
