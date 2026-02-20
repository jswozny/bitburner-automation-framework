/** Compression II: LZ Decompression — Parse literal/backref pairs */
export function lzDecompress(s: string): string {
  let result = "";
  let i = 0;
  let isLiteral = true;

  while (i < s.length) {
    const len = Number(s[i]);
    i++;

    if (len === 0) {
      isLiteral = !isLiteral;
      continue;
    }

    if (isLiteral) {
      result += s.substring(i, i + len);
      i += len;
    } else {
      const offset = Number(s[i]);
      i++;
      for (let j = 0; j < len; j++) {
        result += result[result.length - offset];
      }
    }

    isLiteral = !isLiteral;
  }

  return result;
}

/** Compression III: LZ Compression — DP optimal encoding */
export function lzCompress(s: string): string {
  if (s.length === 0) return "";
  const n = s.length;

  // dp[i][t] = shortest encoding of s[0..i) where t=0 means next chunk is literal, t=1 means backreference
  const INF = "x".repeat(n * 10);
  const dp: string[][] = Array.from({ length: n + 1 }, () => [INF, INF]);
  dp[0][0] = "";

  for (let i = 0; i <= n; i++) {
    for (let t = 0; t < 2; t++) {
      if (dp[i][t] === INF) continue;

      if (t === 0) {
        // Next chunk must be literal
        // Length 0 literal (skip) -> switch to backref
        const skip = dp[i][t] + "0";
        if (skip.length < dp[i][1].length) dp[i][1] = skip;

        // Literal of length 1..9
        for (let len = 1; len <= Math.min(9, n - i); len++) {
          const chunk = dp[i][t] + String(len) + s.substring(i, i + len);
          if (chunk.length < dp[i + len][1].length) {
            dp[i + len][1] = chunk;
          }
        }
      } else {
        // Next chunk must be backreference
        // Length 0 backref (skip) -> switch to literal
        const skip = dp[i][t] + "0";
        if (skip.length < dp[i][0].length) dp[i][0] = skip;

        // Backref of length 1..9
        for (let len = 1; len <= Math.min(9, n - i); len++) {
          for (let offset = 1; offset <= Math.min(9, i); offset++) {
            let match = true;
            for (let j = 0; j < len; j++) {
              if (s[i + j] !== s[i - offset + (j % offset)]) {
                match = false;
                break;
              }
            }
            if (match) {
              const chunk = dp[i][t] + String(len) + String(offset);
              if (chunk.length < dp[i + len][0].length) {
                dp[i + len][0] = chunk;
              }
            }
          }
        }
      }
    }
  }

  return dp[n][0].length <= dp[n][1].length ? dp[n][0] : dp[n][1];
}
