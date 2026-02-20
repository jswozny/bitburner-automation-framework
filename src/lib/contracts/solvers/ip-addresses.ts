/** Generate IP Addresses — Backtracking, 4 octets */
export function generateIPAddresses(s: string): string[] {
  const results: string[] = [];
  function bt(start: number, parts: string[]): void {
    if (parts.length === 4) {
      if (start === s.length) results.push(parts.join("."));
      return;
    }
    for (let len = 1; len <= 3; len++) {
      if (start + len > s.length) break;
      const seg = s.substring(start, start + len);
      if (seg.length > 1 && seg[0] === "0") break;
      if (Number(seg) > 255) break;
      parts.push(seg);
      bt(start + len, parts);
      parts.pop();
    }
  }
  bt(0, []);
  return results;
}
