/** HammingCodes: Integer to Encoded Binary — Parity bits at 2^k positions */
export function hammingEncode(value: number): string {
  const valBin = value.toString(2);
  const dataBits: number[] = [];
  for (const ch of valBin) dataBits.push(Number(ch));

  // Determine total length needed
  let r = 1;
  while ((1 << r) < dataBits.length + r + 1) r++;
  const totalLen = dataBits.length + r + 1; // +1 for overall parity at position 0

  const code = new Array(totalLen + 1).fill(0); // 1-indexed
  let dataIdx = dataBits.length - 1;

  // Place data bits (skip parity positions: powers of 2 and position 0)
  for (let pos = totalLen; pos >= 1; pos--) {
    if ((pos & (pos - 1)) === 0) continue; // power of 2 or 0
    code[pos] = dataBits[dataIdx--];
  }

  // Calculate parity bits
  for (let p = 0; p < r; p++) {
    const parityPos = 1 << p;
    let parity = 0;
    for (let j = parityPos; j <= totalLen; j++) {
      if (j & parityPos) parity ^= code[j];
    }
    code[parityPos] = parity;
  }

  // Overall parity (position 0)
  let overall = 0;
  for (let j = 1; j <= totalLen; j++) overall ^= code[j];
  code[0] = overall;

  // Build string from positions 0..totalLen
  let result = "";
  for (let i = 0; i <= totalLen; i++) result += code[i];
  return result;
}

/** HammingCodes: Encoded Binary to Integer — Detect/correct error, extract data */
export function hammingDecode(encoded: string): number {
  const bits: number[] = [];
  for (const ch of encoded) bits.push(Number(ch));
  const n = bits.length;

  // Find error position using parity bits
  let errorPos = 0;
  for (let p = 0; (1 << p) < n; p++) {
    const parityPos = 1 << p;
    let parity = 0;
    for (let j = parityPos; j < n; j++) {
      if (j & parityPos) parity ^= bits[j];
    }
    if (parity) errorPos += parityPos;
  }

  // Correct the error
  if (errorPos > 0 && errorPos < n) {
    bits[errorPos] ^= 1;
  }

  // Extract data bits (skip position 0 and powers of 2)
  let dataBin = "";
  for (let i = 1; i < n; i++) {
    if ((i & (i - 1)) !== 0) {
      dataBin += bits[i];
    }
  }

  return parseInt(dataBin, 2);
}
