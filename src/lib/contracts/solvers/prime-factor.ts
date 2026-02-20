/** Find Largest Prime Factor — Trial division to sqrt(n) */
export function findLargestPrimeFactor(n: number): number {
  let factor = 2;
  let val = n;
  while (factor * factor <= val) {
    while (val % factor === 0) val /= factor;
    factor++;
  }
  return val > 1 ? val : factor - 1;
}
