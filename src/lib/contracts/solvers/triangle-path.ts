/** Minimum Path Sum in a Triangle — Bottom-up DP */
export function minPathSumTriangle(triangle: number[][]): number {
  const dp = [...triangle[triangle.length - 1]];
  for (let row = triangle.length - 2; row >= 0; row--) {
    for (let col = 0; col <= row; col++) {
      dp[col] = triangle[row][col] + Math.min(dp[col], dp[col + 1]);
    }
  }
  return dp[0];
}
