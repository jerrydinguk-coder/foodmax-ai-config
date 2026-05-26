import type { VersionsJson, DeprecatedEntry } from './versions.js';
import { checkDeprecated } from './versions.js';

/**
 * Print a console.warn line if the version is in the deprecated list.
 * Severity-agnostic: warns for both 'warn' and 'block' entries. Use this
 * alongside {@link requireNotBlocked} when you also want hard-fail behavior.
 *
 * `version` must be a bare semver string (no `v` prefix) — same shape as
 * what `resolveVersion()` returns.
 */
export function warnIfDeprecated(v: VersionsJson, version: string): DeprecatedEntry | null {
  const entry = checkDeprecated(v, version);
  if (!entry) return null;
  const sev = entry.severity ?? 'warn';
  const prefix = sev === 'block' ? '🚫 BLOCKED' : '⚠️  DEPRECATED';
  console.warn(
    `${prefix}: v${entry.version} — ${entry.reason}. Fixed in v${entry.fixedIn} (deprecated ${entry.deprecatedAt}).`
  );
  return entry;
}

/**
 * Throw if the version is deprecated with severity='block'.
 * Used by init/update to refuse installation of known-broken versions.
 *
 * `version` must be a bare semver string (no `v` prefix) — same shape as
 * what `resolveVersion()` returns.
 */
export function requireNotBlocked(v: VersionsJson, version: string): void {
  const entry = checkDeprecated(v, version);
  if (!entry) return;
  if (entry.severity === 'block') {
    throw new Error(
      `v${entry.version} is BLOCKED: ${entry.reason}. ` +
        `You must upgrade to v${entry.fixedIn} or later. ` +
        `Run: npx foodmax-ai update --version ${entry.fixedIn}`
    );
  }
}
