/** Compression I: RLE Compression — Run-length encode (split runs >9) */
export function rleCompress(s: string): string {
  let result = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    let count = 0;
    while (i < s.length && s[i] === ch) {
      count++;
      i++;
    }
    while (count > 9) {
      result += "9" + ch;
      count -= 9;
    }
    result += String(count) + ch;
  }
  return result;
}
