import semver from 'semver';

/**
 * Extract a semver string from arbitrary CLI version output.
 * Returns null if no semver found.
 */
export function parseClaudeVersion(stdout: string): string | null {
  // Match X.Y.Z optionally followed by -prerelease (drop +build).
  const m = stdout.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  if (!m) return null;
  const cleaned = semver.coerce(m[1], { includePrerelease: true });
  // semver.coerce drops prerelease; use the raw match if it parses.
  return semver.valid(m[1]) ?? cleaned?.version ?? null;
}

/**
 * semver.satisfies with prerelease allowance: a prerelease version like
 * 1.0.0-rc.1 is treated as satisfying >=1.0.0 by coercing the version
 * (dropping prerelease tag) before the range check.
 */
export function satisfies(version: string, range: string): boolean {
  const coerced = semver.coerce(version);
  const versionToCheck = coerced ? coerced.version : version;
  return semver.satisfies(versionToCheck, range);
}
