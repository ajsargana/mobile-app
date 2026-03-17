/**
 * MiningHashWorklet.ts
 *
 * All functions here are Reanimated worklets — the Babel plugin serialises them
 * so they can run on a dedicated background thread via react-native-multithreading.
 *
 * Rules for worklet code:
 *   • No imports / require() inside the function body
 *   • No async / await
 *   • No native-module calls (no bridge, no JSI from other packages)
 *   • Only pure JS arithmetic and captured primitive values
 */

// ─── Inline SHA-256 ───────────────────────────────────────────────────────────
// Standard SHA-256 in pure JS arithmetic — no dependencies, fully self-contained.
// Output matches js-sha256 and expo-crypto for the same input.

function sha256Worklet(str: string): string {
  'worklet';

  // UTF-8 encode (handles ASCII and multi-byte characters)
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }

  // SHA-256 round constants
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Padding
  const msgLen = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = msgLen * 8;
  // Append bit-length as 64-bit big-endian (only lower 32 bits needed for mobile messages)
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

  // Initial hash values
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  // Process each 512-bit block
  for (let i = 0; i < bytes.length; i += 64) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) {
      w[j] = ((bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) |
               (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3]) >>> 0;
    }
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j-15] >>> 7) | (w[j-15] << 25)) ^
                 ((w[j-15] >>> 18) | (w[j-15] << 14)) ^ (w[j-15] >>> 3);
      const s1 = ((w[j-2] >>> 17) | (w[j-2] << 15)) ^
                 ((w[j-2] >>> 19) | (w[j-2] << 13)) ^ (w[j-2] >>> 10);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let j = 0; j < 64; j++) {
      const S1  = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch  = (e & f) ^ (~e & g);
      const t1  = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0  = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2  = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const hex8 = (n: number) => ('00000000' + ((n >>> 0).toString(16))).slice(-8);
  return hex8(h0) + hex8(h1) + hex8(h2) + hex8(h3) + hex8(h4) + hex8(h5) + hex8(h6) + hex8(h7);
}

// ─── Mining batch worklet ─────────────────────────────────────────────────────
// Runs on the background thread. Tries `batchSize` random nonces and returns
// immediately on first valid hash, or after exhausting the batch.
//
// Target comparison: lexicographic on 64-char lowercase hex strings is equivalent
// to numeric comparison for SHA-256 output (same length, same charset).

export interface MiningBatchResult {
  found: boolean;
  hash: string;
  nonce: number;
  count: number; // actual hashes computed this batch
}

export function miningBatchWorklet(
  blockData: string,      // "height|prevHash|merkleRoot|timestamp"
  targetThreshold: string, // 64-char lowercase hex
  batchSize: number,
): MiningBatchResult {
  'worklet';

  for (let i = 0; i < batchSize; i++) {
    const nonce = Math.floor(Math.random() * 100_000_000);
    // Format matches server: blockData + '|' + nonce  (same as computeHash)
    const hash  = sha256Worklet(blockData + '|' + nonce.toString());

    // Lexicographic comparison — valid for same-length lowercase hex
    if (hash <= targetThreshold) {
      return { found: true, hash, nonce, count: i + 1 };
    }
  }

  return { found: false, hash: '', nonce: 0, count: batchSize };
}
