import { test, expect } from 'vitest';
import { sha256OfBuffer, sha256OfString } from '../src/lib/hash.js';

test('sha256 of empty buffer is deterministic and well-known', () => {
  expect(sha256OfBuffer(Buffer.from(''))).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

test('sha256 of "hello" is deterministic and well-known', () => {
  expect(sha256OfString('hello')).toBe(
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
  );
});

test('sha256 is sensitive to a single bit change', () => {
  const a = sha256OfString('abc');
  const b = sha256OfString('abd');
  expect(a).not.toBe(b);
});

test('sha256 preserves CRLF vs LF differences (no normalization)', () => {
  const lf = sha256OfString('line1\nline2');
  const crlf = sha256OfString('line1\r\nline2');
  expect(lf).not.toBe(crlf);
});
