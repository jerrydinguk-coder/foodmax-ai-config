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
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
