/** Square Root — Newton's method with BigInt */
export function squareRoot(n: number | bigint): string {
  const big = BigInt(n);
  if (big < 0n) return "";
  if (big === 0n) return "0";

  let x = big;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + big / x) / 2n;
  }
  // x = floor(sqrt(big)); round to nearest integer
  if (big - x * x > x) return (x + 1n).toString();
  return x.toString();
}
