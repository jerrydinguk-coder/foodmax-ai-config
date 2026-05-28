import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const _exec = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export type Exec = (cmd: string, args: string[]) => Promise<ExecResult>;

export const defaultExec: Exec = async (cmd, args) => {
  const r = await _exec(cmd, args, { timeout: 60_000 });
  return { stdout: r.stdout, stderr: r.stderr };
};

/**
 * Turn a child_process rejection into a useful string. promisify(execFile)
 * rejects with an Error whose `.message` is only "Command failed: <cmd>" — the
 * actual diagnostic lives in `.stderr` (sometimes `.stdout`). We were dropping
 * that, which is why a teammate's `claude plugin marketplace add` failure
 * surfaced as a bare "Command failed" with no clue why.
 */
export function formatExecError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; stderr?: unknown; stdout?: unknown };
    const msg = typeof e.message === 'string' ? e.message : '';
    const detail = [e.stderr, e.stdout]
      .map((s) => (s == null ? '' : String(s).trim()))
      .find((s) => s.length > 0);
    if (msg && detail) return `${msg}\n${detail}`;
    return detail || msg || String(err);
  }
  return String(err);
}

export interface InstallOptions {
  source: string;
  marketplaceName: string;
  pluginName: string;
  scope: 'user' | 'project' | 'local';
  exec?: Exec;
}

export type InstallResult =
  | { ok: true }
  | { ok: false; error: string };

export async function installPlugin(opts: InstallOptions): Promise<InstallResult> {
  const exec = opts.exec ?? defaultExec;
  try {
    await exec('claude', ['plugin', 'marketplace', 'add', opts.source]);
    await exec('claude', [
      'plugin',
      'install',
      `${opts.pluginName}@${opts.marketplaceName}`,
      '--scope',
      opts.scope,
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatExecError(err) };
  }
}
