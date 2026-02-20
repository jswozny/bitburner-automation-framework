/** Subarray with Maximum Sum — Kadane's algorithm */
export function subarrayMaxSum(arr: number[]): number {
  let max = -Infinity;
  let cur = 0;
  for (const x of arr) {
    cur = Math.max(x, cur + x);
    max = Math.max(max, cur);
  }
  return max;
}
