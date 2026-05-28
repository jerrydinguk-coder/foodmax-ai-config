export function mergeGitignore(existing: string, line: string): string {
  const lines = existing.split('\n');
  if (lines.some((l) => l.trim() === line)) {
    return existing;
  }
  const needsNL = existing.length > 0 && !existing.endsWith('\n');
  return existing + (needsNL ? '\n' : '') + line + '\n';
}
