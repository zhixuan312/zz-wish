import { createHash, webcrypto } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { sha256, sha256Fallback } from '../../../web/src/engine/baked/sha256.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const encode = (text: string) => new TextEncoder().encode(text);
const vectors = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ['a'.repeat(64), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
];
test.each(vectors)('CPU SHA-256 matches the published vector for %j', (text, expected) => {
  expect(sha256Fallback(encode(text))).toBe(expected);
});

test('CPU SHA-256 handles padding boundaries, binary bytes and offset views', () => {
  for (const length of [55,56,63,64,65,119,120,127,128,129,1024 * 1024 + 1]) {
    const backing = Uint8Array.from({ length: length + 19 }, (_, i) => (i * 137 + 29) & 255);
    const input = backing.subarray(7, length + 7);
    expect(sha256Fallback(input)).toBe(createHash('sha256').update(input).digest('hex'));
  }
});

test('plain HTTP without SubtleCrypto still verifies downloads', async () => {
  vi.stubGlobal('crypto', undefined);
  expect(await sha256(encode('abc'))).toBe(vectors[1][1]);
});

test('native SubtleCrypto is preferred when it works', async () => {
  const digest = vi.fn((algorithm: string, input: Uint8Array<ArrayBuffer>) => webcrypto.subtle.digest(algorithm, input));
  vi.stubGlobal('crypto', { subtle: { digest } });
  expect(await sha256(encode('abc').buffer)).toBe(vectors[1][1]);
  expect(digest).toHaveBeenCalledOnce();
});

test('an exposed but denied native API falls back to CPU', async () => {
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async () => { throw new Error('Unavailable in this context'); }) } });
  expect(await sha256(encode('abc'))).toBe(vectors[1][1]);
});
