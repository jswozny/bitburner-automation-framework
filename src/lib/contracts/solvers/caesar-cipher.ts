/** Encryption I: Caesar Cipher — Shift uppercase left by n */
export function caesarCipher(data: [string, number]): string {
  const [plaintext, shift] = data;
  let result = "";
  for (const ch of plaintext) {
    if (ch >= "A" && ch <= "Z") {
      const code = ((ch.charCodeAt(0) - 65 - shift % 26) + 26) % 26;
      result += String.fromCharCode(code + 65);
    } else {
      result += ch;
    }
  }
  return result;
}
