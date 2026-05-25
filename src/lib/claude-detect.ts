import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
