import { createHash } from 'node:crypto';

export function sha256OfBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256OfString(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
