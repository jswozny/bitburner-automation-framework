/** Unique Paths in a Grid I — Combinatorics C(r+c-2, r-1) */
export function uniquePathsI(data: number[]): number {
  const [rows, cols] = data;
  const n = rows + cols - 2;
  const k = Math.min(rows - 1, cols - 1);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

/** Unique Paths in a Grid II — DP grid (1=obstacle) */
export function uniquePathsII(grid: number[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const dp: number[] = new Array(cols).fill(0);
  dp[0] = grid[0][0] === 1 ? 0 : 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 1) {
        dp[c] = 0;
      } else if (c > 0) {
        dp[c] += dp[c - 1];
      }
    }
  }
  return dp[cols - 1];
}
