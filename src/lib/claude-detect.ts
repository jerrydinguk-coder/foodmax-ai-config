import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseClaudeVersion, satisfies } from './semver-util.js';

const exec = promisify(execFile);

export type DetectResult =
  | { ok: true; version: string }
  | { ok: false; error: string };

export interface DetectOptions {
  cmd?: string;
}

export async function detectClaudeCli(opts: DetectOptions = {}): Promise<DetectResult> {
  const cmd = opts.cmd ?? 'claude';
  try {
    const { stdout } = await exec(cmd, ['--version'], { timeout: 5000 });
    return { ok: true, version: stdout.trim() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export function parseDetectResultVersion(r: DetectResult): string | null {
  if (!r.ok) return null;
  return parseClaudeVersion(r.version);
}

export type RequireResult =
  | { ok: true; version: string }
  | { ok: false; reason: string };

export function requireClaudeVersion(r: DetectResult, range: string): RequireResult {
  if (!r.ok) {
    return { ok: false, reason: `Claude Code not detected (${r.error})` };
  }
  const parsed = parseClaudeVersion(r.version);
  if (!parsed) {
    return { ok: false, reason: `failed to parse Claude Code version: "${r.version}"` };
  }
  if (!satisfies(parsed, range)) {
    return {
      ok: false,
      reason: `Claude Code ${parsed} does not satisfy required range ${range}. Upgrade Claude Code from https://claude.com/claude-code`,
    };
  }
  return { ok: true, version: parsed };
}
