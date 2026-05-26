import type { VersionsJson } from './versions.js';
import { warnIfDeprecated } from './deprecation.js';

export interface StartupBannerDeps {
  /** Returns the project lockfile's packageVersion, or null if no lockfile. */
  readProjectLockfileVersion: () => Promise<string | null>;
  /** Returns the parsed versions.json, or null if fetch failed/timed out. */
  fetchVersionsWithTimeout: () => Promise<VersionsJson | null>;
}

export async function showStartupBannerIfDeprecated(deps: StartupBannerDeps): Promise<void> {
  const projectVersion = await deps.readProjectLockfileVersion();
  if (!projectVersion) return; // not init-ed, nothing to check
  const versions = await deps.fetchVersionsWithTimeout();
  if (!versions) return; // offline / fetch failed; stay quiet
  warnIfDeprecated(versions, projectVersion);
}
