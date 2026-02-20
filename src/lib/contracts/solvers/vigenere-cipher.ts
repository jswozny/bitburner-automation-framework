/** Encryption II: Vigenere Cipher — Standard Vigenere on uppercase */
export function vigenereCipher(data: [string, string]): string {
  const [plaintext, keyword] = data;
  let result = "";
  for (let i = 0; i < plaintext.length; i++) {
    const pCode = plaintext.charCodeAt(i) - 65;
    const kCode = keyword.charCodeAt(i % keyword.length) - 65;
    result += String.fromCharCode(((pCode + kCode) % 26) + 65);
  }
  return result;
}
