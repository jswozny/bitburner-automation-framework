/** Total Ways to Sum — Partition DP (exclude n itself) */
export function totalWaysToSum(n: number): number {
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1;
  for (let i = 1; i < n; i++) {
    for (let j = i; j <= n; j++) {
      dp[j] += dp[j - i];
    }
  }
  return dp[n];
}

/** Total Ways to Sum II — Coin-change DP */
export function totalWaysToSumII(data: [number, number[]]): number {
  const [target, coins] = data;
  const dp = new Array(target + 1).fill(0);
  dp[0] = 1;
  for (const coin of coins) {
    for (let j = coin; j <= target; j++) {
      dp[j] += dp[j - coin];
    }
  }
  return dp[target];
}
